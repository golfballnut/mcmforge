import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../utils/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
// Mock the claude CLI subprocess (uses Max plan via CLAUDE_CODE_OAUTH_TOKEN, not Anthropic API)
const mockRunChildProcess = vi.fn();
vi.mock('../../utils/child-process.js', () => ({
    runChildProcess: (opts) => mockRunChildProcess(opts),
}));
const SAMPLE_PAYLOAD = {
    openIssues: [
        { id: 'i1', title: 'FORGE-360: Standup card', status: 'in_progress', updated_at: '2026-05-05T10:00:00Z' },
    ],
    runStats: {
        total: 5,
        succeeded: 4,
        failed: 1,
        totalCostUsd: 0.75,
    },
    recentCommits: [
        { timestamp: '2026-05-05T10:00:00Z', subject: 'feat: ship FORGE-360 standup card', author: 'Steve McMillian' },
    ],
};
describe('composeStandup', () => {
    beforeEach(() => {
        vi.resetModules();
        mockRunChildProcess.mockReset();
        process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-oauth-token';
        mockRunChildProcess.mockResolvedValue({
            stdout: '  Yesterday the team shipped FORGE-360 standup card. In flight: composer CLI refactor. Needs Steve: PR review.  \n',
            stderr: '',
            exitCode: 0,
            signal: null,
            timedOut: false,
        });
    });
    it('returns a non-empty trimmed string', async () => {
        const { composeStandup } = await import('../composer.js');
        const result = await composeStandup(SAMPLE_PAYLOAD);
        expect(typeof result).toBe('string');
        expect(result.trim().length).toBeGreaterThan(0);
        expect(result).toBe(result.trim());
    });
    it('spawns claude CLI with stdin prompt and Max plan OAuth token in env', async () => {
        const { composeStandup } = await import('../composer.js');
        await composeStandup(SAMPLE_PAYLOAD);
        expect(mockRunChildProcess).toHaveBeenCalledTimes(1);
        const opts = mockRunChildProcess.mock.calls[0][0];
        expect(opts.command).toBe('claude');
        expect(opts.args).toContain('--print');
        expect(opts.args).toContain('--model');
        expect(opts.stdin).toContain('FORGE-360: Standup card');
        expect(opts.stdin).toContain('5 total, 4 succeeded, 1 failed');
        expect(opts.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('test-oauth-token');
    });
    it('throws when claude CLI exits non-zero', async () => {
        mockRunChildProcess.mockResolvedValueOnce({
            stdout: '',
            stderr: 'auth failed',
            exitCode: 1,
            signal: null,
            timedOut: false,
        });
        const { composeStandup } = await import('../composer.js');
        await expect(composeStandup(SAMPLE_PAYLOAD)).rejects.toThrow(/exited 1/);
    });
    it('output is trimmed (no leading/trailing whitespace)', async () => {
        const { composeStandup } = await import('../composer.js');
        const result = await composeStandup(SAMPLE_PAYLOAD);
        expect(result).toBe(result.trim());
    });
    it('handles empty payload gracefully', async () => {
        const { composeStandup } = await import('../composer.js');
        const emptyPayload = {
            openIssues: [],
            runStats: { total: 0, succeeded: 0, failed: 0, totalCostUsd: 0 },
            recentCommits: [],
        };
        const result = await composeStandup(emptyPayload);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=composer.test.js.map