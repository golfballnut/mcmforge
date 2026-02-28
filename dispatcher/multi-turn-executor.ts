/**
 * Multi-Turn Executor — v6 Dispatcher
 *
 * Handles iterative code task execution within a persistent session.
 * Up to 3 turns: implement → fix failures → last chance.
 * The session retains full context between turns.
 */

import { SessionManager, type AgentSession, type SessionResponse } from "./session-manager.js";
import { resolvePersona, type TaskType } from "./agent-personas.js";

// ============================================
// Types (matches dispatcher.ts)
// ============================================

interface Task {
  id: string;
  title: string;
  description: string;
  task_type: TaskType;
  cli_target: string;
  company_id: string;
  skill_name?: string;
  retry_count?: number;
}

export interface MultiTurnResult {
  success: boolean;
  output: string;
  summary: string;
  iterations: number;
  prUrl?: string;
  prNumber?: number;
  previewUrl?: string;
  error?: string;
}

// ============================================
// Constants
// ============================================

const MAX_TURNS = 3;
const PR_URL_RE = /https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/;
const VERCEL_URL_RE = /https:\/\/[^\s]*\.vercel\.app[^\s)"]*/;

// ============================================
// Output Analysis (mirrors dispatcher.ts patterns)
// ============================================

function analyzeOutput(output: string): { tests: "passed" | "failed" | "no_tests"; build: "passed" | "failed" | "unknown" } {
  const testFailPatterns = [
    /(\d+) failed/i, /FAIL\s/, /tests?\s+failed/i, /test suite failed/i,
    /assertion error/i, /expected .+ but received/i, /✗.*test/i, /error: test/i,
    /ERR_MODULE_NOT_FOUND.*vitest/i, /Cannot find module.*vitest/i,
  ];
  const testPassPatterns = [
    /(\d+) passed/i, /tests?\s+passed/i, /all tests passed/i, /✓.*test/i, /PASS\s/,
  ];
  const buildFailPatterns = [
    /Type error:/i, /Build error/i, /next build.*failed/i, /tsc.*error/i,
  ];

  const hasTestFail = testFailPatterns.some(p => p.test(output));
  const hasTestPass = testPassPatterns.some(p => p.test(output));
  const hasBuildFail = buildFailPatterns.some(p => p.test(output));

  return {
    tests: hasTestFail ? "failed" : hasTestPass ? "passed" : "no_tests",
    build: hasBuildFail ? "failed" : "unknown",
  };
}

function extractUrls(output: string): { prUrl?: string; prNumber?: number; previewUrl?: string } {
  const prMatch = output.match(PR_URL_RE);
  const vercelMatch = output.match(VERCEL_URL_RE);
  return {
    prUrl: prMatch?.[0],
    prNumber: prMatch ? parseInt(prMatch[1], 10) : undefined,
    previewUrl: vercelMatch?.[0],
  };
}

// ============================================
// Multi-Turn Code Execution
// ============================================

export async function executeCodeTaskMultiTurn(
  sessionManager: SessionManager,
  task: Task,
  initialPrompt: string,
  repoPath: string,
  timeoutMs: number,
): Promise<MultiTurnResult> {
  const persona = resolvePersona(task.task_type as TaskType);
  if (!persona) {
    return { success: false, output: "", summary: "No persona for task type", iterations: 0, error: "No persona" };
  }

  const session = await sessionManager.getOrCreateSession(persona, task.company_id);
  if (!session) {
    return { success: false, output: "", summary: "Session capacity reached", iterations: 0, error: "No session available" };
  }

  let allOutput = "";
  let lastResult: SessionResponse | null = null;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const prompt = turn === 1
      ? initialPrompt
      : buildIterationPrompt(allOutput, turn);

    log(`Turn ${turn}/${MAX_TURNS} for task ${task.id}`);

    const result = await sessionManager.sendToSession(session, prompt, repoPath, { timeoutMs });
    lastResult = result;
    allOutput += `\n\n--- Turn ${turn} ---\n${result.output}`;

    if (!result.success) {
      return buildResult(allOutput, turn, result.error);
    }

    // Analyze this turn's output
    const analysis = analyzeOutput(result.output);

    // Success: tests pass and no build failures
    if (analysis.tests !== "failed" && analysis.build !== "failed") {
      log(`Turn ${turn}: clean — tests=${analysis.tests}, build=${analysis.build}`);
      return buildResult(allOutput, turn);
    }

    // Last turn — return whatever we have
    if (turn === MAX_TURNS) {
      log(`Turn ${turn}: still failing after max turns`);
      return buildResult(allOutput, turn, `Still failing after ${MAX_TURNS} turns`);
    }

    // Otherwise, loop to next turn with fix prompt
    log(`Turn ${turn}: failures detected — tests=${analysis.tests}, build=${analysis.build}, iterating...`);
  }

  // Should not reach here, but safety net
  return buildResult(allOutput, MAX_TURNS);
}

/**
 * Multi-turn service task execution.
 * Simpler than code — just one turn, but uses session for context accumulation.
 */
export async function executeServiceTaskWithSession(
  sessionManager: SessionManager,
  task: Task,
  prompt: string,
  workDir: string,
  timeoutMs: number,
): Promise<MultiTurnResult> {
  const persona = resolvePersona(task.task_type as TaskType);
  if (!persona) {
    return { success: false, output: "", summary: "No persona for task type", iterations: 0, error: "No persona" };
  }

  const session = await sessionManager.getOrCreateSession(persona, task.company_id);
  if (!session) {
    return { success: false, output: "", summary: "Session capacity reached", iterations: 0, error: "No session available" };
  }

  const result = await sessionManager.sendToSession(session, prompt, workDir, { timeoutMs });

  const summary = result.output.slice(-500).trim();
  return {
    success: result.success,
    output: result.output,
    summary,
    iterations: 1,
    error: result.error,
  };
}

// ============================================
// Prompt Builders
// ============================================

function buildIterationPrompt(previousOutput: string, turn: number): string {
  // Only include the last 4000 chars of output — enough for error context
  const recentOutput = previousOutput.slice(-4000);

  const parts: string[] = [];

  if (turn === 2) {
    parts.push(
      "## ITERATION — Fix the failures from your previous attempt",
      "",
      "Your code from the previous turn had issues. The details are below.",
      "You still have full context of every file you read and edited.",
      "",
      "### What to do:",
      "1. Read the error output below carefully",
      "2. Fix EACH failing test and build error",
      "3. Run the tests and build again after fixing",
      "4. Include the test/build output in your response",
      "5. Do NOT start over — modify the code you already wrote",
      "",
    );
  } else if (turn === 3) {
    parts.push(
      "## FINAL ATTEMPT — You have one more chance to fix this",
      "",
      "Two previous attempts had failures. This is your last turn.",
      "",
      "### Strategy for this attempt:",
      "1. Read ALL error messages below — don't skip any",
      "2. If a test is fundamentally wrong, fix the test",
      "3. If a type error blocks the build, fix the types first",
      "4. Run `npx tsc --noEmit` to verify types before running tests",
      "5. Run the full test suite and include output",
      "6. If tests still fail, at minimum ensure the build passes",
      "",
    );
  }

  parts.push(
    "### Recent output (contains error details):",
    "```",
    recentOutput,
    "```",
  );

  return parts.join("\n");
}

// ============================================
// Helpers
// ============================================

function buildResult(allOutput: string, iterations: number, error?: string): MultiTurnResult {
  const urls = extractUrls(allOutput);
  const summary = allOutput.slice(-500).trim();
  const analysis = analyzeOutput(allOutput);

  return {
    success: !error && analysis.tests !== "failed" && analysis.build !== "failed",
    output: allOutput,
    summary,
    iterations,
    prUrl: urls.prUrl,
    prNumber: urls.prNumber,
    previewUrl: urls.previewUrl,
    error,
  };
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [multi-turn] ${msg}`);
}
