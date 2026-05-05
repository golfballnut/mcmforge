import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndPauseOnQuotaCap } from '../loops/run-executor.js';
function buildMockClient(opts) {
    const agentUpdates = [];
    const client = {
        agentUpdates,
        from: vi.fn((table) => {
            if (table === 'issue_comments') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                limit: () => Promise.resolve({ data: opts.existingComments ?? [], error: null }),
                            }),
                        }),
                    }),
                };
            }
            if (table === 'agents') {
                return {
                    update: (payload) => {
                        agentUpdates.push(payload);
                        return {
                            eq: () => ({
                                eq: () => Promise.resolve({
                                    data: null,
                                    error: opts.agentUpdateError ? { message: 'db error' } : null,
                                }),
                            }),
                        };
                    },
                };
            }
            return {};
        }),
    };
    return { client };
}
describe('checkAndPauseOnQuotaCap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('returns false and does NOT pause when run duration >= 10s', async () => {
        const { client } = buildMockClient({ existingComments: [] });
        const result = await checkAndPauseOnQuotaCap(client, 'agent-1', 'run-1', 'issue-1', 10_000);
        expect(result).toBe(false);
        expect(client.agentUpdates).toHaveLength(0);
    });
    it('returns false and does NOT pause when run had a progress comment', async () => {
        const { client } = buildMockClient({ existingComments: [{ id: 'comment-1' }] });
        const result = await checkAndPauseOnQuotaCap(client, 'agent-1', 'run-1', 'issue-1', 4_000);
        expect(result).toBe(false);
        expect(client.agentUpdates).toHaveLength(0);
    });
    it('auto-pauses agent and returns true for fast exit (<10s) with no progress comment', async () => {
        const { client } = buildMockClient({ existingComments: [] });
        const result = await checkAndPauseOnQuotaCap(client, 'agent-1', 'run-1', 'issue-1', 3_800);
        expect(result).toBe(true);
        expect(client.agentUpdates).toHaveLength(1);
        expect(client.agentUpdates[0]).toMatchObject({
            status: 'paused',
            pause_reason: expect.stringContaining('auto-quota-cap'),
        });
    });
    it('auto-pauses with correct duration in the reason', async () => {
        const { client } = buildMockClient({ existingComments: [] });
        await checkAndPauseOnQuotaCap(client, 'agent-1', 'run-1', 'issue-1', 4_321);
        expect(client.agentUpdates[0].pause_reason).toContain('4321ms');
    });
    it('returns true even when agent update fails (best-effort)', async () => {
        const { client } = buildMockClient({ existingComments: [], agentUpdateError: true });
        const result = await checkAndPauseOnQuotaCap(client, 'agent-1', 'run-1', 'issue-1', 2_000);
        expect(result).toBe(true);
    });
});
//# sourceMappingURL=run-executor-quota-cap.test.js.map