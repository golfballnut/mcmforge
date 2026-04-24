import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../utils/logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
// Minimal valid 1×1 PNG (35 bytes)
const MINIMAL_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const ISSUE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VALID_RUN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
function makeSupabase(opts) {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const upload = vi.fn().mockResolvedValue(opts.storageError ? { error: { message: opts.storageError } } : { error: null });
    const insertSingle = vi.fn().mockResolvedValue(opts.dbError
        ? { data: null, error: { message: opts.dbError } }
        : {
            data: opts.attachmentRow ?? {
                id: 'att-1',
                category: 'agent_proof',
                caption: null,
            },
            error: null,
        });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: insertSingle }) });
    return {
        storage: { from: vi.fn().mockReturnValue({ upload, remove }) },
        from: vi.fn().mockReturnValue({ insert }),
        _remove: remove,
        _upload: upload,
        _insert: insert,
    };
}
async function callAttachments(supabase, body, headers = {}) {
    const { startAgentApi } = await import('../agent-api.js');
    const srv = startAgentApi(supabase, 0);
    await new Promise((r) => srv.once('listening', r));
    const port = srv.address().port;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/agent/issues/${ISSUE_ID}/attachments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forge-agent-id': AGENT_ID,
                ...headers,
            },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        return { status: res.status, body: json };
    }
    finally {
        await new Promise((r) => srv.close(() => r()));
    }
}
describe('POST /api/agent/issues/:id/attachments', () => {
    beforeEach(() => {
        vi.resetModules();
        process.env.SUPABASE_URL = 'https://test.supabase.co';
    });
    it('(a) valid PNG → 201 with id, storagePath, publicUrl, sizeBytes', async () => {
        const sb = makeSupabase({});
        const { status, body } = await callAttachments(sb, {
            filename: 'screenshot.png',
            mimeType: 'image/png',
            base64: MINIMAL_PNG_B64,
            category: 'agent_proof',
        });
        expect(status).toBe(201);
        expect(body.id).toBe('att-1');
        expect(typeof body.storagePath).toBe('string');
        expect(body.storagePath.startsWith(`agent-proof/${ISSUE_ID}/`)).toBe(true);
        expect(body.publicUrl.startsWith('https://test.supabase.co/storage/v1/object/public/artifacts/')).toBe(true);
        expect(typeof body.sizeBytes).toBe('number');
        expect(body.sizeBytes).toBeGreaterThan(0);
    });
    it('(b) oversize file → 413', async () => {
        // Build a buffer > 10MB, base64-encode it
        const big = Buffer.alloc(11 * 1024 * 1024, 0);
        const sb = makeSupabase({});
        const { status, body } = await callAttachments(sb, {
            filename: 'big.png',
            mimeType: 'image/png',
            base64: big.toString('base64'),
        });
        expect(status).toBe(413);
        expect(body.error).toMatch(/too large/i);
    });
    it('(c) unsupported mime → 415', async () => {
        const sb = makeSupabase({});
        const { status, body } = await callAttachments(sb, {
            filename: 'file.exe',
            mimeType: 'application/octet-stream',
            base64: MINIMAL_PNG_B64,
        });
        expect(status).toBe(415);
        expect(body.error).toMatch(/unsupported/i);
    });
    it('(d) missing fields → 400', async () => {
        const sb = makeSupabase({});
        const { status, body } = await callAttachments(sb, { filename: 'x.png' });
        expect(status).toBe(400);
        expect(body.error).toMatch(/missing/i);
    });
    it('(e) storage error → 500, no DB insert attempted', async () => {
        const sb = makeSupabase({ storageError: 'bucket not found' });
        const { status, body } = await callAttachments(sb, {
            filename: 'shot.png',
            mimeType: 'image/png',
            base64: MINIMAL_PNG_B64,
        });
        expect(status).toBe(500);
        expect(body.error).toMatch(/storage upload failed/i);
        expect(sb._insert).not.toHaveBeenCalled();
    });
    it('(f) DB error → 500, storage object cleaned up', async () => {
        const sb = makeSupabase({ dbError: 'violates not-null constraint' });
        const { status, body } = await callAttachments(sb, {
            filename: 'shot.png',
            mimeType: 'image/png',
            base64: MINIMAL_PNG_B64,
        });
        expect(status).toBe(500);
        expect(body.error).toMatch(/db insert failed/i);
        expect(sb._remove).toHaveBeenCalledOnce();
    });
    it('(g) valid run-id header propagated in response', async () => {
        const sb = makeSupabase({});
        const { status, body } = await callAttachments(sb, { filename: 'shot.png', mimeType: 'image/png', base64: MINIMAL_PNG_B64 }, { 'x-forge-run-id': VALID_RUN_ID });
        expect(status).toBe(201);
        expect(body.runId).toBe(VALID_RUN_ID);
    });
    it('(h) invalid run-id header → runId null in response', async () => {
        const sb = makeSupabase({});
        const { status, body } = await callAttachments(sb, { filename: 'shot.png', mimeType: 'image/png', base64: MINIMAL_PNG_B64 }, { 'x-forge-run-id': 'not-a-uuid' });
        expect(status).toBe(201);
        expect(body.runId).toBeNull();
    });
});
//# sourceMappingURL=agent-api.test.js.map