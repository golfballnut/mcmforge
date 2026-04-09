import { SupabaseClient } from '@supabase/supabase-js';
import { isIdleText, isSubstantiveComment } from '../lib/idlePatterns.js';
import { logger } from '../utils/logger.js';

const PR_URL_PATTERN = /https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/i;
const BUILD_FAIL_PATTERN = /\b(build failed|compile error|compilation error|xcodebuild.*error|error:.*failed)\b/i;
const TEST_FAIL_PATTERN = /\b(test.*failed|failing test|xctestrun.*fail|xctest.*fail|\d+ test.*failed)\b/i;
const TESTS_PASS_PATTERN = /\b(tests? passed|all tests? (pass|green)|build succeeded)\b/i;

export interface RunArtifacts {
  pr: string | null;
  substantiveComments: string[];
  lastComments: string[];
  outputText: string;
}

export interface OutcomeClassification {
  outcomeClass: OutcomeClass;
  reason: string;
}

export type OutcomeClass =
  | 'shipped'
  | 'tests_fail'
  | 'build_fail'
  | 'silent_failure'
  | 'idle_loop_exit'
  | 'timeout'
  | 'error';

/**
 * Collect all artifacts a run produced: PR URL, substantive comments, output text.
 * Queries issue_comments for comments created by this run, plus the run's own summary.
 */
export async function getRunArtifacts(
  supabase: SupabaseClient,
  runId: string,
): Promise<RunArtifacts> {
  const [commentsResult, runResult] = await Promise.all([
    supabase
      .from('issue_comments')
      .select('body, created_at')
      .eq('created_by_run_id', runId)
      .order('created_at', { ascending: true }),
    supabase.from('runs').select('summary, result_json, stdout_excerpt').eq('id', runId).single(),
  ]);

  if (commentsResult.error) {
    logger.warn({ error: commentsResult.error, runId }, 'Failed to fetch run comments for artifact check');
  }
  if (runResult.error) {
    logger.warn({ error: runResult.error, runId }, 'Failed to fetch run summary for artifact check');
  }

  const comments = (commentsResult.data || []).map((c: { body: string }) => c.body);
  const run = runResult.data;

  const outputParts = [
    run?.summary ?? '',
    run?.stdout_excerpt ?? '',
    JSON.stringify(run?.result_json ?? ''),
    ...comments,
  ];
  const outputText = outputParts.join('\n');

  const prMatch = PR_URL_PATTERN.exec(outputText);
  const pr = prMatch?.[0] ?? null;
  const substantiveComments = comments.filter(isSubstantiveComment);

  return { pr, substantiveComments, lastComments: comments, outputText };
}

/**
 * Determine the outcome_class for a completed run based on its artifacts and exit state.
 *
 * Priority order (highest → lowest):
 *   1. timeout  — run hit max turns or was forcibly timed out
 *   2. idle_loop_exit — last 2+ comments are all idle-pattern matches
 *   3. build_fail — build error in output
 *   4. tests_fail — test failure in output
 *   5. silent_failure — exit 0 but zero artifacts
 *   6. shipped — has PR URL (implies commits)
 *   7. error — non-zero exit / unknown
 */
export function classifyOutcome(
  timedOut: boolean,
  exitCode: number | null,
  artifacts: RunArtifacts,
): OutcomeClassification {
  if (timedOut) {
    return { outcomeClass: 'timeout', reason: 'Run hit max turns or was timed out' };
  }

  // Idle-loop: last 2+ comments are all idle-pattern matches
  if (artifacts.lastComments.length >= 2) {
    const lastTwo = artifacts.lastComments.slice(-2);
    const allIdle = lastTwo.every((c) => isIdleText(c));
    if (allIdle) {
      return { outcomeClass: 'idle_loop_exit', reason: 'Last 2+ comments matched idle-loop patterns' };
    }
  }

  if (exitCode !== 0) {
    // Check output for specific failure modes before falling back to generic error
    if (BUILD_FAIL_PATTERN.test(artifacts.outputText)) {
      return { outcomeClass: 'build_fail', reason: 'Build failure detected in output' };
    }
    if (TEST_FAIL_PATTERN.test(artifacts.outputText)) {
      return { outcomeClass: 'tests_fail', reason: 'Test failures detected in output' };
    }
    return { outcomeClass: 'error', reason: `Non-zero exit code ${exitCode}` };
  }

  // Exit 0 path — check for meaningful artifacts
  if (BUILD_FAIL_PATTERN.test(artifacts.outputText)) {
    return { outcomeClass: 'build_fail', reason: 'Build failure detected in output despite exit 0' };
  }
  if (TEST_FAIL_PATTERN.test(artifacts.outputText)) {
    return { outcomeClass: 'tests_fail', reason: 'Test failures detected in output despite exit 0' };
  }

  if (artifacts.pr !== null) {
    return { outcomeClass: 'shipped', reason: `PR URL found: ${artifacts.pr}` };
  }

  if (artifacts.substantiveComments.length > 0) {
    // Has real output but no PR — still counts as shipped (research/report run)
    return { outcomeClass: 'shipped', reason: `${artifacts.substantiveComments.length} substantive comment(s) posted` };
  }

  return {
    outcomeClass: 'silent_failure',
    reason: 'Run exited 0 but produced no PR, commits, or substantive comments',
  };
}
