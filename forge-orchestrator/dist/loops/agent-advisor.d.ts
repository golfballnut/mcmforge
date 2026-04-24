import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
export declare function startAgentAdvisor(supabase: SupabaseClient, config: ForgeConfig & {
    runOnce?: boolean;
}): Promise<void>;
//# sourceMappingURL=agent-advisor.d.ts.map