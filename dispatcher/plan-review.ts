/**
 * Plan Review Loop — Tiered plan generation and review before task execution.
 *
 * - Low tier: skip (no planning)
 * - Medium tier: builder generates plan, Gemini reviews, max 3 iterations, auto-approve after 3
 * - High tier: same loop, but escalate to Steve via Telegram if score < 9 after 3 iterations
 */

import { spawn } from "child_process";
import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================
// Types
// ============================================

type CliTool = "claude" | "gemini" | "codex";

interface ExecutionResult {
  success: boolean;
  output: string;
  summary?: string;
  error?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  task_type: string;
  cli_target: CliTool;
  company_id: string;
  skill_name?: string;
  review_tier?: "low" | "medium" | "high";
  company_registry?: { name: string; slug: string; github_repo: string };
}

export interface ReviewOutput {
  score: number;
  issues: Array<{ severity: string; issue: string; suggestion: string }>;
  approved: boolean;
  summary: string;
}

export interface PlanReviewResult {
  approved: boolean;
  plan: string | null;
  score: number | null;
  iterations: number;
  feedback: string | null;
}

export interface PlanReviewDeps {
  supabase: SupabaseClient;
  spawnCli: (cli: CliTool, workDir: string, prompt: string, taskId: string) => Promise<ExecutionResult>;
  telegramBotToken: string;
  telegramChatId: string;
  log: (level: string, msg: string, meta?: Record<string, unknown>) => void;
}

interface PlanReviewOptions {
  maxIterations?: number;
  planTimeoutMs?: number;
}

// ============================================
// Constants
// ============================================

const PLAN_GENERATION_TIMEOUT_MS = 300_000; // 5 min — NOT the 30-min CLI execution timeout
const PLAN_REVIEW_TIMEOUT_MS = 60_000;      // 60s for Gemini review
const DEFAULT_MAX_ITERATIONS = 3;
const APPROVAL_SCORE_THRESHOLD = 9;

// Fallback if vault_docs hasn't synced the plan-reviewer skill yet
const FALLBACK_REVIEW_CHECKLIST = `Review this implementation plan. Score each criterion 0 or 1, sum and scale to 0-10:
1. Scope Match — plan matches task, no more no less
2. Production Safety — doesn't touch working production code/CLI args
3. Version Compatibility — tools match Mini (Claude v2.1.76, Node v20.20.0, Gemini v0.29.7)
4. Edge Cases — failure modes handled, null checks present
5. Non-blocking — try/catch on new code, won't crash dispatcher
6. Env Var Reuse — uses existing env vars, no duplicates
7. Rollback — can revert via flag or simple revert
8. Step Completeness — ordered steps, no missing deps
Return ONLY JSON: {"score": N, "issues": [{"severity": "high|medium|low", "issue": "...", "suggestion": "..."}], "approved": true/false, "summary": "..."}`;

// ============================================
// Plan Generation
// ============================================

function buildPlanPrompt(task: Task, vaultContext: string): string {
  return [
    `# Task: ${task.title}`,
    "",
    task.description,
    "",
    "## Your Job: Create an Implementation Plan ONLY",
    "",
    "You are in PLANNING MODE. Do NOT write any code. Do NOT create branches or PRs. Do NOT execute anything.",
    "",
    "Produce a detailed implementation plan in this exact format:",
    "",
    `### Implementation Plan: ${task.title}`,
    "",
    "#### Files to Modify",
    "1. `path/to/file` -- what changes and why",
    "",
    "#### Files to Create (if any)",
    "1. `path/to/new-file` -- purpose",
    "",
    "#### Steps (in order)",
    "1. [Specific change with pseudocode or code snippet]",
    "",
    "#### What This Does NOT Change",
    "- [Explicitly list out-of-scope items]",
    "",
    "#### Risks / Edge Cases",
    "- [What could go wrong]",
    "",
    "#### Testing Strategy",
    "- [How to verify]",
    "",
    "Output ONLY the plan. No preamble, no chat, no code execution.",
    "",
    vaultContext ? `## Context\n${vaultContext}` : "",
  ].join("\n");
}

function buildRevisionPrompt(
  task: Task,
  previousPlan: string,
  previousScore: number,
  feedback: string,
  vaultContext: string
): string {
  return [
    `# Task: ${task.title}`,
    "",
    task.description,
    "",
    `## REVISION REQUEST`,
    "",
    `Your previous plan was reviewed and scored ${previousScore}/10. The reviewer found these issues:`,
    "",
    `- ${feedback}`,
    "",
    "## Your Previous Plan",
    previousPlan,
    "",
    "## Instructions",
    "Revise the plan to address ALL of the reviewer's issues. Keep what worked. Fix what didn't.",
    "Output ONLY the revised plan in the same format. No preamble, no chat.",
    "",
    vaultContext ? `## Context\n${vaultContext}` : "",
  ].join("\n");
}

async function generatePlan(
  task: Task,
  cli: CliTool,
  workDir: string,
  vaultContext: string,
  deps: PlanReviewDeps,
  previousPlan?: string,
  previousScore?: number,
  feedback?: string,
  timeoutMs?: number
): Promise<string | null> {
  const prompt = previousPlan && feedback
    ? buildRevisionPrompt(task, previousPlan, previousScore || 0, feedback, vaultContext)
    : buildPlanPrompt(task, vaultContext);

  const timeout = timeoutMs || PLAN_GENERATION_TIMEOUT_MS;

  try {
    // Wrap spawnCli with Promise.race to cap plan generation time
    const result = await Promise.race([
      deps.spawnCli(cli, workDir, prompt, task.id),
      new Promise<ExecutionResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Plan generation timed out after ${timeout}ms`)), timeout)
      ),
    ]);

    if (!result.success || !result.output?.trim()) {
      deps.log("warn", `[plan-review] Plan generation failed for task ${task.id}`, {
        error: result.error,
      });
      return null;
    }

    return result.output.trim();
  } catch (err) {
    deps.log("warn", `[plan-review] Plan generation error/timeout for task ${task.id}: ${err}`);
    return null;
  }
}

// ============================================
// Plan Review (Gemini)
// ============================================

function buildReviewPrompt(
  task: Task,
  planText: string,
  iteration: number,
  maxIterations: number,
  reviewerSkillContent: string,
  previousFeedback?: string
): string {
  return [
    "# Plan Review",
    "",
    "You are the MCM Forge COO reviewing an implementation plan before code execution.",
    "",
    "## Task",
    `Title: ${task.title}`,
    `Description: ${(task.description || "").slice(0, 500)}`,
    `Review Tier: ${task.review_tier || "medium"}`,
    `Iteration: ${iteration} of ${maxIterations}`,
    "",
    "## Plan to Review",
    planText,
    "",
    previousFeedback
      ? `## Previous Feedback (verify these were addressed)\n- ${previousFeedback}\n`
      : "",
    "## Review Criteria",
    reviewerSkillContent,
    "",
    "Return ONLY valid JSON. No markdown fences, no explanation:",
    '{"score": 8, "issues": [{"severity": "high", "issue": "...", "suggestion": "..."}], "approved": false, "summary": "..."}',
  ].join("\n");
}

function spawnGeminiReviewer(
  prompt: string,
  taskId: string,
  deps: PlanReviewDeps
): Promise<ReviewOutput | null> {
  return new Promise((resolve) => {
    const binary = process.env.GEMINI_CLI_PATH || "gemini";
    const args = [
      "-p", prompt,
      "--output-format", "json",
      "-m", "gemini-2.5-flash",
      "--yolo",
    ];

    let output = "";
    let killed = false;

    const proc = spawn(binary, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      deps.log("warn", `[plan-review] Gemini review timed out (${PLAN_REVIEW_TIMEOUT_MS}ms)`, { taskId });
    }, PLAN_REVIEW_TIMEOUT_MS);

    proc.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
    proc.stderr?.on("data", (data: Buffer) => { output += data.toString(); });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killed || code !== 0) {
        resolve(null);
        return;
      }

      try {
        // Gemini --output-format json may wrap output
        let parsed: string = output;
        try {
          const jsonWrapper = JSON.parse(output);
          parsed = typeof jsonWrapper === "string"
            ? jsonWrapper
            : jsonWrapper.response || jsonWrapper.output || JSON.stringify(jsonWrapper);
        } catch {
          // Raw text — try extracting JSON directly
        }

        const jsonMatch = parsed.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          deps.log("debug", `[plan-review] No JSON in Gemini review output`);
          resolve(null);
          return;
        }

        const result = JSON.parse(jsonMatch[0]) as ReviewOutput;
        // Validate required fields
        if (typeof result.score !== "number") {
          deps.log("debug", `[plan-review] Missing score in review output`);
          resolve(null);
          return;
        }
        result.approved = result.score >= APPROVAL_SCORE_THRESHOLD;
        resolve(result);
      } catch {
        deps.log("debug", `[plan-review] Failed to parse Gemini review output`);
        resolve(null);
      }
    });

    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function reviewPlan(
  task: Task,
  planText: string,
  iteration: number,
  maxIterations: number,
  deps: PlanReviewDeps,
  previousFeedback?: string
): Promise<ReviewOutput | null> {
  // Try loading plan-reviewer skill from vault_docs
  let reviewerContent = FALLBACK_REVIEW_CHECKLIST;
  try {
    const { data: reviewerDoc } = await deps.supabase
      .from("vault_docs")
      .select("content")
      .eq("category", "skill")
      .eq("slug", "plan-reviewer")
      .single();

    if (reviewerDoc?.content) {
      reviewerContent = reviewerDoc.content;
    }
  } catch {
    // Vault not synced yet — use fallback
  }

  const prompt = buildReviewPrompt(task, planText, iteration, maxIterations, reviewerContent, previousFeedback);
  return spawnGeminiReviewer(prompt, task.id, deps);
}

// ============================================
// Telegram Escalation
// ============================================

async function sendPlanEscalation(
  task: Task,
  plan: string,
  score: number,
  feedback: string,
  deps: PlanReviewDeps
): Promise<void> {
  if (!deps.telegramBotToken || !deps.telegramChatId) return;

  try {
    const planPreview = plan.slice(0, 800);
    const msg = [
      `\u{1F512} *HIGH-RISK PLAN REVIEW*`,
      `*${task.title}*`,
      `Score: ${score}/10 after ${DEFAULT_MAX_ITERATIONS} iterations`,
      ``,
      `*Issues:*`,
      feedback.slice(0, 400),
      ``,
      `*Plan Preview:*`,
      "```",
      planPreview,
      "```",
      ``,
      `Task is parked as \`review\`. Approve or reject in dashboard.`,
    ].join("\n");

    await fetch(`https://api.telegram.org/bot${deps.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: deps.telegramChatId,
        text: msg,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    deps.log("warn", `[plan-review] Telegram escalation failed: ${err}`);
  }
}

// ============================================
// Main Loop
// ============================================

export async function planReviewLoop(
  task: Task,
  cli: CliTool,
  workDir: string,
  vaultContext: string,
  deps: PlanReviewDeps,
  options?: PlanReviewOptions
): Promise<PlanReviewResult> {
  const maxIterations = options?.maxIterations || DEFAULT_MAX_ITERATIONS;
  const planTimeoutMs = options?.planTimeoutMs || PLAN_GENERATION_TIMEOUT_MS;
  const tier = task.review_tier || "medium";

  let plan: string | null = null;
  let lastScore: number | null = null;
  let lastFeedback: string | null = null;

  for (let i = 1; i <= maxIterations; i++) {
    // --- Generate or revise plan ---
    plan = await generatePlan(
      task, cli, workDir, vaultContext, deps,
      i > 1 ? plan || undefined : undefined,
      i > 1 ? lastScore || undefined : undefined,
      i > 1 ? lastFeedback || undefined : undefined,
      planTimeoutMs
    );

    if (!plan) {
      deps.log("warn", `[plan-review] Plan generation failed (iteration ${i}), executing without plan`);
      return { approved: true, plan: null, score: null, iterations: i, feedback: "Plan generation failed" };
    }

    // Persist plan text to DB
    try {
      await deps.supabase.from("task_queue").update({
        plan_text: plan.slice(0, 10000),
        plan_iterations: i,
        updated_at: new Date().toISOString(),
      }).eq("id", task.id);
    } catch (err) {
      deps.log("warn", `[plan-review] Failed to persist plan text: ${err}`);
    }

    // --- Review via Gemini ---
    const review = await reviewPlan(task, plan, i, maxIterations, deps, lastFeedback || undefined);

    if (!review) {
      deps.log("warn", `[plan-review] Gemini review failed (iteration ${i}), auto-approving current plan`);
      return { approved: true, plan, score: null, iterations: i, feedback: "Review unavailable" };
    }

    lastScore = review.score;
    const issuesList = review.issues?.map((iss) => `[${iss.severity}] ${iss.issue}: ${iss.suggestion}`).join("\n- ") || "";
    lastFeedback = issuesList || review.summary || "";

    // Persist review results
    try {
      await deps.supabase.from("task_queue").update({
        plan_score: review.score,
        plan_feedback: lastFeedback.slice(0, 2000),
        updated_at: new Date().toISOString(),
      }).eq("id", task.id);
    } catch (err) {
      deps.log("warn", `[plan-review] Failed to persist review results: ${err}`);
    }

    // War room post
    try {
      await deps.supabase.from("communication_log").insert({
        from_agent: "plan-reviewer",
        to_agent: "all",
        channel: "war_room",
        message: `[PLAN-REVIEW] ${task.title} iteration ${i}: score ${review.score}/10. ${review.approved ? "APPROVED" : "Revising..."}`,
        company_id: task.company_id,
        task_id: task.id,
      });
    } catch {
      // Non-critical
    }

    // --- Check approval ---
    if (review.approved) {
      deps.log("info", `[plan-review] Plan approved (score: ${review.score}, iteration ${i})`);
      return { approved: true, plan, score: review.score, iterations: i, feedback: lastFeedback };
    }

    // Last iteration — behavior depends on tier
    if (i === maxIterations) {
      if (tier === "high") {
        // Escalate to Steve
        deps.log("info", `[plan-review] High-tier plan not approved after ${maxIterations} iterations, escalating`);
        await sendPlanEscalation(task, plan, review.score, lastFeedback, deps);
        try {
          await deps.supabase.from("task_queue").update({
            status: "review",
            updated_at: new Date().toISOString(),
          }).eq("id", task.id);
        } catch (err) {
          deps.log("warn", `[plan-review] Failed to set review status: ${err}`);
        }
        return { approved: false, plan, score: review.score, iterations: i, feedback: lastFeedback };
      } else {
        // Medium tier: auto-approve after max iterations
        deps.log("info", `[plan-review] Medium-tier auto-approved after ${maxIterations} iterations (score: ${review.score})`);
        return { approved: true, plan, score: review.score, iterations: i, feedback: lastFeedback };
      }
    }

    deps.log("info", `[plan-review] Iteration ${i} score: ${review.score}/10, revising...`);
  }

  // Should not reach here, but safety fallback
  return { approved: true, plan, score: lastScore, iterations: maxIterations, feedback: lastFeedback };
}
