import { describe, it, expect, vi, beforeEach } from 'vitest';
// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('node:child_process', async () => {
    const actual = await vi.importActual('node:child_process');
    return {
        ...actual,
        execSync: vi.fn().mockReturnValue(Buffer.from('2026-05-05T10:00:00Z|feat: ship FORGE-360 standup card|Steve McMillian\n' +
            '2026-05-05T09:30:00Z|fix: handle empty runs gracefully|Steve McMillian\n')),
    };
});
vi.mock('../../utils/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
const COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
// ─── Supabase mock factory ─────────────────────────────────────────────────────
function makeSupabase(opts) {
    const issueResult = opts.issuesError
        ? { data: null, error: { message: opts.issuesError } }
        : { data: opts.issues ?? [], error: null };
    const runResult = opts.runsError
        ? { data: null, error: { message: opts.runsError } }
        : { data: opts.runs ?? [], error: null };
    const makeChain = (result) => {
        const gte = vi.fn().mockResolvedValue(result);
        const eq = vi.fn().mockReturnValue({ gte });
        const select = vi.fn().mockReturnValue({ eq });
        return { select, eq, gte };
    };
    const issueChain = makeChain(issueResult);
    const runChain = makeChain(runResult);
    const from = vi.fn().mockImplementation((table) => {
        if (table === 'issues')
            return issueChain;
        if (table === 'runs')
            return runChain;
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ gte: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) };
    });
    return { from };
}
// ─── Tests ───────────────────────────────────────────────────────────────────
describe('fetchStandupData', () => {
    beforeEach(() => {
        vi.resetModules();
    });
    it('returns issue count and open issues for last 24h', async () => {
        const sb = makeSupabase({
            issues: [
                { id: 'i1', title: 'Build standup card', status: 'in_progress', updated_at: '2026-05-05T10:00:00Z' },
                { id: 'i2', title: 'Fix bug', status: 'todo', updated_at: '2026-05-05T09:00:00Z' },
            ],
        });
        const { fetchStandupData } = await import('../data-layer.js');
        const result = await fetchStandupData(sb, COMPANY_ID);
        expect(result.openIssues).toHaveLength(2);
        expect(result.openIssues[0].title).toBe('Build standup card');
    });
    it('returns run count and status breakdown for last 24h', async () => {
        const sb = makeSupabase({
            runs: [
                { id: 'r1', status: 'succeeded', cost_usd: '0.15' },
                { id: 'r2', status: 'failed', cost_usd: '0.05' },
                { id: 'r3', status: 'succeeded', cost_usd: '0.20' },
            ],
        });
        const { fetchStandupData } = await import('../data-layer.js');
        const result = await fetchStandupData(sb, COMPANY_ID);
        expect(result.runStats.total).toBe(3);
        expect(result.runStats.succeeded).toBe(2);
        expect(result.runStats.failed).toBe(1);
        expect(result.runStats.totalCostUsd).toBeCloseTo(0.40, 2);
    });
    it('handles zero issues gracefully', async () => {
        const sb = makeSupabase({ issues: [], runs: [] });
        const { fetchStandupData } = await import('../data-layer.js');
        const result = await fetchStandupData(sb, COMPANY_ID);
        expect(result.openIssues).toHaveLength(0);
        expect(result.runStats.total).toBe(0);
        expect(result.runStats.totalCostUsd).toBe(0);
    });
    it('returns git log commits as an array', async () => {
        const { fetchStandupData } = await import('../data-layer.js');
        const sb = makeSupabase({});
        const result = await fetchStandupData(sb, COMPANY_ID);
        expect(Array.isArray(result.recentCommits)).toBe(true);
    });
    it('handles 0-commit window (execSync returns empty string)', async () => {
        const { execSync } = await import('node:child_process');
        vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));
        const { fetchStandupData } = await import('../data-layer.js');
        const sb = makeSupabase({});
        const result = await fetchStandupData(sb, COMPANY_ID);
        expect(result.recentCommits).toHaveLength(0);
    });
    it('handles execSync errors without crashing', async () => {
        const { execSync } = await import('node:child_process');
        vi.mocked(execSync).mockImplementationOnce(() => { throw new Error('not a git repo'); });
        const { fetchStandupData } = await import('../data-layer.js');
        const sb = makeSupabase({});
        const result = await fetchStandupData(sb, COMPANY_ID);
        expect(result.recentCommits).toHaveLength(0);
    });
});
//# sourceMappingURL=data-layer.test.js.map