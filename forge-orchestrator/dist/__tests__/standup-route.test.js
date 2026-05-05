/**
 * Tests for POST /api/standup/run route in agent-api.ts.
 * Lives in a separate file from agent-api.test.ts to avoid
 * vi.resetModules() interference with the standup module mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
// ─── HTTP server mock ────────────────────────────────────────────────────────
const httpMock = vi.hoisted(() => ({
    createServer: vi.fn((handler) => ({
        _handler: handler,
        listen: vi.fn((_port, _host, cb) => { cb?.(); }),
        once: vi.fn((_event, cb) => cb()),
        address: vi.fn(() => ({ port: 12345 })),
        close: vi.fn((cb) => cb?.()),
    })),
}));
vi.mock('node:http', async () => {
    const actual = await vi.importActual('node:http');
    return { ...actual, createServer: httpMock.createServer };
});
vi.mock('../utils/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
// ─── Standup module mocks ────────────────────────────────────────────────────
vi.mock('../standup/data-layer.js', () => ({
    fetchStandupData: vi.fn().mockResolvedValue({
        openIssues: [{ id: 'i1', title: 'FORGE-360', status: 'in_progress', updated_at: '2026-05-05T10:00:00Z' }],
        runStats: { total: 3, succeeded: 2, failed: 1, totalCostUsd: 0.50 },
        recentCommits: [{ timestamp: '2026-05-05T10:00:00Z', subject: 'feat: ship FORGE-360', author: 'Steve' }],
    }),
}));
vi.mock('../standup/composer.js', () => ({
    composeStandup: vi.fn().mockResolvedValue('Yesterday shipped FORGE-360. In flight: FORGE-361. Needs Steve: PR #97.'),
}));
// ─── Constants ───────────────────────────────────────────────────────────────
const COMPANY_ID = '11111111-1111-1111-1111-111111111111';
const AGENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STANDUP_ROW = {
    date: new Date().toISOString().slice(0, 10),
    body_md: 'Yesterday shipped FORGE-360. In flight: FORGE-361. Needs Steve: PR #97.',
    company_id: COMPANY_ID,
    generated_at: '2026-05-05T12:00:00.000Z',
    source_payload: {},
};
// ─── Supabase mock factory ───────────────────────────────────────────────────
function makeStandupSupabase(opts) {
    const singleResult = opts.upsertError
        ? { data: null, error: { message: opts.upsertError } }
        : { data: opts.upsertRow ?? STANDUP_ROW, error: null };
    const single = vi.fn().mockResolvedValue(singleResult);
    // upsert(data, opts) -> { select() -> { single() } }
    // Note: NO .onConflict() chain — the conflict resolution is the second arg to upsert
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });
    return { from, _upsert: upsert, _single: single };
}
// ─── Invocation helper ───────────────────────────────────────────────────────
async function invokeStandupRoute(supabase, opts) {
    const { startAgentApi } = await import('../agent-api.js');
    const srv = startAgentApi(supabase, 0);
    const req = new EventEmitter();
    req.url = opts.url;
    req.method = opts.method;
    req.headers = opts.headers ?? {};
    return new Promise((resolve) => {
        let status = 200;
        const res = {
            writeHead: (nextStatus) => { status = nextStatus; },
            end: (data) => { resolve({ status, body: JSON.parse(data) }); },
        };
        void srv._handler(req, res);
        if (opts.body) {
            process.nextTick(() => {
                req.emit('data', Buffer.from(JSON.stringify(opts.body)));
                req.emit('end');
            });
        }
    });
}
function callStandupRun(supabase, body = { companyId: COMPANY_ID }, headers = { 'x-forge-agent-id': AGENT_ID }) {
    return invokeStandupRoute(supabase, {
        method: 'POST',
        url: '/api/standup/run',
        headers: { 'content-type': 'application/json', ...headers },
        body,
    });
}
// ─── Tests ───────────────────────────────────────────────────────────────────
describe('POST /api/standup/run', () => {
    beforeEach(() => {
        process.env.SUPABASE_URL = 'https://test.supabase.co';
    });
    it('(a) valid companyId → 200 with the upserted standup row', async () => {
        const sb = makeStandupSupabase({});
        const { status, body } = await callStandupRun(sb);
        expect(status).toBe(200);
        expect(body.date).toBe(STANDUP_ROW.date);
        expect(body.body_md).toBe(STANDUP_ROW.body_md);
        expect(body.company_id).toBe(COMPANY_ID);
    });
    it('(b) missing companyId → 400', async () => {
        const sb = makeStandupSupabase({});
        const { status, body } = await callStandupRun(sb, {});
        expect(status).toBe(400);
        expect(body.error.toLowerCase()).toMatch(/companyid/i);
    });
    it('(c) DB upsert error → 500', async () => {
        const sb = makeStandupSupabase({ upsertError: 'connection timeout' });
        const { status, body } = await callStandupRun(sb);
        expect(status).toBe(500);
        expect(body.error).toBeTruthy();
    });
    it('(d) second call same day → idempotent (upsert called twice, row returned both times)', async () => {
        const sb = makeStandupSupabase({});
        const { status: s1, body: b1 } = await callStandupRun(sb);
        const { status: s2, body: b2 } = await callStandupRun(sb);
        expect(s1).toBe(200);
        expect(s2).toBe(200);
        expect(sb._upsert).toHaveBeenCalledTimes(2);
        expect(b1.date).toBe(STANDUP_ROW.date);
        expect(b2.date).toBe(STANDUP_ROW.date);
    });
});
//# sourceMappingURL=standup-route.test.js.map