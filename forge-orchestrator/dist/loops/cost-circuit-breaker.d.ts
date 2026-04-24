import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
export declare function tick(supabase: SupabaseClient): Promise<{
    checked: number;
    tripped: number;
    failClosed?: number;
}>;
export declare function startCostCircuitBreaker(supabase: SupabaseClient, _config: ForgeConfig): Promise<void>;
//# sourceMappingURL=cost-circuit-breaker.d.ts.map