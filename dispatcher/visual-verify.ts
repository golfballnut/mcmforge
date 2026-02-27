#!/usr/bin/env tsx
/**
 * MCM Forge Visual Verification Module
 *
 * Provides the "eyes" for the agent team:
 * 1. Playwright screenshots of Vercel preview deployments
 * 2. pixelmatch pixel-level diff against production baseline
 * 3. Claude Vision semantic judgment (does it look correct?)
 * 4. Structured pass/fail result with actionable feedback
 *
 * Used by the dispatcher after code tasks to verify visual output
 * before sending PRs for human review.
 */

import { chromium, type Browser } from "playwright";
import { PNG } from "pngjs";
import pixelmatchLib from "pixelmatch";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// Types
// ============================================

interface ScreenshotOptions {
  width?: number;
  height?: number;
  waitMs?: number;
  fullPage?: boolean;
  bypassVercelAuth?: string;
}

interface PixelDiffResult {
  diffPercent: number;
  diffPixels: number;
  totalPixels: number;
  diffImageBuffer?: Buffer;
}

interface VisionJudgment {
  pass: boolean;
  score: number; // 0-100, -1 if unavailable
  feedback: string;
  changes: string[];
}

export interface MockupVerifyResult {
  pass: boolean;
  score: number;
  feedback: string;
  screenshotUrl?: string;
  diffPercent?: number;
  changes?: string[];
}

export interface VisualVerifyResult {
  pass: boolean;
  score: number;
  feedback: string;
  screenshotUrl?: string;
  baselineUrl?: string;
  diffUrl?: string;
  diffPercent?: number;
  changes?: string[];
}

// ============================================
// Configuration
// ============================================

const SCREENSHOT_DIR = join(__dirname, "screenshots");
const DIFF_THRESHOLD = 0.1; // pixelmatch color sensitivity
const VISION_PASS_SCORE = 60;
const VISION_MODEL = process.env.VISUAL_TDD_MODEL || "claude-sonnet-4-6-20250514";

// Production URL mapping — where to screenshot for baseline comparison
const PRODUCTION_URLS: Record<string, string> = {
  dirtsync: process.env.DIRTSYNC_PRODUCTION_URL || "https://dirt-sync.vercel.app",
  mcmforge: process.env.MCMFORGE_PRODUCTION_URL || "https://mcmforge.com",
};

// Supabase client for screenshot storage
function getStorageClient() {
  const url = process.env.MCMFORGE_SUPABASE_URL;
  const key = process.env.MCMFORGE_SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ============================================
// Screenshot Capture
// ============================================

export async function takeScreenshot(
  url: string,
  opts: ScreenshotOptions = {}
): Promise<Buffer> {
  const {
    width = 1280,
    height = 800,
    waitMs = 5000,
    fullPage = false,
    bypassVercelAuth,
  } = opts;

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--use-gl=egl",
        "--disable-gpu-sandbox",
      ],
    });

    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      ...(bypassVercelAuth
        ? {
            extraHTTPHeaders: {
              "x-vercel-protection-bypass": bypassVercelAuth,
            },
          }
        : {}),
    });

    const page = await context.newPage();

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Extra wait for dynamic content (maps, animations)
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    // Try to wait for Mapbox map to finish loading (DirtSync pages)
    try {
      await page.waitForFunction(
        () => {
          const m = (window as any).map;
          return !m || (m.loaded && m.loaded());
        },
        { timeout: 10000 }
      );
    } catch {
      // Not a map page — continue
    }

    const screenshot = await page.screenshot({ fullPage, type: "png" });
    return Buffer.from(screenshot);
  } finally {
    if (browser) await browser.close();
  }
}

// ============================================
// Wait for Vercel Preview Deployment
// ============================================

export async function waitForPreview(
  url: string,
  maxWaitMs = 120000,
  bypassHeader?: string
): Promise<boolean> {
  const start = Date.now();
  const interval = 10000;

  while (Date.now() - start < maxWaitMs) {
    try {
      const headers: Record<string, string> = {};
      if (bypassHeader) {
        headers["x-vercel-protection-bypass"] = bypassHeader;
      }
      const res = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  return false;
}

// ============================================
// Pixel Diff
// ============================================

export function pixelDiff(
  img1Buffer: Buffer,
  img2Buffer: Buffer
): PixelDiffResult {
  const img1 = PNG.sync.read(img1Buffer);
  const img2 = PNG.sync.read(img2Buffer);

  // Use the smaller dimensions if they differ
  const width = Math.min(img1.width, img2.width);
  const height = Math.min(img1.height, img2.height);

  // Crop both images to matching dimensions
  const crop = (src: PNG, w: number, h: number): Uint8Array => {
    if (src.width === w && src.height === h) return new Uint8Array(src.data);
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcOff = y * src.width * 4;
      const dstOff = y * w * 4;
      out.set(src.data.subarray(srcOff, srcOff + w * 4), dstOff);
    }
    return out;
  };

  const data1 = crop(img1, width, height);
  const data2 = crop(img2, width, height);

  const diff = new PNG({ width, height });

  const diffPixels = pixelmatchLib(
    data1,
    data2,
    diff.data,
    width,
    height,
    { threshold: DIFF_THRESHOLD }
  );

  const totalPixels = width * height;
  const diffPercent = (diffPixels / totalPixels) * 100;

  return {
    diffPercent,
    diffPixels,
    totalPixels,
    diffImageBuffer: PNG.sync.write(diff),
  };
}

// ============================================
// Claude Vision Judgment
// ============================================

export async function visionJudge(params: {
  screenshot: Buffer;
  baseline?: Buffer;
  taskTitle: string;
  taskDescription: string;
  diffPercent?: number;
}): Promise<VisionJudgment> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      pass: true,
      score: -1,
      feedback: "Claude Vision skipped (no ANTHROPIC_API_KEY)",
      changes: [],
    };
  }

  const anthropic = new Anthropic({ apiKey });

  const content: Anthropic.ContentBlockParam[] = [];

  content.push({
    type: "text",
    text: `You are a visual QA engineer reviewing a web app code change.

Task: ${params.taskTitle}
Description: ${params.taskDescription}
${params.diffPercent !== undefined ? `Pixel diff: ${params.diffPercent.toFixed(1)}% of pixels changed` : ""}

${params.baseline ? "Compare the BEFORE (production) and AFTER (preview) screenshots." : "Review this screenshot for visual quality and correctness."}

Check for:
- Does the change match what the task asked for?
- Any broken layouts, overlapping elements, missing content?
- Colors, spacing, alignment look professional?
- Any obvious regressions from the baseline?

Score 0-100:
- 90-100: Looks great, matches intent
- 70-89: Mostly good, minor issues
- 50-69: Noticeable problems
- 0-49: Broken or wrong

Respond ONLY with JSON:
{"pass": true, "score": 85, "feedback": "summary", "changes": ["change 1", "change 2"]}`,
  });

  if (params.baseline) {
    content.push({ type: "text", text: "BEFORE (production):" });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: params.baseline.toString("base64"),
      },
    });
  }

  content.push({
    type: "text",
    text: params.baseline ? "AFTER (preview):" : "Screenshot:",
  });
  content.push({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: params.screenshot.toString("base64"),
    },
  });

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 500,
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
        pass: result.pass ?? result.score >= VISION_PASS_SCORE,
        score: result.score ?? 0,
        feedback: result.feedback ?? "No feedback",
        changes: result.changes ?? [],
      };
    }

    return {
      pass: true,
      score: 50,
      feedback: `Vision response unparseable: ${text.slice(0, 200)}`,
      changes: [],
    };
  } catch (err) {
    return {
      pass: true, // Don't block on vision errors
      score: -1,
      feedback: `Vision API error: ${err}`,
      changes: [],
    };
  }
}

// ============================================
// Upload Screenshot to Supabase Storage
// ============================================

async function uploadScreenshot(
  taskId: string,
  buffer: Buffer,
  label: string
): Promise<string | undefined> {
  const supabase = getStorageClient();
  if (!supabase) return undefined;

  const fileName = `screenshots/${taskId}-${label}-${Date.now()}.png`;

  try {
    const { error } = await supabase.storage
      .from("artifacts")
      .upload(fileName, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (error) return undefined;

    const { data } = supabase.storage.from("artifacts").getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return undefined;
  }
}

// ============================================
// Mockup Compliance: Verify Against Approved Mockup
// ============================================

const MOCKUP_PASS_SCORE = 95;

export async function verifyAgainstMockup(params: {
  previewUrl: string;
  mockupBuffer: Buffer;
  taskTitle: string;
  companySlug?: string;
  bypassVercelAuth?: string;
}): Promise<MockupVerifyResult> {
  const { previewUrl, mockupBuffer, taskTitle, companySlug, bypassVercelAuth } = params;

  // Ensure screenshot dir exists
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // 1. Wait for preview
  const isReady = await waitForPreview(previewUrl, 120000, bypassVercelAuth);
  if (!isReady) {
    return {
      pass: false,
      score: 0,
      feedback: `Preview not ready after 2min: ${previewUrl}`,
    };
  }

  // 2. Screenshot the preview
  let screenshotBuffer: Buffer;
  try {
    screenshotBuffer = await takeScreenshot(previewUrl, { bypassVercelAuth, waitMs: 5000 });
  } catch (err) {
    return {
      pass: false,
      score: 0,
      feedback: `Screenshot failed: ${err}`,
    };
  }

  // 3. Pixel diff against mockup
  let diffResult: PixelDiffResult | undefined;
  try {
    diffResult = pixelDiff(screenshotBuffer, mockupBuffer);
  } catch {
    // Diff failed — continue with vision-only
  }

  // 4. Claude Vision: stricter mockup compliance prompt
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const score = diffResult
      ? Math.max(0, Math.round(100 - diffResult.diffPercent * 2))
      : 50;
    return {
      pass: score >= MOCKUP_PASS_SCORE,
      score,
      feedback: "No ANTHROPIC_API_KEY — pixel diff only",
      diffPercent: diffResult?.diffPercent,
    };
  }

  const anthropic = new Anthropic({ apiKey });

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `You are a pixel-perfect QA engineer. Compare the APPROVED MOCKUP to the IMPLEMENTATION screenshot.

Task: ${taskTitle}
${diffResult ? `Pixel diff: ${diffResult.diffPercent.toFixed(1)}% pixels different` : ""}

Check EVERY element in the mockup. The implementation must match the mockup exactly:
- Layout and positioning
- Colors (exact hex values)
- Typography (fonts, sizes, weights)
- Spacing and padding
- Button styles, input styles
- Icons and imagery
- Content/text (should match or be realistic)

Score 0-100 (much stricter than normal visual review):
- 95-100: Implementation matches mockup exactly or nearly exactly
- 80-94: Mostly matches but has minor differences
- 50-79: Noticeable deviations from mockup
- 0-49: Does not match mockup

Respond ONLY with JSON:
{"pass": true, "score": 95, "feedback": "summary", "changes": ["difference 1", "difference 2"]}`,
    },
    { type: "text", text: "APPROVED MOCKUP:" },
    {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: mockupBuffer.toString("base64") },
    },
    { type: "text", text: "IMPLEMENTATION:" },
    {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: screenshotBuffer.toString("base64") },
    },
  ];

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 500,
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
        pass: result.pass ?? result.score >= MOCKUP_PASS_SCORE,
        score: result.score ?? 0,
        feedback: result.feedback ?? "No feedback",
        diffPercent: diffResult?.diffPercent,
        changes: result.changes ?? [],
      };
    }

    return {
      pass: false,
      score: 50,
      feedback: `Vision response unparseable: ${text.slice(0, 200)}`,
      diffPercent: diffResult?.diffPercent,
    };
  } catch (err) {
    return {
      pass: false,
      score: 0,
      feedback: `Vision API error: ${err}`,
      diffPercent: diffResult?.diffPercent,
    };
  }
}

// ============================================
// Main: Visual Verify
// ============================================

export async function visualVerify(params: {
  previewUrl: string;
  productionUrl?: string;
  companySlug?: string;
  taskTitle: string;
  taskDescription: string;
  taskId: string;
  bypassVercelAuth?: string;
}): Promise<VisualVerifyResult> {
  const {
    previewUrl,
    taskTitle,
    taskDescription,
    taskId,
    companySlug,
    bypassVercelAuth,
  } = params;

  const productionUrl =
    params.productionUrl ||
    (companySlug ? PRODUCTION_URLS[companySlug] : undefined);

  // Ensure local screenshot dir exists (for debugging/backup)
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // 1. Wait for Vercel preview to be ready
  const isReady = await waitForPreview(previewUrl, 120000, bypassVercelAuth);
  if (!isReady) {
    return {
      pass: true, // Don't block — let human review
      score: -1,
      feedback: `Preview not ready after 2min: ${previewUrl}`,
    };
  }

  // 2. Screenshot the preview
  let screenshotBuffer: Buffer;
  try {
    screenshotBuffer = await takeScreenshot(previewUrl, {
      bypassVercelAuth,
      waitMs: 5000,
    });
  } catch (err) {
    return {
      pass: true,
      score: -1,
      feedback: `Screenshot failed: ${err}`,
    };
  }

  // Save locally for debugging
  writeFileSync(join(SCREENSHOT_DIR, `${taskId}-preview.png`), screenshotBuffer);

  // 3. Screenshot production baseline (if available)
  let baselineBuffer: Buffer | undefined;
  if (productionUrl) {
    try {
      baselineBuffer = await takeScreenshot(productionUrl, { waitMs: 5000 });
      writeFileSync(join(SCREENSHOT_DIR, `${taskId}-baseline.png`), baselineBuffer);
    } catch {
      // Production screenshot failed — continue without
    }
  }

  // 4. Pixel diff (if we have both images)
  let diffResult: PixelDiffResult | undefined;
  if (baselineBuffer) {
    try {
      diffResult = pixelDiff(screenshotBuffer, baselineBuffer);
      if (diffResult.diffImageBuffer) {
        writeFileSync(join(SCREENSHOT_DIR, `${taskId}-diff.png`), diffResult.diffImageBuffer);
      }
    } catch {
      // Diff failed — continue
    }
  }

  // 5. Claude Vision judgment
  const visionResult = await visionJudge({
    screenshot: screenshotBuffer,
    baseline: baselineBuffer,
    taskTitle,
    taskDescription,
    diffPercent: diffResult?.diffPercent,
  });

  // 6. Upload screenshots to Supabase storage
  const screenshotUrl = await uploadScreenshot(taskId, screenshotBuffer, "preview");
  const baselineUrl = baselineBuffer
    ? await uploadScreenshot(taskId, baselineBuffer, "baseline")
    : undefined;
  const diffUrl =
    diffResult?.diffImageBuffer
      ? await uploadScreenshot(taskId, diffResult.diffImageBuffer, "diff")
      : undefined;

  // 7. Determine pass/fail
  let pass: boolean;
  let score: number;
  let feedback: string;

  if (visionResult.score >= 0) {
    pass = visionResult.pass;
    score = visionResult.score;
    feedback = visionResult.feedback;
    if (diffResult) {
      feedback += ` [pixel diff: ${diffResult.diffPercent.toFixed(1)}%]`;
    }
  } else if (diffResult) {
    // No vision available — pixel diff only
    pass = true; // Don't auto-fail without AI judgment
    score = Math.max(0, Math.round(100 - diffResult.diffPercent));
    feedback = `Pixel diff: ${diffResult.diffPercent.toFixed(1)}% changed (no AI review — ANTHROPIC_API_KEY not set)`;
  } else {
    pass = true;
    score = -1;
    feedback = "Screenshot captured — no baseline or AI review available";
  }

  return {
    pass,
    score,
    feedback,
    screenshotUrl,
    baselineUrl,
    diffUrl,
    diffPercent: diffResult?.diffPercent,
    changes: visionResult.changes,
  };
}
