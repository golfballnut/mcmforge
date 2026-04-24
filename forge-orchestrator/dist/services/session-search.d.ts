import { SupabaseClient } from '@supabase/supabase-js';
/**
 * Agent memory via Supabase runs table.
 *
 * Replaces the broken FTS5/better-sqlite3 approach.
 * Queries the last N successful runs for an agent and returns their summaries.
 * This gives agents memory of what they did in prior runs — no more amnesia.
 */
export declare function indexRunResult(_dataDir: string, _params: {
    runId: string;
    agentId: string;
    agentName: string;
    companyId: string;
    resultText: string;
    costUsd: number | null;
    turnsUsed: number | null;
    status: string;
    issueId: string | null;
}): void;
export declare function searchAgentHistory(supabase: SupabaseClient, params: {
    agentId: string;
    query?: string;
    limit?: number;
}): Promise<Array<{
    runId: string;
    resultText: string;
    status: string;
    issueId: string | null;
    createdAt: string;
}>>;
//# sourceMappingURL=session-search.d.ts.map