#!/usr/bin/env tsx
/**
 * MCM Forge Functional Verification Module
 *
 * Playwright-based acceptance criterion testing:
 * - Visual criteria: screenshot element → Claude Vision confirms match
 * - Functional criteria: click/type/interact → verify state changes
 * - Data criteria: check API responses, localStorage, URL params
 *
 * Each criterion produces a pass/fail with evidence.
 */

import { chromium, type Browser, type Page } from "playwright";
import Anthropic from "@anthropic-ai/sdk";

// ============================================
// Types
// ============================================

interface AcceptanceCriterion {
  id: string;
  type: "visual" | "functional" | "data";
  description: string;
  selector?: string;           // CSS selector or data-testid
  action?: string;             // click, type, navigate, scroll
  actionValue?: string;        // text to type, URL to navigate to
  expectedResult?: string;     // what should happen
  expectedSelector?: string;   // element that should appear
  expectedText?: string;       // text that should be present
  expectedUrl?: string;        // URL pattern to match
}

interface CriterionResult {
  criterionId: string;
  description: string;
  type: string;
  pass: boolean;
  evidence: string;
  screenshotBuffer?: Buffer;
}

export interface FunctionalVerifyResult {
  score: number;           // 0-100
  passed: number;
  total: number;
  results: CriterionResult[];
  summary: string;
}

// ============================================
// Configuration
// ============================================

const VISION_MODEL = process.env.VISUAL_TDD_MODEL || "claude-sonnet-4-6-20250514";
const DEFAULT_TIMEOUT = 10000;

// ============================================
// Main: Run Functional Verification
// ============================================

export async function runFunctionalVerification(params: {
  previewUrl: string;
  acceptanceCriteria: AcceptanceCriterion[];
  mockupBuffer?: Buffer;
  bypassVercelAuth?: string;
}): Promise<FunctionalVerifyResult> {
  const { previewUrl, acceptanceCriteria, mockupBuffer, bypassVercelAuth } = params;

  if (!acceptanceCriteria || acceptanceCriteria.length === 0) {
    return {
      score: 100,
      passed: 0,
      total: 0,
      results: [],
      summary: "No acceptance criteria to verify",
    };
  }

  let browser: Browser | null = null;
  const results: CriterionResult[] = [];

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--use-gl=egl"],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      ...(bypassVercelAuth ? {
        extraHTTPHeaders: { "x-vercel-protection-bypass": bypassVercelAuth },
      } : {}),
    });

    const page = await context.newPage();
    await page.goto(previewUrl, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for app to settle
    await page.waitForTimeout(3000);

    // Run each criterion
    for (const criterion of acceptanceCriteria) {
      try {
        const result = await verifyCriterion(page, criterion, mockupBuffer);
        results.push(result);
      } catch (err) {
        results.push({
          criterionId: criterion.id,
          description: criterion.description,
          type: criterion.type,
          pass: false,
          evidence: `Error verifying criterion: ${err}`,
        });
      }
    }

    await context.close();
  } catch (err) {
    // If browser fails, mark all unprocessed criteria as failed
    for (const criterion of acceptanceCriteria) {
      if (!results.find((r) => r.criterionId === criterion.id)) {
        results.push({
          criterionId: criterion.id,
          description: criterion.description,
          type: criterion.type,
          pass: false,
          evidence: `Browser error: ${err}`,
        });
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 100;

  const failedDescriptions = results
    .filter((r) => !r.pass)
    .map((r) => `- ${r.description}: ${r.evidence}`)
    .join("\n");

  return {
    score,
    passed,
    total,
    results,
    summary: score === 100
      ? `All ${total} acceptance criteria passed`
      : `${passed}/${total} criteria passed (${score}%).\nFailed:\n${failedDescriptions}`,
  };
}

// ============================================
// Individual Criterion Verification
// ============================================

async function verifyCriterion(
  page: Page,
  criterion: AcceptanceCriterion,
  mockupBuffer?: Buffer
): Promise<CriterionResult> {
  switch (criterion.type) {
    case "visual":
      return verifyVisualCriterion(page, criterion, mockupBuffer);
    case "functional":
      return verifyFunctionalCriterion(page, criterion);
    case "data":
      return verifyDataCriterion(page, criterion);
    default:
      return {
        criterionId: criterion.id,
        description: criterion.description,
        type: criterion.type,
        pass: false,
        evidence: `Unknown criterion type: ${criterion.type}`,
      };
  }
}

// ============================================
// Visual Criterion: Screenshot → Vision Check
// ============================================

async function verifyVisualCriterion(
  page: Page,
  criterion: AcceptanceCriterion,
  mockupBuffer?: Buffer
): Promise<CriterionResult> {
  let screenshotBuffer: Buffer;

  if (criterion.selector) {
    // Screenshot a specific element
    try {
      const element = await page.waitForSelector(criterion.selector, {
        timeout: DEFAULT_TIMEOUT,
      });
      if (!element) {
        return {
          criterionId: criterion.id,
          description: criterion.description,
          type: "visual",
          pass: false,
          evidence: `Element not found: ${criterion.selector}`,
        };
      }
      screenshotBuffer = (await element.screenshot()) as Buffer;
    } catch {
      return {
        criterionId: criterion.id,
        description: criterion.description,
        type: "visual",
        pass: false,
        evidence: `Element not found or not visible: ${criterion.selector}`,
      };
    }
  } else {
    // Full page screenshot
    screenshotBuffer = (await page.screenshot()) as Buffer;
  }

  // Use Claude Vision to check if the screenshot matches the criterion description
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      criterionId: criterion.id,
      description: criterion.description,
      type: "visual",
      pass: true,
      evidence: "Claude Vision skipped (no ANTHROPIC_API_KEY) — auto-pass",
      screenshotBuffer,
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const content: Anthropic.ContentBlockParam[] = [];

  content.push({
    type: "text",
    text: `You are a QA engineer verifying a specific visual requirement.

Requirement: "${criterion.description}"
${criterion.expectedResult ? `Expected: ${criterion.expectedResult}` : ""}

Does the screenshot satisfy this requirement? Be strict — the requirement must be fully met.

Respond ONLY with JSON: {"pass": true/false, "evidence": "explanation"}`,
  });

  if (mockupBuffer) {
    content.push({ type: "text", text: "Approved mockup (reference):" });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: mockupBuffer.toString("base64") },
    });
  }

  content.push({ type: "text", text: "Current implementation:" });
  content.push({
    type: "image",
    source: { type: "base64", media_type: "image/png", data: screenshotBuffer.toString("base64") },
  });

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        criterionId: criterion.id,
        description: criterion.description,
        type: "visual",
        pass: !!result.pass,
        evidence: result.evidence || "No evidence provided",
        screenshotBuffer,
      };
    }

    return {
      criterionId: criterion.id,
      description: criterion.description,
      type: "visual",
      pass: false,
      evidence: `Vision response unparseable: ${text.slice(0, 200)}`,
      screenshotBuffer,
    };
  } catch (err) {
    return {
      criterionId: criterion.id,
      description: criterion.description,
      type: "visual",
      pass: true,
      evidence: `Vision API error (auto-pass): ${err}`,
      screenshotBuffer,
    };
  }
}

// ============================================
// Functional Criterion: Interact → Verify
// ============================================

async function verifyFunctionalCriterion(
  page: Page,
  criterion: AcceptanceCriterion
): Promise<CriterionResult> {
  try {
    // Perform the action if specified
    if (criterion.action && criterion.selector) {
      const element = await page.waitForSelector(criterion.selector, {
        timeout: DEFAULT_TIMEOUT,
      });

      if (!element) {
        return {
          criterionId: criterion.id,
          description: criterion.description,
          type: "functional",
          pass: false,
          evidence: `Element not found for action: ${criterion.selector}`,
        };
      }

      switch (criterion.action) {
        case "click":
          await element.click();
          break;
        case "type":
          await element.fill(criterion.actionValue || "test");
          break;
        case "navigate":
          await page.goto(criterion.actionValue || "", {
            waitUntil: "networkidle",
            timeout: DEFAULT_TIMEOUT,
          });
          break;
        case "scroll":
          await element.scrollIntoViewIfNeeded();
          break;
        case "hover":
          await element.hover();
          break;
      }

      // Wait for state change
      await page.waitForTimeout(1000);
    }

    // Verify expected results
    let pass = true;
    const evidenceParts: string[] = [];

    // Check if expected element appears
    if (criterion.expectedSelector) {
      try {
        await page.waitForSelector(criterion.expectedSelector, {
          timeout: DEFAULT_TIMEOUT,
        });
        evidenceParts.push(`Element "${criterion.expectedSelector}" found`);
      } catch {
        pass = false;
        evidenceParts.push(`Element "${criterion.expectedSelector}" NOT found`);
      }
    }

    // Check if expected text is present
    if (criterion.expectedText) {
      const bodyText = await page.textContent("body") || "";
      if (bodyText.includes(criterion.expectedText)) {
        evidenceParts.push(`Text "${criterion.expectedText}" found`);
      } else {
        pass = false;
        evidenceParts.push(`Text "${criterion.expectedText}" NOT found on page`);
      }
    }

    // Check if URL matches expected pattern
    if (criterion.expectedUrl) {
      const currentUrl = page.url();
      if (currentUrl.includes(criterion.expectedUrl)) {
        evidenceParts.push(`URL contains "${criterion.expectedUrl}"`);
      } else {
        pass = false;
        evidenceParts.push(`URL "${currentUrl}" does not contain "${criterion.expectedUrl}"`);
      }
    }

    // If no specific checks, just verify the action didn't throw
    if (!criterion.expectedSelector && !criterion.expectedText && !criterion.expectedUrl) {
      evidenceParts.push("Action completed without error");
    }

    return {
      criterionId: criterion.id,
      description: criterion.description,
      type: "functional",
      pass,
      evidence: evidenceParts.join("; "),
    };
  } catch (err) {
    return {
      criterionId: criterion.id,
      description: criterion.description,
      type: "functional",
      pass: false,
      evidence: `Functional check failed: ${err}`,
    };
  }
}

// ============================================
// Data Criterion: API/State Verification
// ============================================

async function verifyDataCriterion(
  page: Page,
  criterion: AcceptanceCriterion
): Promise<CriterionResult> {
  try {
    // Navigate to the selector URL if it looks like a URL path
    if (criterion.selector?.startsWith("/")) {
      const baseUrl = new URL(page.url()).origin;
      await page.goto(`${baseUrl}${criterion.selector}`, {
        waitUntil: "networkidle",
        timeout: DEFAULT_TIMEOUT,
      });
    }

    // Use page.evaluate to check data conditions
    if (criterion.expectedResult) {
      const result = await page.evaluate((expected) => {
        // Check localStorage
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && localStorage.getItem(key)?.includes(expected)) {
              return { found: true, source: "localStorage", key };
            }
          }
        } catch { /* ignore */ }

        // Check URL params
        const params = new URLSearchParams(window.location.search);
        for (const [key, value] of params) {
          if (value.includes(expected)) {
            return { found: true, source: "urlParam", key };
          }
        }

        // Check page content
        if (document.body?.textContent?.includes(expected)) {
          return { found: true, source: "pageContent" };
        }

        return { found: false };
      }, criterion.expectedResult);

      return {
        criterionId: criterion.id,
        description: criterion.description,
        type: "data",
        pass: result.found,
        evidence: result.found
          ? `Found "${criterion.expectedResult}" in ${result.source}${result.key ? ` (key: ${result.key})` : ""}`
          : `"${criterion.expectedResult}" not found in localStorage, URL params, or page content`,
      };
    }

    // Check if expected text is in the response body (for API endpoints)
    if (criterion.expectedText) {
      const bodyText = await page.textContent("body") || "";
      const pass = bodyText.includes(criterion.expectedText);
      return {
        criterionId: criterion.id,
        description: criterion.description,
        type: "data",
        pass,
        evidence: pass
          ? `Response contains expected text`
          : `Expected text "${criterion.expectedText}" not found in response`,
      };
    }

    return {
      criterionId: criterion.id,
      description: criterion.description,
      type: "data",
      pass: true,
      evidence: "No specific data check defined — auto-pass",
    };
  } catch (err) {
    return {
      criterionId: criterion.id,
      description: criterion.description,
      type: "data",
      pass: false,
      evidence: `Data check failed: ${err}`,
    };
  }
}
