import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';

vi.mock('../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

// Minimal valid 1×1 PNG (35 bytes)
const MINIMAL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const ISSUE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VALID_RUN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeSupabase(opts: {
  storageError?: string;
  dbError?: string;
  attachmentRow?: Record<string, unknown>;
}) {
  const remove = vi.fn().mockResolvedValue({ error: null });
  const upload = vi.fn().mockResolvedValue(
    opts.storageError ? { error: { message: opts.storageError } } : { error: null },
  );
  const insertSingle = vi.fn().mockResolvedValue(
    opts.dbError
      ? { data: null, error: { message: opts.dbError } }
      : {
          data: opts.attachmentRow ?? {
            id: 'att-1',
            category: 'agent_proof',
            caption: null,
          },
          error: null,
        },
  );
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: insertSingle }) });

  return {
    storage: { from: vi.fn().mockReturnValue({ upload, remove }) },
    from: vi.fn().mockReturnValue({ insert }),
    _remove: remove,
    _upload: upload,
    _insert: insert,
  };
}

async function callAttachments(
  supabase: ReturnType<typeof makeSupabase>,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { startAgentApi } = await import('../agent-api.js');
  const srv = startAgentApi(supabase as never, 0) as Server;
  await new Promise<void>((r) => srv.once('listening', r));
  const port = (srv.address() as { port: number }).port;

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
    const json = await res.json() as Record<string, unknown>;
    return { status: res.status, body: json };
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
}

const COMPANY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_AGENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function makeCommentSupabase(opts: {
  proofCount?: number;
  proofQueryError?: string;
}) {
  const gteResult = vi.fn().mockResolvedValue(
    opts.proofQueryError
      ? { count: null, error: { message: opts.proofQueryError } }
      : { count: opts.proofCount ?? 0, error: null },
  );
  const secondEq = vi.fn().mockReturnValue({ gte: gteResult });
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });

  const commentSingle = vi.fn().mockResolvedValue({
    data: { id: 'cmt-1', company_id: COMPANY_ID, issue_id: ISSUE_ID, author_agent_id: AGENT_ID, body: 'proof body' },
    error: null,
  });
  const commentInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: commentSingle }) });

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'issues') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { company_id: COMPANY_ID }, error: null }),
            }),
          }),
        };
      }
      if (table === 'issue_attachments') {
        return { select: vi.fn().mockReturnValue({ eq: firstEq }) };
      }
      if (table === 'issue_comments') {
        return { insert: commentInsert };
      }
      return {};
    }),
    storage: { from: vi.fn().mockReturnValue({ upload: vi.fn(), remove: vi.fn() }) },
  };
}

async function callComments(
  supabase: ReturnType<typeof makeCommentSupabase>,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { startAgentApi } = await import('../agent-api.js');
  const srv = startAgentApi(supabase as never, 0) as Server;
  await new Promise<void>((r) => srv.once('listening', r));
  const port = (srv.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/agent/issues/${ISSUE_ID}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forge-agent-id': AGENT_ID,
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json() as Record<string, unknown>;
    return { status: res.status, body: json };
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
}

describe('POST /api/agent/issues/:id/comments — Rule 2', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
  });

  it('(a) [PROOF] body + no attachment → 422 PROOF_WITHOUT_ATTACHMENT', async () => {
    const sb = makeCommentSupabase({ proofCount: 0 });
    const { status, body } = await callComments(sb, { body: '[PROOF] screenshot shows green build' });
    expect(status).toBe(422);
    expect(body.error).toBe('PROOF_WITHOUT_ATTACHMENT');
    expect(body.attachmentsFound).toBe(0);
  });

  it('(b) [PROOF] body + attachment from same agent → 201', async () => {
    const sb = makeCommentSupabase({ proofCount: 1 });
    const { status } = await callComments(sb, { body: '[PROOF] screenshot shows green build' });
    expect(status).toBe(201);
  });

  it('(c) [PROOF] body + X-Forge-Proof-Bypass: true → 201 (no attachment check)', async () => {
    const sb = makeCommentSupabase({ proofCount: 0 });
    const { status } = await callComments(
      sb,
      { body: '[PROOF] screenshot shows green build' },
      { 'x-forge-proof-bypass': 'true' },
    );
    expect(status).toBe(201);
  });

  it('(d) [PROOF] body + attachment query errors → 201 (fail-open)', async () => {
    const sb = makeCommentSupabase({ proofQueryError: 'connection timeout' });
    const { status } = await callComments(sb, { body: '**[PROOF] build tail attached' });
    expect(status).toBe(201);
  });
});

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
    expect((body.storagePath as string).startsWith(`agent-proof/${ISSUE_ID}/`)).toBe(true);
    expect((body.publicUrl as string).startsWith('https://test.supabase.co/storage/v1/object/public/artifacts/')).toBe(true);
    expect(typeof body.sizeBytes).toBe('number');
    expect((body.sizeBytes as number)).toBeGreaterThan(0);
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
    const { status, body } = await callAttachments(
      sb,
      { filename: 'shot.png', mimeType: 'image/png', base64: MINIMAL_PNG_B64 },
      { 'x-forge-run-id': VALID_RUN_ID },
    );
    expect(status).toBe(201);
    expect(body.runId).toBe(VALID_RUN_ID);
  });

  it('(h) invalid run-id header → runId null in response', async () => {
    const sb = makeSupabase({});
    const { status, body } = await callAttachments(
      sb,
      { filename: 'shot.png', mimeType: 'image/png', base64: MINIMAL_PNG_B64 },
      { 'x-forge-run-id': 'not-a-uuid' },
    );
    expect(status).toBe(201);
    expect(body.runId).toBeNull();
  });
});
