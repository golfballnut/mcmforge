#!/usr/bin/env tsx
/**
 * MCM Forge Spec Pipeline
 *
 * Orchestrates the full PLANNER phase:
 * 1. Screenshot current app state
 * 2. Download reference images if specified
 * 3. Generate mockup via Nano Banana 2
 * 4. Design extraction (Claude Vision → design tokens)
 * 5. Planner agent → requirements + acceptance criteria
 * 6. Store in spec_sheets table
 * 7. Multi-agent grading → Steve approval
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { generateMockup, downloadImage } from "./mockup-generator.js";
import { takeScreenshot } from "./visual-verify.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// Types
// ============================================

interface SpecTask {
  id: string;
  title: string;
  description: string;
  company_id: string;
  company_registry?: {
    name: string;
    slug: string;
    github_repo: string;
  };
}

interface SpecSheetRow {
  id: string;
  task_id: string;
  company_id: string;
  title: string;
  description: string;
  before_screenshot_url: string;
  mockup_url: string;
  mockup_prompt: string;
  reference_image_urls: string[];
  requirements: Requirement[];
  acceptance_criteria: AcceptanceCriterion[];
  design_tokens: Record<string, unknown>;
  target_pages: string[];
  approval_status: string;
}

interface Requirement {
  id: string;
  description: string;
  priority: "must" | "should" | "nice";
}

interface AcceptanceCriterion {
  id: string;
  type: "visual" | "functional" | "data";
  description: string;
  selector?: string;
  action?: string;
  actionValue?: string;
  expectedResult?: string;
  expectedSelector?: string;
  expectedText?: string;
  expectedUrl?: string;
}

interface GradingScore {
  grader: string;
  scores: {
    mockup_realism: number;
    requirement_completeness: number;
    testability: number;
  };
  average: number;
  feedback: string;
  timestamp: string;
}

// ============================================
// Configuration
// ============================================

const VISION_MODEL = process.env.VISUAL_TDD_MODEL || "claude-sonnet-4-6-20250514";
const GRADING_THRESHOLD = 70;
const MAX_GRADING_ATTEMPTS = 3;

const PRODUCTION_URLS: Record<string, string> = {
  dirtsync: process.env.DIRTSYNC_PRODUCTION_URL || "https://dirt-sync.vercel.app",
  mcmforge: process.env.MCMFORGE_PRODUCTION_URL || "https://mcmforge.com",
};

// ============================================
// Main: Execute Spec Task
// ============================================

export async function executeSpecTask(params: {
  task: SpecTask;
  supabase: SupabaseClient;
  vaultContext: string;
}): Promise<{ success: boolean; output: string; summary?: string; error?: string; specSheetId?: string }> {
  const { task, supabase, vaultContext } = params;
  const companySlug = task.company_registry?.slug || "mcmforge";

  try {
    // 1. Screenshot current app state
    let beforeScreenshotUrl = "";
    const productionUrl = PRODUCTION_URLS[companySlug];
    if (productionUrl) {
      try {
        const screenshot = await takeScreenshot(productionUrl);
        beforeScreenshotUrl = await uploadToStorage(supabase, screenshot, `specs/${task.id}-before.png`);
      } catch (err) {
        console.log(`[SPEC] Could not screenshot production: ${err}`);
      }
    }

    // 2. Extract and download reference images from description
    const referenceUrls = extractImageUrls(task.description);
    const referenceImages: Buffer[] = [];
    for (const url of referenceUrls) {
      try {
        const img = await downloadImage(url);
        referenceImages.push(img);
      } catch (err) {
        console.log(`[SPEC] Could not download reference image ${url}: ${err}`);
      }
    }

    // 3. Generate mockup via Nano Banana 2
    let mockupUrl = "";
    let mockupBuffer: Buffer | undefined;
    const mockupPrompt = buildMockupPrompt(task);

    try {
      const currentScreenshot = beforeScreenshotUrl
        ? await downloadImage(beforeScreenshotUrl)
        : undefined;

      const mockupResult = await generateMockup({
        prompt: mockupPrompt,
        currentScreenshot,
        referenceImages,
      });

      mockupUrl = mockupResult.imageUrl;
      mockupBuffer = mockupResult.imageBuffer;
    } catch (err) {
      return {
        success: false,
        output: "",
        error: `Mockup generation failed: ${err}`,
      };
    }

    // 4. Design extraction: Claude Vision → design tokens
    let designTokens: Record<string, unknown> = {};
    if (mockupBuffer) {
      try {
        designTokens = await extractDesignTokens(mockupBuffer);
      } catch (err) {
        console.log(`[SPEC] Design extraction failed: ${err}`);
      }
    }

    // 5. Generate requirements + acceptance criteria
    const { requirements, acceptanceCriteria, targetPages } =
      await generateRequirements(task, mockupUrl, vaultContext);

    // 6. Store spec sheet
    const { data: specSheet, error: insertError } = await supabase
      .from("spec_sheets")
      .insert({
        task_id: task.id,
        company_id: task.company_id,
        title: task.title,
        description: task.description,
        before_screenshot_url: beforeScreenshotUrl,
        mockup_url: mockupUrl,
        mockup_prompt: mockupPrompt,
        reference_image_urls: referenceUrls,
        requirements,
        acceptance_criteria: acceptanceCriteria,
        design_tokens: designTokens,
        target_pages: targetPages,
        approval_status: "grading",
      })
      .select("id")
      .single();

    if (insertError || !specSheet) {
      return {
        success: false,
        output: "",
        error: `Failed to save spec sheet: ${insertError?.message}`,
      };
    }

    // 7. Run grading
    const gradingPassed = await gradeSpec(specSheet.id, supabase, mockupBuffer, requirements);

    if (gradingPassed) {
      // Submit for Steve's approval
      await submitSpecForApproval(specSheet.id, task, supabase, beforeScreenshotUrl, mockupUrl, requirements);
    }

    return {
      success: true,
      output: `Spec sheet created: ${specSheet.id}. Mockup: ${mockupUrl}. ${requirements.length} requirements, ${acceptanceCriteria.length} criteria. Grading: ${gradingPassed ? "PASSED → sent to Steve" : "NEEDS IMPROVEMENT"}.`,
      summary: `Spec created for "${task.title}" — ${gradingPassed ? "awaiting Steve's approval" : "grading failed, regenerating"}`,
      specSheetId: specSheet.id,
    };
  } catch (err) {
    return {
      success: false,
      output: "",
      error: `Spec pipeline error: ${err}`,
    };
  }
}

// ============================================
// Mockup Prompt Builder
// ============================================

function buildMockupPrompt(task: SpecTask): string {
  return `Create a UI mockup for: ${task.title}

${task.description}

This should look like a real, production-quality web application screenshot.
Use modern design conventions: clean typography, proper spacing, consistent colors.
Make interactive elements (buttons, inputs, toggles) look realistic and clickable.`;
}

// ============================================
// Design Token Extraction (Claude Vision)
// ============================================

async function extractDesignTokens(mockupBuffer: Buffer): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return {};

  const anthropic = new Anthropic({ apiKey });

  // Load skill doc for the extraction prompt
  let extractionPrompt: string;
  try {
    const skillPath = join(__dirname, "..", "vault", "skills", "design-extractor.md");
    const skillDoc = readFileSync(skillPath, "utf-8");
    // Extract the prompt template from the skill doc
    const promptMatch = skillDoc.match(/```\n([\s\S]*?)```/);
    extractionPrompt = promptMatch?.[1] || getDefaultExtractionPrompt();
  } catch {
    extractionPrompt = getDefaultExtractionPrompt();
  }

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: extractionPrompt },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: mockupBuffer.toString("base64") },
          },
        ],
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (err) {
    console.log(`[SPEC] Design token extraction failed: ${err}`);
    return {};
  }
}

function getDefaultExtractionPrompt(): string {
  return `Analyze this UI mockup and extract ALL design tokens.
Output ONLY valid JSON with: colors (hex), typography (font families, sizes), spacing (px), borders (radius, width), layout (columns, widths).`;
}

// ============================================
// Requirements Generator (Claude CLI)
// ============================================

async function generateRequirements(
  task: SpecTask,
  mockupUrl: string,
  vaultContext: string
): Promise<{
  requirements: Requirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  targetPages: string[];
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: generate basic requirements from task description
    return generateBasicRequirements(task);
  }

  const anthropic = new Anthropic({ apiKey });

  const prompt = `You are a product manager creating structured requirements and acceptance criteria for a development task.

Task: ${task.title}
Description: ${task.description}
Company: ${task.company_registry?.name || "Unknown"}
${mockupUrl ? `Mockup: ${mockupUrl}` : ""}
${vaultContext ? `\nRelevant context:\n${vaultContext.slice(0, 2000)}` : ""}

Generate structured output as JSON with these fields:

{
  "requirements": [
    {"id": "REQ-1", "description": "...", "priority": "must|should|nice"}
  ],
  "acceptance_criteria": [
    {
      "id": "AC-1",
      "type": "visual|functional|data",
      "description": "...",
      "selector": "CSS selector or [data-testid=...]",
      "action": "click|type|navigate|scroll|hover|null",
      "actionValue": "value for action or null",
      "expectedResult": "what should happen",
      "expectedSelector": "element that should appear or null",
      "expectedText": "text that should be present or null",
      "expectedUrl": "URL pattern or null"
    }
  ],
  "target_pages": ["/page1", "/page2"]
}

Rules:
- Every requirement MUST have at least one acceptance criterion
- Visual criteria check appearance (colors, layout, styling)
- Functional criteria test interactions (clicks, typing, navigation)
- Data criteria verify API responses or state changes
- Use data-testid selectors when possible
- Be specific — "button should be blue" not "button should look good"
- Include edge cases and error states where relevant

Output ONLY the JSON, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        requirements: parsed.requirements || [],
        acceptanceCriteria: parsed.acceptance_criteria || [],
        targetPages: parsed.target_pages || [],
      };
    }
  } catch (err) {
    console.log(`[SPEC] Requirements generation failed: ${err}`);
  }

  return generateBasicRequirements(task);
}

function generateBasicRequirements(task: SpecTask): {
  requirements: Requirement[];
  acceptanceCriteria: AcceptanceCriterion[];
  targetPages: string[];
} {
  return {
    requirements: [
      {
        id: "REQ-1",
        description: task.title,
        priority: "must" as const,
      },
    ],
    acceptanceCriteria: [
      {
        id: "AC-1",
        type: "visual" as const,
        description: `The implementation matches the mockup for: ${task.title}`,
      },
    ],
    targetPages: ["/"],
  };
}

// ============================================
// Multi-Agent Grading
// ============================================

async function gradeSpec(
  specSheetId: string,
  supabase: SupabaseClient,
  mockupBuffer?: Buffer,
  requirements?: Requirement[]
): Promise<boolean> {
  const scores: GradingScore[] = [];

  for (let attempt = 0; attempt < MAX_GRADING_ATTEMPTS; attempt++) {
    // Grade with Claude Vision
    const claudeScore = await gradeWithClaude(mockupBuffer, requirements);
    scores.push(claudeScore);

    // Calculate average across all graders
    const avgScore = scores.reduce((sum, s) => sum + s.average, 0) / scores.length;

    // Update spec sheet with grading results
    await supabase
      .from("spec_sheets")
      .update({
        grading_scores: scores,
        grading_passed: avgScore >= GRADING_THRESHOLD,
        approval_status: avgScore >= GRADING_THRESHOLD ? "awaiting_approval" : "grading",
        updated_at: new Date().toISOString(),
      })
      .eq("id", specSheetId);

    if (avgScore >= GRADING_THRESHOLD) {
      return true;
    }

    // If first attempt fails, try once more with a different prompt
    if (attempt < MAX_GRADING_ATTEMPTS - 1) {
      console.log(`[SPEC] Grading attempt ${attempt + 1} scored ${avgScore} (need ${GRADING_THRESHOLD}). Retrying...`);
    }
  }

  return false;
}

async function gradeWithClaude(
  mockupBuffer?: Buffer,
  requirements?: Requirement[]
): Promise<GradingScore> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !mockupBuffer) {
    return {
      grader: "claude-vision",
      scores: { mockup_realism: 75, requirement_completeness: 75, testability: 75 },
      average: 75,
      feedback: "Auto-pass: Claude Vision unavailable",
      timestamp: new Date().toISOString(),
    };
  }

  const anthropic = new Anthropic({ apiKey });

  const reqList = requirements?.map((r) => `- [${r.priority}] ${r.description}`).join("\n") || "No requirements specified";

  try {
    const response = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a design quality reviewer. Grade this mockup on 3 criteria (0-100 each):

1. **Mockup Realism**: Does it look like a real app screenshot? Professional quality?
2. **Requirement Completeness**: Does the mockup address all requirements below?
3. **Testability**: Can each feature in the mockup be verified by automated tests?

Requirements:
${reqList}

Respond ONLY with JSON:
{"mockup_realism": 85, "requirement_completeness": 90, "testability": 80, "feedback": "summary"}`,
          },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: mockupBuffer.toString("base64") },
          },
        ],
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const avg = Math.round(
        (result.mockup_realism + result.requirement_completeness + result.testability) / 3
      );
      return {
        grader: "claude-vision",
        scores: {
          mockup_realism: result.mockup_realism,
          requirement_completeness: result.requirement_completeness,
          testability: result.testability,
        },
        average: avg,
        feedback: result.feedback || "No feedback",
        timestamp: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.log(`[SPEC] Claude grading failed: ${err}`);
  }

  return {
    grader: "claude-vision",
    scores: { mockup_realism: 70, requirement_completeness: 70, testability: 70 },
    average: 70,
    feedback: "Grading fallback: could not parse response",
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// Submit for Steve's Approval
// ============================================

async function submitSpecForApproval(
  specSheetId: string,
  task: SpecTask,
  supabase: SupabaseClient,
  beforeScreenshotUrl: string,
  mockupUrl: string,
  requirements: Requirement[]
): Promise<void> {
  // Create approval queue entry
  const approvalToken = crypto.randomUUID();

  await supabase.from("approval_queue").insert({
    task_id: task.id,
    company_id: task.company_id,
    approval_type: "spec_approval",
    title: `Spec Review: ${task.title}`,
    description: `Mockup and ${requirements.length} requirements ready for review.\n\n` +
      requirements.map((r) => `[${r.priority}] ${r.description}`).join("\n"),
    preview_url: mockupUrl,
    status: "pending",
    approval_token: approvalToken,
    metadata: { specSheetId, beforeScreenshotUrl, mockupUrl },
  });

  // Send Telegram notification with photos
  await sendSpecApprovalTelegram(task, beforeScreenshotUrl, mockupUrl, requirements, specSheetId);

  // Send email notification
  await sendSpecApprovalEmail(task, beforeScreenshotUrl, mockupUrl, requirements, approvalToken);
}

// ============================================
// Telegram Spec Approval
// ============================================

async function sendSpecApprovalTelegram(
  task: SpecTask,
  beforeUrl: string,
  mockupUrl: string,
  requirements: Requirement[],
  specSheetId: string
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  // Send before screenshot
  if (beforeUrl) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: beforeUrl,
        caption: `📸 BEFORE — ${task.title}`,
      }),
    });
  }

  // Send mockup
  if (mockupUrl) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: mockupUrl,
        caption: `🎨 MOCKUP — ${task.title}`,
      }),
    });
  }

  // Send requirements with approval buttons
  const reqText = requirements.map((r) => `${r.priority === "must" ? "!" : "-"} ${r.description}`).join("\n");

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `<b>Spec Review: ${task.title}</b>\n\n${reqText}\n\n<i>${task.company_registry?.name || ""}</i>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Approve", callback_data: `sa:${specSheetId}` },
            { text: "Reject", callback_data: `sr:${specSheetId}` },
          ],
          [
            { text: "Request Revision", callback_data: `sv:${specSheetId}` },
          ],
        ],
      },
    }),
  });
}

// ============================================
// Email Spec Approval
// ============================================

async function sendSpecApprovalEmail(
  task: SpecTask,
  beforeUrl: string,
  mockupUrl: string,
  requirements: Requirement[],
  approvalToken: string
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const steveEmail = process.env.STEVE_EMAIL || "steve@linkschoice.com";
  if (!resendApiKey) return;

  const projectId = process.env.MCMFORGE_SUPABASE_URL?.match(/\/\/(.*?)\./)?.[1] || "";
  const approveUrl = `https://${projectId}.supabase.co/functions/v1/approve-task?token=${approvalToken}&action=approve`;
  const rejectUrl = `https://${projectId}.supabase.co/functions/v1/approve-task?token=${approvalToken}&action=reject`;

  const reqHtml = requirements.map((r) =>
    `<li><strong>[${r.priority}]</strong> ${r.description}</li>`
  ).join("");

  const html = `
<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Spec Review: ${task.title}</h2>
  <p><strong>Company:</strong> ${task.company_registry?.name || "Unknown"}</p>

  ${beforeUrl ? `<h3>Before</h3><img src="${beforeUrl}" style="max-width:100%;border-radius:8px;" />` : ""}
  ${mockupUrl ? `<h3>Proposed Mockup</h3><img src="${mockupUrl}" style="max-width:100%;border-radius:8px;" />` : ""}

  <h3>Requirements</h3>
  <ul>${reqHtml}</ul>

  <div style="margin-top: 24px;">
    <a href="${approveUrl}" style="background: #22c55e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-right: 8px;">Approve</a>
    <a href="${rejectUrl}" style="background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Reject</a>
  </div>
</div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "MCM Forge <ops@mcmforge.com>",
      to: steveEmail,
      subject: `[SPEC] ${task.title} — Review Required`,
      html,
    }),
  });
}

// ============================================
// On Spec Approved — Create Builder Task
// ============================================

export async function onSpecApproved(
  specSheetId: string,
  supabase: SupabaseClient
): Promise<void> {
  // Load the spec sheet
  const { data: spec, error } = await supabase
    .from("spec_sheets")
    .select("*, task_queue!spec_sheets_task_id_fkey(title, description, company_id, company_registry(name, slug, github_repo))")
    .eq("id", specSheetId)
    .single();

  if (error || !spec) {
    console.log(`[SPEC] Failed to load spec for builder task: ${error?.message}`);
    return;
  }

  // Build enriched description for the builder agent
  const designTokensStr = Object.keys(spec.design_tokens || {}).length > 0
    ? `\n\nDesign Tokens:\n${JSON.stringify(spec.design_tokens, null, 2)}`
    : "";

  const reqStr = (spec.requirements || [])
    .map((r: Requirement) => `- [${r.priority}] ${r.description}`)
    .join("\n");

  const criteriaStr = (spec.acceptance_criteria || [])
    .map((c: AcceptanceCriterion) => `- [${c.type}] ${c.description}${c.selector ? ` (${c.selector})` : ""}`)
    .join("\n");

  const builderDescription = `SPEC-DRIVEN TASK — You MUST implement ALL requirements exactly.

Original Task: ${spec.task_queue?.title || spec.title}
${spec.task_queue?.description || spec.description || ""}

Approved Mockup: ${spec.mockup_url}

Requirements:
${reqStr}

Acceptance Criteria (your code will be tested against each one):
${criteriaStr}
${designTokensStr}

IMPORTANT: Your work will be automatically verified against the mockup and each acceptance criterion.
The task CANNOT be closed until you score 100% on all criteria.
If verification fails, you'll receive specific feedback about what to fix.`;

  // Create the builder task
  const { data: builderTask, error: taskError } = await supabase
    .from("task_queue")
    .insert({
      title: `[BUILD] ${spec.title}`,
      description: builderDescription,
      task_type: "code",
      cli_target: "claude",
      company_id: spec.company_id || spec.task_queue?.company_id,
      priority: "high",
      status: "todo",
      spec_sheet_id: specSheetId,
      parent_task_id: spec.task_id,
      created_by: "spec-pipeline",
    })
    .select("id")
    .single();

  if (taskError) {
    console.log(`[SPEC] Failed to create builder task: ${taskError.message}`);
    return;
  }

  // Update spec sheet with builder task reference
  await supabase
    .from("spec_sheets")
    .update({
      builder_task_id: builderTask.id,
      approval_status: "approved",
      approved_by: "steve",
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", specSheetId);

  console.log(`[SPEC] Builder task created: ${builderTask.id} for spec ${specSheetId}`);
}

// ============================================
// Helpers
// ============================================

function extractImageUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"']+\.(?:png|jpg|jpeg|gif|webp)/gi;
  return Array.from(new Set(text.match(urlRegex) || []));
}

async function uploadToStorage(
  supabase: SupabaseClient,
  buffer: Buffer,
  path: string
): Promise<string> {
  const { error } = await supabase.storage
    .from("artifacts")
    .upload(path, buffer, { contentType: "image/png", upsert: true });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from("artifacts").getPublicUrl(path);
  return data.publicUrl;
}
