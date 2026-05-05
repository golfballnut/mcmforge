/**
 * FORGE-345 — ETL transform layer: Paperclip → forge schema
 *
 * Pure functions only. No I/O. All DB logic lives in the migration script.
 * Each function is tested in src/__tests__/etl-paperclip-to-forge.test.ts.
 *
 * Source: Paperclip embedded postgres (company_id 2fbacee3-…, port 54331 scratch)
 * Destination: Supabase forge schema (company_id 99338dee-…)
 */

// ── Constants ───────────────────────────────────────────────────────────────

export const PAPERCLIP_COMPANY_ID = '2fbacee3-14cf-4526-b577-96d062ef71f2';
export const FORGE_COMPANY_ID = '99338dee-5fdc-4cbf-a344-5c08ec112a2b';

/**
 * Tables to DROP entirely — never written to forge.
 * Includes prefix-matched tables (plugin_*).
 */
export const DROP_TABLES: readonly string[] = [
  'heartbeat_runs',
  'heartbeat_run_events',
  'agent_wakeup_requests',
  'execution_workspaces',
  'workspace_operations',
  'documents',
  'activity_log',
  'cost_events',
  'user',
  'account',
  'session',
  'agent_api_keys',
  'board_api_keys',
];

// ── Simple transforms ────────────────────────────────────────────────────────

/**
 * Remaps the Paperclip DirtSync company UUID → forge DirtSync company UUID.
 * Any other UUID is returned unchanged (passthrough for multi-tenant safety).
 */
export function transformCompanyId(id: string): string {
  return id === PAPERCLIP_COMPANY_ID ? FORGE_COMPANY_ID : id;
}

/**
 * Maps Paperclip issue status values to forge status values.
 * Delta: in_review → review (the ONLY difference per collision audit).
 */
export function transformStatus(status: string): string {
  if (status === 'in_review') return 'review';
  return status;
}

/**
 * Maps Paperclip agent adapter_type to forge adapter values.
 * Delta: claude_local → claude (the ONLY difference per collision audit).
 */
export function transformAdapterType(adapterType: string): string {
  if (adapterType === 'claude_local') return 'claude';
  return adapterType;
}

/**
 * Returns true if the given Paperclip table should be excluded from ETL.
 * Handles exact matches and the plugin_* prefix.
 */
export function shouldDropTable(tableName: string): boolean {
  if (tableName.startsWith('plugin_')) return true;
  return (DROP_TABLES as string[]).includes(tableName);
}

// ── Row builders ─────────────────────────────────────────────────────────────

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

// ── Builder functions ─────────────────────────────────────────────────────

/**
 * Builds a forge.agents row from a Paperclip agent.
 * Uses UPSERT-by-name strategy: the migration script looks up existing forge
 * agent IDs by name and provides them; this function just assembles the payload.
 */
export function buildAgentRow(src: PaperclipAgent): Record<string, unknown> {
  return {
    company_id: transformCompanyId(src.company_id),
    name: src.name,
    role: src.role,
    title: src.title ?? null,
    icon: src.icon ?? null,
    status: src.status,
    adapter_type: transformAdapterType(src.adapter_type),
    adapter_config: src.adapter_config,
    prompt_template: src.prompt_template ?? null,
    bootstrap_prompt: src.bootstrap_prompt ?? null,
    instructions_file: src.instructions_file ?? null,
    skills: src.skills ?? [],
    session_id: src.session_id ?? null,
    budget_monthly_cents: src.budget_monthly_cents ?? 0,
    created_at: src.created_at,
    updated_at: src.updated_at,
  };
}

/**
 * Builds a forge.projects row from a Paperclip project.
 */
export function buildProjectRow(src: PaperclipProject): Record<string, unknown> {
  return {
    company_id: transformCompanyId(src.company_id),
    name: src.name,
    description: src.description ?? null,
    status: src.status,
    repo_url: src.repo_url ?? null,
    repo_branch: src.repo_branch ?? null,
    workspace_dir: src.workspace_dir ?? null,
    color: src.color ?? null,
    target_date: src.target_date ?? null,
    created_at: src.created_at,
    updated_at: src.updated_at,
  };
}

/**
 * Builds a forge.goals row from a Paperclip goal.
 * owner_agent_id is remapped via agentIdMap when available.
 */
export function buildGoalRow(
  src: PaperclipGoal,
  agentIdMap?: Map<string, string>,
  goalIdMap?: Map<string, string>,
): Record<string, unknown> {
  const ownerAgentId = src.owner_agent_id
    ? (agentIdMap?.get(src.owner_agent_id) ?? null)
    : null;
  const parentId = src.parent_id
    ? (goalIdMap?.get(src.parent_id) ?? null)
    : null;
  return {
    company_id: transformCompanyId(src.company_id),
    title: src.title,
    description: src.description ?? null,
    level: src.level,
    status: src.status,
    parent_id: parentId,
    owner_agent_id: ownerAgentId,
    created_at: src.created_at,
    updated_at: src.updated_at,
    completed_at: src.completed_at ?? null,
  };
}

/**
 * Builds a forge.issues row from a Paperclip issue.
 * All FK remapping is done via the supplied ID maps.
 */
export function buildIssueRow(
  src: PaperclipIssue,
  forgeCompanyId: string,
  agentIdMap: Map<string, string>,
  projectIdMap: Map<string, string>,
  goalIdMap: Map<string, string>,
): Record<string, unknown> {
  const assigneeForgeId = src.assignee_agent_id
    ? (agentIdMap.get(src.assignee_agent_id) ?? null)
    : null;
  const projectForgeId = src.project_id
    ? (projectIdMap.get(src.project_id) ?? null)
    : null;
  const goalForgeId = src.goal_id
    ? (goalIdMap.get(src.goal_id) ?? null)
    : null;

  return {
    company_id: forgeCompanyId,
    project_id: projectForgeId,
    parent_id: null, // Paperclip hierarchy not ported (no parent tickets in DIR-*)
    title: src.title,
    description: src.description ?? null,
    status: transformStatus(src.status),
    priority: src.priority ?? 'medium',
    identifier: src.identifier ?? null,
    issue_number: src.issue_number ?? null,
    assignee_agent_id: assigneeForgeId,
    acceptance_criteria: src.acceptance_criteria ?? [],
    tags: src.tags ?? [],
    created_at: src.created_at,
    updated_at: src.updated_at,
    started_at: src.started_at ?? null,
    completed_at: src.completed_at ?? null,
    cancelled_at: src.cancelled_at ?? null,
    branch_name: src.branch_name ?? null,
    pr_url: src.pr_url ?? null,
    goal_id: goalForgeId,
    // forge-only fields set to defaults for ported tickets
    origin_kind: 'manual',
    video_loop_required: false,
    diff_threshold: 15,
    use_ticket_lead: true,
  };
}

/**
 * Builds a forge.issue_comments row from a Paperclip comment.
 */
export function buildCommentRow(
  src: PaperclipComment,
  forgeCompanyId: string,
  issueIdMap: Map<string, string>,
  agentIdMap: Map<string, string>,
): Record<string, unknown> {
  const forgeIssueId = issueIdMap.get(src.issue_id) ?? src.issue_id;
  const forgeAgentId = src.author_agent_id
    ? (agentIdMap.get(src.author_agent_id) ?? null)
    : null;

  return {
    company_id: forgeCompanyId,
    issue_id: forgeIssueId,
    author_agent_id: forgeAgentId,
    author_user_id: src.author_user_id ?? null,
    body: src.body,
    mentions: src.mentions ?? [],
    created_by_run_id: null, // Paperclip run_ids not ported
    created_at: src.created_at,
    updated_at: src.updated_at,
  };
}

/**
 * Builds a forge.approvals row from a Paperclip approval.
 * Remaps issue_id references inside payload.
 */
export function buildApprovalRow(
  src: PaperclipApproval,
  forgeCompanyId: string,
  agentIdMap: Map<string, string>,
  issueIdMap: Map<string, string>,
): Record<string, unknown> {
  const forgeAgentId = src.requested_by_agent_id
    ? (agentIdMap.get(src.requested_by_agent_id) ?? null)
    : null;

  // Remap any issue_id embedded in the payload JSON
  const payload = { ...src.payload };
  if (payload.issue_id && typeof payload.issue_id === 'string') {
    payload.issue_id = issueIdMap.get(payload.issue_id) ?? payload.issue_id;
  }

  return {
    company_id: forgeCompanyId,
    type: src.type,
    requested_by_agent_id: forgeAgentId,
    status: src.status,
    payload,
    decision_note: src.decision_note ?? null,
    decided_by_user_id: src.decided_by_user_id ?? null,
    decided_at: src.decided_at ?? null,
    run_id: null, // Paperclip run_ids not ported
    created_at: src.created_at,
    updated_at: src.updated_at,
  };
}
