/**
 * FORGE-345 — ETL transform layer: Paperclip → forge schema
 *
 * Pure functions only. No I/O. All DB logic lives in the migration script.
 * Each function is tested in src/__tests__/etl-paperclip-to-forge.test.ts.
 *
 * Source: Paperclip embedded postgres (company_id 2fbacee3-…, port 54331 scratch)
 * Destination: Supabase forge schema (company_id 99338dee-…)
 */
export declare const PAPERCLIP_COMPANY_ID = "2fbacee3-14cf-4526-b577-96d062ef71f2";
export declare const FORGE_COMPANY_ID = "99338dee-5fdc-4cbf-a344-5c08ec112a2b";
/**
 * Tables to DROP entirely — never written to forge.
 * Includes prefix-matched tables (plugin_*).
 */
export declare const DROP_TABLES: readonly string[];
/**
 * Remaps the Paperclip DirtSync company UUID → forge DirtSync company UUID.
 * Any other UUID is returned unchanged (passthrough for multi-tenant safety).
 */
export declare function transformCompanyId(id: string): string;
/**
 * Maps Paperclip issue status values to forge status values.
 * Delta: in_review → review (the ONLY difference per collision audit).
 */
export declare function transformStatus(status: string): string;
/**
 * Maps Paperclip agent adapter_type to forge adapter values.
 * Delta: claude_local → claude (the ONLY difference per collision audit).
 */
export declare function transformAdapterType(adapterType: string): string;
/**
 * Returns true if the given Paperclip table should be excluded from ETL.
 * Handles exact matches and the plugin_* prefix.
 */
export declare function shouldDropTable(tableName: string): boolean;
/** Paperclip agent row shape (source) */
export interface PaperclipAgent {
    id: string;
    company_id: string;
    name: string;
    role: string;
    title?: string | null;
    icon?: string | null;
    status: string;
    adapter_type: string;
    adapter_config: Record<string, unknown>;
    prompt_template?: string | null;
    bootstrap_prompt?: string | null;
    instructions_file?: string | null;
    skills?: string[];
    session_id?: string | null;
    budget_monthly_cents?: number;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}
/** Paperclip project row shape (source) */
export interface PaperclipProject {
    id: string;
    company_id: string;
    name: string;
    description?: string | null;
    status: string;
    repo_url?: string | null;
    repo_branch?: string | null;
    workspace_dir?: string | null;
    color?: string | null;
    target_date?: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}
/** Paperclip goal row shape (source) */
export interface PaperclipGoal {
    id: string;
    company_id: string;
    title: string;
    description?: string | null;
    level: string;
    status: string;
    parent_id?: string | null;
    owner_agent_id?: string | null;
    created_at: string;
    updated_at: string;
    completed_at?: string | null;
    [key: string]: unknown;
}
/** Paperclip issue row shape (source) */
export interface PaperclipIssue {
    id: string;
    company_id: string;
    project_id?: string | null;
    parent_id?: string | null;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    identifier?: string | null;
    issue_number?: number | null;
    assignee_agent_id?: string | null;
    acceptance_criteria?: unknown;
    tags?: string[];
    created_at: string;
    updated_at: string;
    started_at?: string | null;
    completed_at?: string | null;
    cancelled_at?: string | null;
    branch_name?: string | null;
    pr_url?: string | null;
    goal_id?: string | null;
    [key: string]: unknown;
}
/** Paperclip issue_comment row shape (source) */
export interface PaperclipComment {
    id: string;
    company_id: string;
    issue_id: string;
    author_agent_id?: string | null;
    author_user_id?: string | null;
    body: string;
    mentions?: string[];
    created_by_run_id?: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}
/** Paperclip approval row shape (source) */
export interface PaperclipApproval {
    id: string;
    company_id: string;
    type: string;
    requested_by_agent_id?: string | null;
    status: string;
    payload: Record<string, unknown>;
    decision_note?: string | null;
    decided_by_user_id?: string | null;
    decided_at?: string | null;
    run_id?: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
}
/**
 * Builds a forge.agents row from a Paperclip agent.
 * Uses UPSERT-by-name strategy: the migration script looks up existing forge
 * agent IDs by name and provides them; this function just assembles the payload.
 */
export declare function buildAgentRow(src: PaperclipAgent): Record<string, unknown>;
/**
 * Builds a forge.projects row from a Paperclip project.
 */
export declare function buildProjectRow(src: PaperclipProject): Record<string, unknown>;
/**
 * Builds a forge.goals row from a Paperclip goal.
 * owner_agent_id is remapped via agentIdMap when available.
 */
export declare function buildGoalRow(src: PaperclipGoal, agentIdMap?: Map<string, string>, goalIdMap?: Map<string, string>): Record<string, unknown>;
/**
 * Builds a forge.issues row from a Paperclip issue.
 * All FK remapping is done via the supplied ID maps.
 */
export declare function buildIssueRow(src: PaperclipIssue, forgeCompanyId: string, agentIdMap: Map<string, string>, projectIdMap: Map<string, string>, goalIdMap: Map<string, string>): Record<string, unknown>;
/**
 * Builds a forge.issue_comments row from a Paperclip comment.
 */
export declare function buildCommentRow(src: PaperclipComment, forgeCompanyId: string, issueIdMap: Map<string, string>, agentIdMap: Map<string, string>): Record<string, unknown>;
/**
 * Builds a forge.approvals row from a Paperclip approval.
 * Remaps issue_id references inside payload.
 */
export declare function buildApprovalRow(src: PaperclipApproval, forgeCompanyId: string, agentIdMap: Map<string, string>, issueIdMap: Map<string, string>): Record<string, unknown>;
//# sourceMappingURL=etl-transforms.d.ts.map