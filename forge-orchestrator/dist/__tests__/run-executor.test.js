import { describe, it, expect, vi, beforeEach } from 'vitest';
const adapterExecute = vi.hoisted(() => vi.fn());
const createWakeup = vi.hoisted(() => vi.fn());
vi.mock('../adapters/registry.js', () => ({
    getAdapter: vi.fn(() => ({ execute: adapterExecute })),
}));
vi.mock('../services/wakeup.js', () => ({
    createWakeup,
}));
vi.mock('../services/session-search.js', () => ({
    searchAgentHistory: vi.fn().mockResolvedValue([]),
    indexRunResult: vi.fn(),
}));
vi.mock('../services/issue-lifecycle.js', () => ({
    releaseIssueExecution: vi.fn().mockResolvedValue(undefined),
    lockIssueExecution: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/cost-ledger.js', () => ({
    recordCost: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../agents/visual-judge.js', () => ({
    judgeImages: vi.fn(),
}));
vi.mock('../utils/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
const ISSUE_ID = 'issue-forge-331';
const AGENT_ID = 'agent-fleet-auditor';
const COMPANY_ID = 'company-1';
function buildSupabase(recentContinueCount) {
    const calls = [];
    const makeQuery = (table) => {
        const query = {
            _select: '',
            select(columns) {
                query._select = columns;
                return query;
            },
            update(payload) {
                calls.push({ table, op: 'update', payload });
                return query;
            },
            insert(payload) {
                calls.push({ table, op: 'insert', payload });
                return query;
            },
            eq() {
                return query;
            },
            in() {
                return query;
            },
            not() {
                return query;
            },
            order() {
                return query;
            },
            gte() {
                return query;
            },
            contains() {
                if (table === 'runs' && query._select === 'id') {
                    return Promise.resolve({ data: null, count: recentContinueCount, error: null });
                }
                return Promise.resolve({ data: [], count: null, error: null });
            },
            limit() {
                if (table === 'issue_comments') {
                    return Promise.resolve({ data: [{ id: 'comment-1' }], error: null });
                }
                return query;
            },
            maybeSingle() {
                return Promise.resolve({ data: null, error: null });
            },
            single() {
                if (table === 'issues' && query._select === 'status, assignee_agent_id') {
                    return Promise.resolve({
                        data: { status: 'in_progress', assignee_agent_id: AGENT_ID },
                        error: null,
                    });
                }
                if (table === 'agents' && query._select === 'name') {
                    return Promise.resolve({ data: { name: 'Fleet Auditor' }, error: null });
                }
                if (table === 'issues') {
                    return Promise.resolve({
                        data: { id: ISSUE_ID, title: 'Audit fleet', status: 'todo', parent_id: null },
                        error: null,
                    });
                }
                return Promise.resolve({ data: null, error: null });
            },
        };
        return query;
    };
    return {
        calls,
        from: vi.fn((table) => makeQuery(table)),
        storage: { from: vi.fn().mockReturnValue({ download: vi.fn() }) },
    };
}
function makeRun() {
    return {
        id: 'run-1',
        company_id: COMPANY_ID,
        agent_id: AGENT_ID,
        trigger_detail: 'Routine fleet audit',
        priority: 1,
        context_snapshot: { issueId: ISSUE_ID },
    };
}
function makeAgent() {
    return {
        id: AGENT_ID,
        company_id: COMPANY_ID,
        name: 'Fleet Auditor',
        adapter_type: 'codex',
        adapter_config: {},
        status: 'running',
    };
}
async function executeWithRecentContinueCount(recentContinueCount) {
    const { executeRun } = await import('../loops/run-executor.js');
    const supabase = buildSupabase(recentContinueCount);
    adapterExecute.mockResolvedValue({
        exitCode: 0,
        signal: null,
        timedOut: false,
        errorMessage: null,
        stdoutExcerpt: '',
        stderrExcerpt: '',
        resultJson: {},
        summary: 'Completed fleet audit follow-up.',
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0,
        provider: 'test',
        model: 'test-model',
    });
    await executeRun(supabase, { dryRun: false, agentHomeDir: '/tmp/forge-orchestrator-run-executor-test' }, makeRun(), makeAgent());
    return supabase;
}
describe('run executor auto-continue rate limit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('does not create continue_work wakeup when per-agent hourly cap is reached', async () => {
        await executeWithRecentContinueCount(2);
        expect(createWakeup).not.toHaveBeenCalled();
    });
    it('creates continue_work wakeup when per-agent hourly cap is not reached', async () => {
        await executeWithRecentContinueCount(1);
        expect(createWakeup).toHaveBeenCalledTimes(1);
        expect(createWakeup).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            agentId: AGENT_ID,
            payload: { issueId: ISSUE_ID, wakeReason: 'continue_work' },
            idempotencyKey: 'continue-issue-forge-331-run-1',
        }));
    });
});
//# sourceMappingURL=run-executor.test.js.map