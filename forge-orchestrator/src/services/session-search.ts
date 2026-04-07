import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

/**
 * Agent memory via Supabase runs table.
 *
 * Replaces the broken FTS5/better-sqlite3 approach.
 * Queries the last N successful runs for an agent and returns their summaries.
 * This gives agents memory of what they did in prior runs — no more amnesia.
 */

export function indexRunResult(_dataDir: string, _params: {
  runId: string;
  agentId: string;
  agentName: string;
  companyId: string;
  resultText: string;
  costUsd: number | null;
  turnsUsed: number | null;
  status: string;
  issueId: string | null;
}): void {
  // Data is already stored in forge.runs — no separate index needed
}

export async function searchAgentHistory(
  supabase: SupabaseClient,
  params: {
    agentId: string;
    query?: string;
    limit?: number;
  },
): Promise<Array<{ runId: string; resultText: string; status: string; issueId: string | null; createdAt: string }>> {
  const limit = params.limit ?? 3;

  try {
    const { data, error } = await supabase
      .from('runs')
      .select('id, summary, status, context_snapshot, finished_at')
      .eq('agent_id', params.agentId)
      .eq('status', 'succeeded')
      .not('summary', 'is', null)
      .not('summary', 'like', '[SILENT]%')
      .order('finished_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error }, 'Failed to query agent history from Supabase');
      return [];
    }

    if (!data?.length) return [];

    return data.map((row) => ({
      runId: row.id,
      resultText: row.summary || '',
      status: row.status,
      issueId: row.context_snapshot?.issueId ?? null,
      createdAt: row.finished_at,
    }));
  } catch (err) {
    logger.error(err, 'searchAgentHistory failed');
    return [];
  }
}
