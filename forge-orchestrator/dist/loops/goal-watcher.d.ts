import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
export declare function startGoalWatcher(supabase: SupabaseClient, config: ForgeConfig & {
    runOnce?: boolean;
}): Promise<void>;
//# sourceMappingURL=goal-watcher.d.ts.map