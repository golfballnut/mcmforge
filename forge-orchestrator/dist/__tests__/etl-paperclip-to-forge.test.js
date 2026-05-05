/**
 * FORGE-345 — ETL Paperclip → forge for DirtSync (M1.4)
 *
 * Tests the transform layer of the migration script against the hand-crafted
 * fixture (__fixtures__/paperclip-mini-dump.sql). The fixture is deterministic
 * and does NOT require a running Postgres instance — transforms are tested in
 * pure TypeScript.
 *
 * TDD: this file is written BEFORE the migration module exists.
 * Run `npm test` — it will fail until migration.ts is implemented.
 */
import { describe, it, expect } from 'vitest';
import { transformCompanyId, transformStatus, transformAdapterType, shouldDropTable, buildIssueRow, buildCommentRow, buildAgentRow, buildGoalRow, buildProjectRow, buildApprovalRow, PAPERCLIP_COMPANY_ID, FORGE_COMPANY_ID, DROP_TABLES, } from '../migration/etl-transforms.js';
// ── Source IDs ─────────────────────────────────────────────────────────────
const SRC_COMPANY = '2fbacee3-14cf-4526-b577-96d062ef71f2';
const DST_COMPANY = '99338dee-5fdc-4cbf-a344-5c08ec112a2b';
// ── Fixture data matching __fixtures__/paperclip-mini-dump.sql ─────────────
const PAPERCLIP_AGENT_1 = {
    id: 'aaaaaa01-0000-0000-0000-000000000001',
    company_id: SRC_COMPANY,
    name: 'DirtSync Shipper',
    role: 'engineer',
    title: 'Shipper',
    icon: null,
    status: 'paused',
    adapter_type: 'claude_local',
    adapter_config: { cwd: '/Users/dirtsyncmini/DirtSync', cliFlags: ['--dangerously-skip-permissions'] },
    prompt_template: null,
    bootstrap_prompt: 'You are the DirtSync Shipper. Ship features.',
    instructions_file: '/Users/dirtsyncmini/MCMForge/agents/dirtsync/SHIPPER.md',
    skills: ['forge-ship', 'github-pr'],
    session_id: null,
    budget_monthly_cents: 5000,
    created_at: '2026-04-23T23:00:00.240Z',
    updated_at: '2026-04-23T23:00:00.240Z',
};
const PAPERCLIP_AGENT_2 = {
    id: 'aaaaaa02-0000-0000-0000-000000000002',
    company_id: SRC_COMPANY,
    name: 'DirtSync Fixer',
    role: 'engineer',
    title: 'Fixer',
    icon: null,
    status: 'idle',
    adapter_type: 'claude_local',
    adapter_config: { cwd: '/Users/dirtsyncmini/DirtSync' },
    prompt_template: 'You are a fixer.',
    bootstrap_prompt: null,
    instructions_file: null,
    skills: [],
    session_id: null,
    budget_monthly_cents: 3000,
    created_at: '2026-04-23T23:00:00.240Z',
    updated_at: '2026-04-23T23:00:00.240Z',
};
const PAPERCLIP_PROJECT = {
    id: 'bbbbbb01-0000-0000-0000-000000000001',
    company_id: SRC_COMPANY,
    name: 'DirtSync iOS',
    description: 'Main iOS app project',
    status: 'active',
    repo_url: 'https://github.com/mcm/DirtSync',
    repo_branch: 'master',
    workspace_dir: '/Users/dirtsyncmini/DirtSync',
    color: '#3b82f6',
    target_date: '2026-06-30',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
};
const PAPERCLIP_GOAL_1 = {
    id: 'cccccc01-0000-0000-0000-000000000001',
    company_id: SRC_COMPANY,
    title: 'Ship DirtSync v1 to TestFlight',
    description: 'Get the app to external testers',
    level: 'company',
    status: 'active',
    parent_id: null,
    owner_agent_id: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    completed_at: null,
};
const PAPERCLIP_ISSUE_1 = {
    id: 'dddddd01-0000-0000-0000-000000000001',
    company_id: SRC_COMPANY,
    project_id: PAPERCLIP_PROJECT.id,
    parent_id: null,
    title: 'Fix turn-by-turn voice bug',
    description: 'Voice instructions cut off after 3 turns',
    status: 'done',
    priority: 'high',
    identifier: 'DIR-12',
    issue_number: 12,
    assignee_agent_id: PAPERCLIP_AGENT_1.id,
    acceptance_criteria: [{ text: 'Voice plays all turns', done: true }],
    tags: ['nav', 'audio'],
    created_at: '2026-04-20T10:00:00.000Z',
    updated_at: '2026-04-25T15:00:00.000Z',
    started_at: '2026-04-21T09:00:00.000Z',
    completed_at: '2026-04-25T14:00:00.000Z',
    cancelled_at: null,
    branch_name: 'feat/dir-12-voice-bug',
    pr_url: 'https://github.com/mcm/DirtSync/pull/42',
    goal_id: PAPERCLIP_GOAL_1.id,
};
const PAPERCLIP_ISSUE_2 = {
    id: 'dddddd02-0000-0000-0000-000000000002',
    company_id: SRC_COMPANY,
    project_id: PAPERCLIP_PROJECT.id,
    parent_id: null,
    title: 'Saved destinations screen',
    description: 'Show saved destinations on home',
    status: 'in_review', // <-- MUST map to 'review'
    priority: 'medium',
    identifier: 'DIR-15',
    issue_number: 15,
    assignee_agent_id: PAPERCLIP_AGENT_2.id,
    acceptance_criteria: [],
    tags: ['ux'],
    created_at: '2026-04-28T10:00:00.000Z',
    updated_at: '2026-04-28T10:00:00.000Z',
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    branch_name: null,
    pr_url: null,
    goal_id: null,
};
const PAPERCLIP_ISSUE_3 = {
    id: 'dddddd03-0000-0000-0000-000000000003',
    company_id: SRC_COMPANY,
    project_id: null,
    parent_id: null,
    title: 'Fix map centering on launch',
    description: null,
    status: 'backlog',
    priority: 'low',
    identifier: 'DIR-7',
    issue_number: 7,
    assignee_agent_id: null,
    acceptance_criteria: [],
    tags: [],
    created_at: '2026-04-10T08:00:00.000Z',
    updated_at: '2026-04-10T08:00:00.000Z',
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    branch_name: null,
    pr_url: null,
    goal_id: null,
};
const PAPERCLIP_COMMENT_1 = {
    id: 'eeeeee01-0000-0000-0000-000000000001',
    company_id: SRC_COMPANY,
    issue_id: PAPERCLIP_ISSUE_1.id,
    author_agent_id: PAPERCLIP_AGENT_1.id,
    author_user_id: null,
    body: 'Fixed the audio session configuration.',
    mentions: [],
    created_by_run_id: null,
    created_at: '2026-04-25T14:00:00.000Z',
    updated_at: '2026-04-25T14:00:00.000Z',
};
const PAPERCLIP_COMMENT_2 = {
    id: 'eeeeee02-0000-0000-0000-000000000002',
    company_id: SRC_COMPANY,
    issue_id: PAPERCLIP_ISSUE_1.id,
    author_agent_id: null,
    author_user_id: 'steve',
    body: 'LGTM, merging.',
    mentions: ['DirtSync Shipper'],
    created_by_run_id: null,
    created_at: '2026-04-25T15:00:00.000Z',
    updated_at: '2026-04-25T15:00:00.000Z',
};
const PAPERCLIP_APPROVAL = {
    id: 'ffffff01-0000-0000-0000-000000000001',
    company_id: SRC_COMPANY,
    type: 'merge_pr',
    requested_by_agent_id: PAPERCLIP_AGENT_1.id,
    status: 'approved',
    payload: { pr_url: 'https://github.com/mcm/DirtSync/pull/42', issue_id: PAPERCLIP_ISSUE_1.id },
    decision_note: 'Approved on device test.',
    decided_by_user_id: 'steve',
    decided_at: '2026-04-25T15:30:00.000Z',
    run_id: null,
    created_at: '2026-04-25T14:30:00.000Z',
    updated_at: '2026-04-25T15:30:00.000Z',
};
// ── Agent ID remapping table (simulates what the migrator builds) ─────────
// In real migration: forge agent IDs are looked up by name.
const AGENT_ID_MAP = new Map([
    [PAPERCLIP_AGENT_1.id, '9dbeabed-bb38-43a7-a77d-794c36b6e0fd'], // forge: DirtSync Shipper
    [PAPERCLIP_AGENT_2.id, '2df0ada3-3052-456e-8d90-b42caddbb1d9'], // forge: DirtSync Fixer
]);
const ISSUE_ID_MAP = new Map([
    [PAPERCLIP_ISSUE_1.id, 'new-forge-issue-id-01'],
    [PAPERCLIP_ISSUE_2.id, 'new-forge-issue-id-02'],
    [PAPERCLIP_ISSUE_3.id, 'new-forge-issue-id-03'],
]);
const PROJECT_ID_MAP = new Map([
    [PAPERCLIP_PROJECT.id, 'forge-project-id-01'],
]);
const GOAL_ID_MAP = new Map([
    [PAPERCLIP_GOAL_1.id, 'forge-goal-id-01'],
]);
// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════
describe('ETL constants', () => {
    it('exports the correct source company ID', () => {
        expect(PAPERCLIP_COMPANY_ID).toBe(SRC_COMPANY);
    });
    it('exports the correct destination company ID', () => {
        expect(FORGE_COMPANY_ID).toBe(DST_COMPANY);
    });
    it('DROP_TABLES includes heartbeat_runs', () => {
        expect(DROP_TABLES).toContain('heartbeat_runs');
    });
    it('DROP_TABLES includes all required operational tables', () => {
        const required = [
            'heartbeat_runs',
            'heartbeat_run_events',
            'agent_wakeup_requests',
            'execution_workspaces',
            'workspace_operations',
            'documents',
            'activity_log',
            'cost_events',
        ];
        for (const t of required) {
            expect(DROP_TABLES, `DROP_TABLES should include ${t}`).toContain(t);
        }
    });
});
describe('transformCompanyId', () => {
    it('remaps Paperclip company_id to forge company_id', () => {
        expect(transformCompanyId(SRC_COMPANY)).toBe(DST_COMPANY);
    });
    it('leaves unknown company_ids unchanged (passthrough)', () => {
        const other = '11111111-1111-1111-1111-111111111111';
        expect(transformCompanyId(other)).toBe(other);
    });
});
describe('transformStatus', () => {
    it('maps in_review → review (the only delta)', () => {
        expect(transformStatus('in_review')).toBe('review');
    });
    it('passes through all other statuses unchanged', () => {
        const passthrough = ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled', 'archived', 'completed'];
        for (const s of passthrough) {
            expect(transformStatus(s), `status '${s}' should pass through`).toBe(s);
        }
    });
});
describe('transformAdapterType', () => {
    it('maps claude_local → claude (the only adapter delta)', () => {
        expect(transformAdapterType('claude_local')).toBe('claude');
    });
    it('passes through other adapter types unchanged', () => {
        expect(transformAdapterType('claude')).toBe('claude');
        expect(transformAdapterType('gemini')).toBe('gemini');
        expect(transformAdapterType('codex')).toBe('codex');
    });
});
describe('shouldDropTable', () => {
    it('returns true for heartbeat_runs', () => {
        expect(shouldDropTable('heartbeat_runs')).toBe(true);
    });
    it('returns true for plugin_* tables', () => {
        expect(shouldDropTable('plugin_something')).toBe(true);
        expect(shouldDropTable('plugin_events')).toBe(true);
    });
    it('returns true for user/account/session tables', () => {
        expect(shouldDropTable('user')).toBe(true);
        expect(shouldDropTable('account')).toBe(true);
        expect(shouldDropTable('session')).toBe(true);
        expect(shouldDropTable('agent_api_keys')).toBe(true);
        expect(shouldDropTable('board_api_keys')).toBe(true);
    });
    it('returns false for tables we ETL (issues, agents, etc.)', () => {
        expect(shouldDropTable('issues')).toBe(false);
        expect(shouldDropTable('agents')).toBe(false);
        expect(shouldDropTable('issue_comments')).toBe(false);
        expect(shouldDropTable('goals')).toBe(false);
        expect(shouldDropTable('projects')).toBe(false);
        expect(shouldDropTable('approvals')).toBe(false);
    });
});
describe('buildAgentRow', () => {
    it('remaps company_id', () => {
        const row = buildAgentRow(PAPERCLIP_AGENT_1);
        expect(row.company_id).toBe(DST_COMPANY);
    });
    it('renames adapter_type claude_local → claude', () => {
        const row = buildAgentRow(PAPERCLIP_AGENT_1);
        expect(row.adapter_type).toBe('claude');
    });
    it('preserves adapter_config passthrough', () => {
        const row = buildAgentRow(PAPERCLIP_AGENT_1);
        expect(row.adapter_config).toEqual(PAPERCLIP_AGENT_1.adapter_config);
    });
    it('preserves bootstrap_prompt', () => {
        const row = buildAgentRow(PAPERCLIP_AGENT_1);
        expect(row.bootstrap_prompt).toBe(PAPERCLIP_AGENT_1.bootstrap_prompt);
    });
    it('preserves name, role, title, skills', () => {
        const row = buildAgentRow(PAPERCLIP_AGENT_1);
        expect(row.name).toBe(PAPERCLIP_AGENT_1.name);
        expect(row.role).toBe(PAPERCLIP_AGENT_1.role);
        expect(row.title).toBe(PAPERCLIP_AGENT_1.title);
        expect(row.skills).toEqual(PAPERCLIP_AGENT_1.skills);
    });
});
describe('buildProjectRow', () => {
    it('remaps company_id', () => {
        const row = buildProjectRow(PAPERCLIP_PROJECT);
        expect(row.company_id).toBe(DST_COMPANY);
    });
    it('preserves name, description, status', () => {
        const row = buildProjectRow(PAPERCLIP_PROJECT);
        expect(row.name).toBe(PAPERCLIP_PROJECT.name);
        expect(row.description).toBe(PAPERCLIP_PROJECT.description);
        expect(row.status).toBe(PAPERCLIP_PROJECT.status);
    });
    it('preserves repo_url and workspace_dir', () => {
        const row = buildProjectRow(PAPERCLIP_PROJECT);
        expect(row.repo_url).toBe(PAPERCLIP_PROJECT.repo_url);
        expect(row.workspace_dir).toBe(PAPERCLIP_PROJECT.workspace_dir);
    });
});
describe('buildGoalRow', () => {
    it('remaps company_id', () => {
        const row = buildGoalRow(PAPERCLIP_GOAL_1);
        expect(row.company_id).toBe(DST_COMPANY);
    });
    it('preserves title, level, status', () => {
        const row = buildGoalRow(PAPERCLIP_GOAL_1);
        expect(row.title).toBe(PAPERCLIP_GOAL_1.title);
        expect(row.level).toBe(PAPERCLIP_GOAL_1.level);
        expect(row.status).toBe(PAPERCLIP_GOAL_1.status);
    });
});
describe('buildIssueRow', () => {
    it('remaps company_id', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.company_id).toBe(DST_COMPANY);
    });
    it('maps status in_review → review', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_2, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.status).toBe('review');
    });
    it('passes through non-in_review statuses', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.status).toBe('done');
        const row3 = buildIssueRow(PAPERCLIP_ISSUE_3, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row3.status).toBe('backlog');
    });
    it('preserves identifier (DIR-12, DIR-15, DIR-7)', () => {
        expect(buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP).identifier).toBe('DIR-12');
        expect(buildIssueRow(PAPERCLIP_ISSUE_2, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP).identifier).toBe('DIR-15');
        expect(buildIssueRow(PAPERCLIP_ISSUE_3, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP).identifier).toBe('DIR-7');
    });
    it('remaps assignee_agent_id via AGENT_ID_MAP', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.assignee_agent_id).toBe('9dbeabed-bb38-43a7-a77d-794c36b6e0fd');
    });
    it('sets assignee_agent_id to null when not in map', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_3, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.assignee_agent_id).toBeNull();
    });
    it('remaps project_id via PROJECT_ID_MAP', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.project_id).toBe('forge-project-id-01');
    });
    it('sets project_id to null when issue has no project', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_3, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.project_id).toBeNull();
    });
    it('remaps goal_id via GOAL_ID_MAP', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.goal_id).toBe('forge-goal-id-01');
    });
    it('preserves acceptance_criteria jsonb', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.acceptance_criteria).toEqual(PAPERCLIP_ISSUE_1.acceptance_criteria);
    });
    it('preserves tags array', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.tags).toEqual(['nav', 'audio']);
    });
    it('preserves pr_url and branch_name', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.pr_url).toBe(PAPERCLIP_ISSUE_1.pr_url);
        expect(row.branch_name).toBe(PAPERCLIP_ISSUE_1.branch_name);
    });
    it('preserves timestamps', () => {
        const row = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row.created_at).toBe(PAPERCLIP_ISSUE_1.created_at);
        expect(row.completed_at).toBe(PAPERCLIP_ISSUE_1.completed_at);
        expect(row.started_at).toBe(PAPERCLIP_ISSUE_1.started_at);
    });
});
describe('buildCommentRow', () => {
    it('remaps company_id', () => {
        const row = buildCommentRow(PAPERCLIP_COMMENT_1, DST_COMPANY, ISSUE_ID_MAP, AGENT_ID_MAP);
        expect(row.company_id).toBe(DST_COMPANY);
    });
    it('remaps issue_id via ISSUE_ID_MAP', () => {
        const row = buildCommentRow(PAPERCLIP_COMMENT_1, DST_COMPANY, ISSUE_ID_MAP, AGENT_ID_MAP);
        expect(row.issue_id).toBe('new-forge-issue-id-01');
    });
    it('remaps author_agent_id via AGENT_ID_MAP', () => {
        const row = buildCommentRow(PAPERCLIP_COMMENT_1, DST_COMPANY, ISSUE_ID_MAP, AGENT_ID_MAP);
        expect(row.author_agent_id).toBe('9dbeabed-bb38-43a7-a77d-794c36b6e0fd');
    });
    it('preserves author_user_id for user comments', () => {
        const row = buildCommentRow(PAPERCLIP_COMMENT_2, DST_COMPANY, ISSUE_ID_MAP, AGENT_ID_MAP);
        expect(row.author_user_id).toBe('steve');
        expect(row.author_agent_id).toBeNull();
    });
    it('preserves body and created_at', () => {
        const row = buildCommentRow(PAPERCLIP_COMMENT_1, DST_COMPANY, ISSUE_ID_MAP, AGENT_ID_MAP);
        expect(row.body).toBe(PAPERCLIP_COMMENT_1.body);
        expect(row.created_at).toBe(PAPERCLIP_COMMENT_1.created_at);
    });
    it('preserves mentions array', () => {
        const row = buildCommentRow(PAPERCLIP_COMMENT_2, DST_COMPANY, ISSUE_ID_MAP, AGENT_ID_MAP);
        expect(row.mentions).toEqual(['DirtSync Shipper']);
    });
});
describe('buildApprovalRow', () => {
    it('remaps company_id', () => {
        const row = buildApprovalRow(PAPERCLIP_APPROVAL, DST_COMPANY, AGENT_ID_MAP, ISSUE_ID_MAP);
        expect(row.company_id).toBe(DST_COMPANY);
    });
    it('remaps requested_by_agent_id via AGENT_ID_MAP', () => {
        const row = buildApprovalRow(PAPERCLIP_APPROVAL, DST_COMPANY, AGENT_ID_MAP, ISSUE_ID_MAP);
        expect(row.requested_by_agent_id).toBe('9dbeabed-bb38-43a7-a77d-794c36b6e0fd');
    });
    it('preserves type, status, decision_note', () => {
        const row = buildApprovalRow(PAPERCLIP_APPROVAL, DST_COMPANY, AGENT_ID_MAP, ISSUE_ID_MAP);
        expect(row.type).toBe('merge_pr');
        expect(row.status).toBe('approved');
        expect(row.decision_note).toBe('Approved on device test.');
    });
    it('remaps issue_id inside payload when present', () => {
        const row = buildApprovalRow(PAPERCLIP_APPROVAL, DST_COMPANY, AGENT_ID_MAP, ISSUE_ID_MAP);
        expect(row.payload.issue_id).toBe('new-forge-issue-id-01');
    });
});
describe('idempotency invariant', () => {
    it('buildIssueRow is deterministic — same input same output', () => {
        const row1 = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        const row2 = buildIssueRow(PAPERCLIP_ISSUE_1, DST_COMPANY, AGENT_ID_MAP, PROJECT_ID_MAP, GOAL_ID_MAP);
        expect(row1).toEqual(row2);
    });
    it('buildCommentRow is deterministic — same input same output', () => {
        const row1 = buildCommentRow(PAPERCLIP_COMMENT_1, DST_COMPANY, ISSUE_ID_MAP, AGENT_ID_MAP);
        const row2 = buildCommentRow(PAPERCLIP_COMMENT_1, DST_COMPANY, ISSUE_ID_MAP, AGENT_ID_MAP);
        expect(row1).toEqual(row2);
    });
    it('buildAgentRow is deterministic', () => {
        const row1 = buildAgentRow(PAPERCLIP_AGENT_1);
        const row2 = buildAgentRow(PAPERCLIP_AGENT_1);
        expect(row1).toEqual(row2);
    });
});
//# sourceMappingURL=etl-paperclip-to-forge.test.js.map