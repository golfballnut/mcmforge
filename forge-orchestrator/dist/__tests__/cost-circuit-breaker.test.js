import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tick } from '../loops/cost-circuit-breaker.js';
function buildMockClient(opts) {
    const updateCalls = [];
    return {
        updateCalls,
        client: {
            from: vi.fn((table) => {
                if (table === 'cost_events') {
                    return {
                        select: () => ({
                            gte: () => Promise.resolve(opts.costEventsResult),
                        }),
                    };
                }
                if (table === 'agents') {
                    return {
                        select: () => ({
                            in: () => Promise.resolve({ data: opts.agentsForSpend ?? [], error: null }),
                            eq: () => ({
                                single: () => Promise.resolve({ data: { status: 'idle' }, error: null }),
                            }),
                        }),
                        update: (payload) => {
                            updateCalls.push({ table, payload });
                            return {
                                in: () => ({
                                    in: () => ({
                                        select: () => Promise.resolve({ data: opts.pausedAgents ?? [], error: null }),
                                    }),
                                }),
                                eq: () => Promise.resolve({ data: null, error: null }),
                            };
                        },
                    };
                }
                if (table === 'runs') {
                    return {
                        select: () => ({
                            gte: () => Promise.resolve({ data: opts.recentRuns ?? [], error: null }),
                        }),
                        update: (payload) => {
                            updateCalls.push({ table, payload });
                            return {
                                eq: () => ({
                                    in: () => Promise.resolve({ data: null, error: null }),
                                }),
                            };
                        },
                    };
                }
                if (table === 'issues') {
                    return {
                        select: () => ({
                            eq: () => ({
                                in: () => Promise.resolve({ data: [], error: null }),
                            }),
                        }),
                    };
                }
                if (table === 'issue_comments') {
                    return { insert: () => Promise.resolve({ data: null, error: null }) };
                }
                return {};
            }),
        },
    };
}
describe('cost-circuit-breaker tick', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('trips an agent when hourly spend exceeds cap (normal path)', async () => {
        const { client } = buildMockClient({
            costEventsResult: {
                data: [{ agent_id: 'a1', cost_cents: 300 }],
                error: null,
            },
            agentsForSpend: [
                { id: 'a1', name: 'Agent One', company_id: 'c1', status: 'idle' },
            ],
        });
        const result = await tick(client);
        expect(result.checked).toBe(1);
        expect(result.tripped).toBeGreaterThanOrEqual(1);
    });
    it('does NOT trip when spend is under cap', async () => {
        const { client } = buildMockClient({
            costEventsResult: {
                data: [{ agent_id: 'a1', cost_cents: 50 }],
                error: null,
            },
            agentsForSpend: [
                { id: 'a1', name: 'Agent One', company_id: 'c1', status: 'idle' },
            ],
        });
        const result = await tick(client);
        expect(result.checked).toBe(1);
        expect(result.tripped).toBe(0);
    });
    it('on single query error: returns without fail-closed (first strike is lenient)', async () => {
        const { client } = buildMockClient({
            costEventsResult: {
                data: null,
                error: { message: 'TypeError: fetch failed' },
            },
        });
        const result = await tick(client);
        expect(result.checked).toBe(0);
        expect(result.tripped).toBe(0);
        expect(result.failClosed ?? 0).toBe(0);
    });
    it('on SECOND consecutive query error: fail-closed pauses recently-active agents', async () => {
        const { client, updateCalls } = buildMockClient({
            costEventsResult: {
                data: null,
                error: { message: 'TypeError: fetch failed' },
            },
            recentRuns: [{ agent_id: 'a1' }, { agent_id: 'a2' }],
            pausedAgents: [
                { id: 'a1', name: 'Agent One' },
                { id: 'a2', name: 'Agent Two' },
            ],
        });
        // First tick trips the counter
        await tick(client);
        // Second tick fails closed
        const result2 = await tick(client);
        expect(result2.failClosed).toBe(2);
        // Verify an update to agents table with status='paused' was attempted
        const pauseCall = updateCalls.find((c) => c.table === 'agents' && c.payload.status === 'paused');
        expect(pauseCall).toBeDefined();
    });
});
//# sourceMappingURL=cost-circuit-breaker.test.js.map