import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
export declare function getActiveRunCount(): number;
export declare function getActiveRuns(): Map<string, {
    pid: number;
    abortController: AbortController;
}>;
export declare function setShuttingDown(): void;
export declare function startRunExecutor(supabase: SupabaseClient, config: ForgeConfig): Promise<void>;
//# sourceMappingURL=run-executor.d.ts.map