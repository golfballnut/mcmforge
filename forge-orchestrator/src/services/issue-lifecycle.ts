import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

export async function releaseIssueExecution(
  supabase: SupabaseClient,
  run: { id: string; context_snapshot?: Record<string, unknown> | null },
): Promise<void> {
  const issueId = run.context_snapshot?.issueId as string | undefined;
  if (!issueId) return;

  // Only release the lock for issues still in the dispatch pool. Issues
  // awaiting review / done / cancelled / blocked should keep their
  // execution_run_id so assignment watchers don't re-checkout and spawn
  // a wake loop. (Observed 2026-04-21 on FORGE-284: Builder→COO loop.)
  const { error } = await supabase
    .from('issues')
    .update({
      execution_run_id: null,
      execution_locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .in('status', ['todo', 'in_progress']);

  if (error) {
    logger.error({ error, issueId, runId: run.id }, 'Failed to release issue execution lock');
  }
}

export async function lockIssueExecution(
  supabase: SupabaseClient,
  issueId: string,
  runId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('issues')
    .update({
      execution_run_id: runId,
      execution_locked_at: new Date().toISOString(),
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .is('execution_run_id', null)
    .select()
    .single();

  if (error || !data) {
    logger.warn({ issueId, runId }, 'Failed to lock issue — already locked');
    return false;
  }
  return true;
}
