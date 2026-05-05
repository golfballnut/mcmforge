import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
export declare function getActiveRunCount(): number;
export declare function getActiveRuns(): Map<string, {
    pid: number;
    abortController: AbortController;
}>;
export declare function setShuttingDown(): void;
export declare function startRunExecutor(supabase: SupabaseClient, config: ForgeConfig): Promise<void>;
/**
 * Quota-cap fast-exit guard. If a run finished in <10s with exit=0 but posted
 * no comment on the issue, the agent almost certainly hit a token quota and
 * exited without doing any work. Auto-pause to break the re-spawn loop.
 *
 * Returns true when the agent was auto-paused; the caller should treat this as
 * "nothing to do" so auto-continue is also skipped.
 *
 * Exported for unit testing.
 */
export declare function checkAndPauseOnQuotaCap(supabase: SupabaseClient, agentId: string, runId: string, issueId: string, runDurationMs: number): Promise<boolean>;
export declare function executeRun(supabase: SupabaseClient, config: ForgeConfig, run: any, agent: any): Promise<void>;
//# sourceMappingURL=run-executor.d.ts.map