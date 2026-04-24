import { SupabaseClient } from '@supabase/supabase-js';
export declare function releaseIssueExecution(supabase: SupabaseClient, run: {
    id: string;
    context_snapshot?: Record<string, unknown> | null;
}): Promise<void>;
export declare function lockIssueExecution(supabase: SupabaseClient, issueId: string, runId: string): Promise<boolean>;
//# sourceMappingURL=issue-lifecycle.d.ts.map