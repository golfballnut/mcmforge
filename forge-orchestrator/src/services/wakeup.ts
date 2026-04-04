import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

export interface WakeupInput {
  companyId: string;
  agentId: string;
  source: 'timer' | 'assignment' | 'on_demand' | 'mention' | 'routine';
  triggerDetail?: string;
  reason?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Create a wakeup request and a linked queued run.
 * Returns the run ID on success, null if skipped (duplicate idempotency key) or on error.
 */
export async function createWakeup(
  supabase: SupabaseClient,
  input: WakeupInput,
): Promise<string | null> {
  // Deduplicate on idempotency key if provided
  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from('wakeup_requests')
      .select('id, run_id')
      .eq('idempotency_key', input.idempotencyKey)
      .limit(1);

    if (existing?.length) {
      logger.debug(
        { agentId: input.agentId, idempotencyKey: input.idempotencyKey },
        'Wakeup skipped — duplicate idempotency key',
      );
      return existing[0].run_id ?? null;
    }
  }

  // Insert wakeup_request
  const { data: wakeup, error: wakeupError } = await supabase
    .from('wakeup_requests')
    .insert({
      company_id: input.companyId,
      agent_id: input.agentId,
      source: input.source,
      trigger_detail: input.triggerDetail ?? null,
      reason: input.reason ?? null,
      payload: input.payload ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      status: 'queued',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (wakeupError || !wakeup) {
    logger.error({ error: wakeupError, agentId: input.agentId }, 'Failed to create wakeup request');
    return null;
  }

  // Create a queued run linked to this wakeup
  const { data: run, error: runError } = await supabase
    .from('runs')
    .insert({
      company_id: input.companyId,
      agent_id: input.agentId,
      invocation_source: input.source,
      trigger_detail: input.triggerDetail ?? 'system',
      status: 'queued',
      context_snapshot: input.payload ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError || !run) {
    logger.error({ error: runError, wakeupId: wakeup.id }, 'Failed to create run for wakeup');
    // Roll back the wakeup so it doesn't sit in limbo
    await supabase.from('wakeup_requests').delete().eq('id', wakeup.id);
    return null;
  }

  // Link the run back to the wakeup
  await supabase
    .from('wakeup_requests')
    .update({ run_id: run.id, updated_at: new Date().toISOString() })
    .eq('id', wakeup.id);

  logger.debug(
    { agentId: input.agentId, source: input.source, runId: run.id },
    'Wakeup created',
  );

  return run.id as string;
}

/**
 * Mark a wakeup request as completed once its run has been claimed and started.
 */
export async function completeWakeup(
  supabase: SupabaseClient,
  wakeupId: string,
  runId: string,
): Promise<void> {
  const { error } = await supabase
    .from('wakeup_requests')
    .update({
      status: 'completed',
      run_id: runId,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', wakeupId);

  if (error) {
    logger.error({ error, wakeupId, runId }, 'Failed to complete wakeup');
  }
}
