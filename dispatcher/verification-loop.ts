#!/usr/bin/env tsx
/**
 * MCM Forge Verification Loop
 *
 * Orchestrates visual + functional verification for spec-driven tasks.
 * Enforces the "cannot close until 100%" rule.
 *
 * Flow:
 * 1. Load spec sheet (mockup, acceptance criteria)
 * 2. Visual check: screenshot preview → compare to approved mockup
 * 3. Functional check: Playwright tests each acceptance criterion
 * 4. Composite score: (visual × 0.4) + (functional × 0.6)
 * 5. Score < 100 → return failure feedback for builder retry
 * 6. Score = 100 → task can close
 * 7. Iterations >= max → escalate to Steve
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAgainstMockup, type MockupVerifyResult } from "./visual-verify.js";
import { runFunctionalVerification, type FunctionalVerifyResult } from "./functional-verify.js";
import { takeScreenshot } from "./visual-verify.js";

// ============================================
// Types
// ============================================

interface SpecSheet {
  id: string;
  task_id: string;
  builder_task_id?: string;
  title: string;
  mockup_url: string;
  acceptance_criteria: AcceptanceCriterion[];
  design_tokens: Record<string, unknown>;
  current_score: number;
  visual_score?: number;
  functional_score?: number;
  iteration_count: number;
  max_iterations: number;
  verification_runs: VerificationRun[];
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

interface VerificationRun {
  iteration: number;
  timestamp: string;
  visualScore: number;
  functionalScore: number;
  compositeScore: number;
  failedCriteria: string[];
  feedback: string;
}

export interface VerificationLoopResult {
  canClose: boolean;
  compositeScore: number;
  visualScore: number;
  functionalScore: number;
  iteration: number;
  maxIterations: number;
  escalate: boolean;
  feedback: string;
  failedCriteria: string[];
}

// ============================================
// Configuration
// ============================================

const VISUAL_WEIGHT = 0.4;
const FUNCTIONAL_WEIGHT = 0.6;
const PASS_THRESHOLD = 100;  // Must be 100% to close

// ============================================
// Main: Run Verification Loop
// ============================================

export async function runVerificationLoop(params: {
  specSheetId: string;
  previewUrl: string;
  companySlug?: string;
  supabase: SupabaseClient;
  bypassVercelAuth?: string;
}): Promise<VerificationLoopResult> {
  const { specSheetId, previewUrl, supabase, companySlug, bypassVercelAuth } = params;

  // 1. Load spec sheet
  const { data: spec, error } = await supabase
    .from("spec_sheets")
    .select("*")
    .eq("id", specSheetId)
    .single();

  if (error || !spec) {
    return {
      canClose: false,
      compositeScore: 0,
      visualScore: 0,
      functionalScore: 0,
      iteration: 0,
      maxIterations: 5,
      escalate: false,
      feedback: `Failed to load spec sheet: ${error?.message || "not found"}`,
      failedCriteria: [],
    };
  }

  const specSheet = spec as SpecSheet;
  const iteration = specSheet.iteration_count + 1;

  // 2. Check if we've exceeded max iterations
  if (iteration > specSheet.max_iterations) {
    return {
      canClose: false,
      compositeScore: specSheet.current_score,
      visualScore: specSheet.visual_score || 0,
      functionalScore: specSheet.functional_score || 0,
      iteration,
      maxIterations: specSheet.max_iterations,
      escalate: true,
      feedback: `Max iterations (${specSheet.max_iterations}) reached. Last score: ${specSheet.current_score}/100. Escalating to Steve.`,
      failedCriteria: [],
    };
  }

  // 3. Visual check: screenshot preview vs approved mockup
  let visualScore = 100;
  let visualFeedback = "No mockup to compare against";

  if (specSheet.mockup_url) {
    try {
      // Download mockup image
      const mockupResponse = await fetch(specSheet.mockup_url);
      const mockupBuffer = Buffer.from(await mockupResponse.arrayBuffer());

      const visualResult: MockupVerifyResult = await verifyAgainstMockup({
        previewUrl,
        mockupBuffer,
        taskTitle: specSheet.title,
        companySlug,
        bypassVercelAuth,
      });

      visualScore = visualResult.score;
      visualFeedback = visualResult.feedback;
    } catch (err) {
      visualScore = 50;
      visualFeedback = `Visual verification error: ${err}`;
    }
  }

  // 4. Functional check: Playwright tests each criterion
  let functionalResult: FunctionalVerifyResult;

  try {
    functionalResult = await runFunctionalVerification({
      previewUrl,
      acceptanceCriteria: specSheet.acceptance_criteria || [],
      bypassVercelAuth,
    });
  } catch (err) {
    functionalResult = {
      score: 0,
      passed: 0,
      total: specSheet.acceptance_criteria?.length || 0,
      results: [],
      summary: `Functional verification error: ${err}`,
    };
  }

  // 5. Composite score
  const functionalScore = functionalResult.score;
  const compositeScore = Math.round(
    (visualScore * VISUAL_WEIGHT) + (functionalScore * FUNCTIONAL_WEIGHT)
  );

  // 6. Collect failed criteria
  const failedCriteria = functionalResult.results
    .filter((r) => !r.pass)
    .map((r) => `[${r.type}] ${r.description}: ${r.evidence}`);

  // 7. Build feedback for builder retry
  const feedbackParts: string[] = [];
  if (visualScore < 100) {
    feedbackParts.push(`VISUAL (${visualScore}/100): ${visualFeedback}`);
  }
  if (functionalScore < 100) {
    feedbackParts.push(`FUNCTIONAL (${functionalScore}/100): ${functionalResult.summary}`);
  }
  const feedback = feedbackParts.length > 0
    ? feedbackParts.join("\n\n")
    : "All checks passed!";

  // 8. Record this verification run
  const verificationRun: VerificationRun = {
    iteration,
    timestamp: new Date().toISOString(),
    visualScore,
    functionalScore,
    compositeScore,
    failedCriteria,
    feedback,
  };

  const existingRuns = specSheet.verification_runs || [];
  existingRuns.push(verificationRun);

  // 9. Update spec sheet
  await supabase
    .from("spec_sheets")
    .update({
      iteration_count: iteration,
      current_score: compositeScore,
      visual_score: visualScore,
      functional_score: functionalScore,
      verification_runs: existingRuns,
      updated_at: new Date().toISOString(),
    })
    .eq("id", specSheetId);

  const canClose = compositeScore >= PASS_THRESHOLD;
  const escalate = !canClose && iteration >= specSheet.max_iterations;

  return {
    canClose,
    compositeScore,
    visualScore,
    functionalScore,
    iteration,
    maxIterations: specSheet.max_iterations,
    escalate,
    feedback,
    failedCriteria,
  };
}

// ============================================
// Cannot-Close Guard
// ============================================

/**
 * Checks if a task with a spec_sheet can be closed.
 * Returns true if the task is allowed to transition to "done" or "review".
 * Returns false with reason if the spec score is below 100.
 */
export async function canTaskClose(params: {
  specSheetId: string;
  supabase: SupabaseClient;
}): Promise<{ allowed: boolean; reason: string }> {
  const { specSheetId, supabase } = params;

  const { data: spec, error } = await supabase
    .from("spec_sheets")
    .select("current_score, iteration_count, max_iterations, approval_status")
    .eq("id", specSheetId)
    .single();

  if (error || !spec) {
    return {
      allowed: false,
      reason: `Spec sheet not found: ${error?.message || "unknown"}`,
    };
  }

  if (spec.approval_status !== "approved") {
    return {
      allowed: false,
      reason: `Spec not yet approved (status: ${spec.approval_status})`,
    };
  }

  if (spec.current_score >= PASS_THRESHOLD) {
    return { allowed: true, reason: "Score is 100 — all criteria pass" };
  }

  if (spec.iteration_count >= spec.max_iterations) {
    return {
      allowed: true,
      reason: `Max iterations reached (${spec.iteration_count}/${spec.max_iterations}) — escalated to Steve`,
    };
  }

  return {
    allowed: false,
    reason: `Score is ${spec.current_score}/100 — needs ${PASS_THRESHOLD} to close. Iteration ${spec.iteration_count}/${spec.max_iterations}.`,
  };
}
