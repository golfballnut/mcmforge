import { SupabaseClient } from '@supabase/supabase-js';
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
export declare function recordCost(supabase: SupabaseClient, input: CostEventInput): Promise<void>;
//# sourceMappingURL=cost-ledger.d.ts.map