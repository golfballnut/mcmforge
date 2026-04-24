import { SupabaseClient } from '@supabase/supabase-js';
export interface WakeupInput {
    companyId: string;
    agentId: string;
    source: 'timer' | 'assignment' | 'on_demand' | 'mention' | 'routine';
    triggerDetail?: string;
    reason?: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
    priority?: number;
}
/**
 * Create a wakeup request and a linked queued run.
 * Returns the run ID on success, null if skipped (duplicate idempotency key) or on error.
 */
export declare function createWakeup(supabase: SupabaseClient, input: WakeupInput): Promise<string | null>;
/**
 * Mark a wakeup request as completed once its run has been claimed and started.
 */
export declare function completeWakeup(supabase: SupabaseClient, wakeupId: string, runId: string): Promise<void>;
//# sourceMappingURL=wakeup.d.ts.map