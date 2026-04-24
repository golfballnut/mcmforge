import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
export declare function startOrphanReaper(supabase: SupabaseClient, config: ForgeConfig & {
    runOnce?: boolean;
}): Promise<void>;
//# sourceMappingURL=orphan-reaper.d.ts.map