import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

export interface CostEventInput {
  companyId: string;
  agentId: string;
  runId: string;
  issueId?: string;
  projectId?: string;
  provider: string;
  model: string;
  billingType: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costCents: number;
}

export async function recordCost(
  supabase: SupabaseClient,
  input: CostEventInput,
): Promise<void> {
  const { error } = await supabase.from('cost_events').insert({
    company_id: input.companyId,
    agent_id: input.agentId,
    run_id: input.runId,
    issue_id: input.issueId || null,
    project_id: input.projectId || null,
    provider: input.provider,
    model: input.model,
    billing_type: input.billingType,
    input_tokens: input.inputTokens,
    cached_input_tokens: input.cachedInputTokens,
    output_tokens: input.outputTokens,
    cost_cents: input.costCents,
    occurred_at: new Date().toISOString(),
  });

  if (error) {
    logger.error({ error, runId: input.runId }, 'Failed to record cost event');
  }
}
