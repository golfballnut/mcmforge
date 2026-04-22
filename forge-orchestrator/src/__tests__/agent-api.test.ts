import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { EventEmitter } from 'node:events';

const httpMock = vi.hoisted(() => ({
  createServer: vi.fn((handler: unknown) => ({
    _handler: handler,
    listen: vi.fn((_port: number, _host: string, cb?: () => void) => {
      cb?.();
    }),
    once: vi.fn((_event: string, cb: () => void) => cb()),
    address: vi.fn(() => ({ port: 12345 })),
    close: vi.fn((cb?: () => void) => cb?.()),
  })),
}));

vi.mock('node:http', async () => {
  const actual = await vi.importActual<typeof import('node:http')>('node:http');
  return {
    ...actual,
    createServer: httpMock.createServer,
  };
});

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

async function invokeAgentApi(
  supabase: unknown,
  opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  },
): Promise<{ status: number; body: unknown }> {
  const { startAgentApi } = await import('../agent-api.js');
  const srv = startAgentApi(supabase as never, 0) as Server & {
    _handler: (req: EventEmitter & { url: string; method: string; headers: Record<string, string> }, res: {
      writeHead: (status: number, headers: Record<string, string>) => void;
      end: (data: string) => void;
    }) => Promise<void>;
  };

  const req = new EventEmitter() as EventEmitter & {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
  req.url = opts.url;
  req.method = opts.method;
  req.headers = opts.headers ?? {};

  return new Promise((resolve) => {
    let status = 200;
    const res = {
      writeHead: (nextStatus: number) => {
        status = nextStatus;
      },
      end: (data: string) => {
        resolve({ status, body: JSON.parse(data) as unknown });
      },
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

async function callAttachments(
  supabase: ReturnType<typeof makeSupabase>,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return invokeAgentApi(supabase, {
    method: 'POST',
    url: `/api/agent/issues/${ISSUE_ID}/attachments`,
    headers: {
      'content-type': 'application/json',
      'x-forge-agent-id': AGENT_ID,
      ...headers,
    },
    body,
  }) as Promise<{ status: number; body: Record<string, unknown> }>;
}

const COMPANY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_AGENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OTHER_COMPANY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

function makeAgentsSupabase() {
  const rows = [
    {
      id: AGENT_ID,
      name: 'Fleet Auditor',
      role: 'auditor',
      title: 'Fleet Auditor',
      status: 'active',
      company_id: COMPANY_ID,
      adapter_type: 'codex',
      adapter_config: { model: 'gpt-5' },
      budget_monthly_cents: 10000,
      last_heartbeat_at: '2026-04-21T12:00:00.000Z',
      updated_at: '2026-04-21T12:00:00.000Z',
    },
    {
      id: OTHER_AGENT_ID,
      name: 'Forge COO',
      role: 'coo',
      title: 'COO',
      status: 'active',
      company_id: COMPANY_ID,
      adapter_type: 'codex',
      adapter_config: { model: 'gpt-5' },
      budget_monthly_cents: 20000,
      last_heartbeat_at: '2026-04-21T12:05:00.000Z',
      updated_at: '2026-04-21T12:05:00.000Z',
    },
    {
      id: '99999999-9999-9999-9999-999999999999',
      name: 'External Agent',
      role: 'external',
      title: 'External',
      status: 'active',
      company_id: OTHER_COMPANY_ID,
      adapter_type: 'codex',
      adapter_config: { model: 'gpt-5' },
      budget_monthly_cents: 30000,
      last_heartbeat_at: '2026-04-21T12:10:00.000Z',
      updated_at: '2026-04-21T12:10:00.000Z',
    },
  ];

  const eq = vi.fn((field: string, value: string) => {
    if (field === 'id') {
      return {
        single: vi.fn().mockResolvedValue({
          data: rows.find((row) => row.id === value) ?? null,
          error: null,
        }),
      };
    }

    return Promise.resolve({
      data: rows
        .filter((row) => field === 'company_id' && row.company_id === value)
        .map(({ company_id: _companyId, ...row }) => row),
      error: null,
    });
  });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq }),
    }),
    storage: { from: vi.fn().mockReturnValue({ upload: vi.fn(), remove: vi.fn() }) },
    _eq: eq,
  };
}

async function callAgents(
  supabase: ReturnType<typeof makeAgentsSupabase>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  return invokeAgentApi(supabase, {
    method: 'GET',
    url: '/api/agents',
    headers,
  });
}

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
  return invokeAgentApi(supabase, {
    method: 'POST',
    url: `/api/agent/issues/${ISSUE_ID}/comments`,
    headers: {
      'content-type': 'application/json',
      'x-forge-agent-id': AGENT_ID,
      ...headers,
    },
    body,
  }) as Promise<{ status: number; body: Record<string, unknown> }>;
}

describe('GET /api/agents', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 401 when X-Forge-Agent-Id header is missing', async () => {
    const sb = makeAgentsSupabase();
    const { status, body } = await callAgents(sb);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'Missing x-forge-agent-id' });
  });

  it('returns an array of same-company agents for a valid caller', async () => {
    const sb = makeAgentsSupabase();
    const { status, body } = await callAgents(sb, { 'x-forge-agent-id': AGENT_ID });

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect((body as Array<Record<string, unknown>>).map((agent) => agent.id)).toEqual([
      AGENT_ID,
      OTHER_AGENT_ID,
    ]);
  });

  it('does not return agents from other companies', async () => {
    const sb = makeAgentsSupabase();
    const { body } = await callAgents(sb, { 'x-forge-agent-id': AGENT_ID });

    expect((body as Array<Record<string, unknown>>).some((agent) => agent.id === '99999999-9999-9999-9999-999999999999')).toBe(false);
    expect(sb._eq).toHaveBeenCalledWith('company_id', COMPANY_ID);
  });
});

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
