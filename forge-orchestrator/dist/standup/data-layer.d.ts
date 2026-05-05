import type { SupabaseClient } from '@supabase/supabase-js';
export interface GitCommit {
    timestamp: string;
    subject: string;
    author: string;
}
export interface RunStats {
    total: number;
    succeeded: number;
    failed: number;
    totalCostUsd: number;
}
export interface OpenIssue {
    id: string;
    title: string;
    status: string;
    updated_at: string;
}
export interface StandupData {
    openIssues: OpenIssue[];
    runStats: RunStats;
    recentCommits: GitCommit[];
}
/**
 * Fetch all data needed to compose a daily standup.
 * - Issues: open issues with activity in last 24h
 * - Runs: last 24h count, status breakdown, total cost
 * - Git log: last 24h commits with subject + author
 */
export declare function fetchStandupData(supabase: SupabaseClient<any, any, any>, companyId: string): Promise<StandupData>;
//# sourceMappingURL=data-layer.d.ts.map