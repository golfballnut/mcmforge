import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './utils/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROOF_REGEX = /^\s*\*{0,2}\[PROOF(?:[\s\]]|—)/i;

const ALLOWED_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
  'text/plain', 'text/markdown', 'application/json',
]);

const ALLOWED_CATEGORIES = new Set([
  'user_upload', 'testing', 'comparison', 'video', 'pass', 'fail', 'agent_proof',
]);

function maxBytesFor(mimeType: string): number {
  if (mimeType.startsWith('image/')) return 10 * 1024 * 1024;
  if (mimeType.startsWith('video/')) return 50 * 1024 * 1024;
  return 2 * 1024 * 1024;
}

/**
 * Local agent API server — runs on localhost only.
 * Mirrors Paperclip's /api/agent/* endpoints so agents can self-serve.
 * Agents authenticate via X-Forge-Agent-Id header (injected by orchestrator).
 */

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
  });
}

function matchRoute(url: string, pattern: string): Record<string, string> | null {
  const urlParts = url.split('/').filter(Boolean);
  const patParts = pattern.split('/').filter(Boolean);
  if (urlParts.length !== patParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = urlParts[i];
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function startAgentApi(supabase: SupabaseClient<any, any, any>, port: number) {
  const server = createServer(async (req, res) => {
    const url = (req.url || '').split('?')[0];
    const method = req.method || 'GET';
    const agentId = req.headers['x-forge-agent-id'] as string | undefined;
    const runId = req.headers['x-forge-run-id'] as string | undefined;

    logger.debug({ method, url, agentId }, 'Agent API request');

    try {
      // ── GET /api/agent/me ─────────────────────────────────
      if (method === 'GET' && url === '/api/agent/me') {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const { data: agent } = await supabase
          .from('agents')
          .select('id, name, role, title, status, company_id, adapter_type, budget_monthly_cents, reports_to')
          .eq('id', agentId)
          .single();

        if (!agent) return json(res, { error: 'Agent not found' }, 404);

        // Include team roster (agents in the same company)
        const { data: team } = await supabase
          .from('agents')
          .select('id, name, role, title, status')
          .eq('company_id', agent.company_id)
          .neq('id', agentId);

        return json(res, { ...agent, team: team || [] });
      }

      // ── GET /api/agent/me/inbox ───────────────────────────
      if (method === 'GET' && url === '/api/agent/me/inbox') {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const { data: issues } = await supabase
          .from('issues')
          .select('id, identifier, title, description, status, priority, project_id, created_at')
          .eq('assignee_agent_id', agentId)
          .in('status', ['todo', 'in_progress', 'blocked'])
          .order('priority', { ascending: true })
          .order('created_at', { ascending: true });

        return json(res, issues || []);
      }

      // ── GET /api/agent/issues/:id ─────────────────────────
      let params = matchRoute(url, '/api/agent/issues/:id');
      if (method === 'GET' && params) {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const { data: issue } = await supabase
          .from('issues')
          .select('*')
          .eq('id', params.id)
          .single();

        if (!issue) return json(res, { error: 'Issue not found' }, 404);
        return json(res, issue);
      }

      // ── GET /api/agent/issues/:id/context ─────────────────
      params = matchRoute(url, '/api/agent/issues/:id/context');
      if (method === 'GET' && params) {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const { data: issue } = await supabase
          .from('issues')
          .select('*')
          .eq('id', params.id)
          .single();

        if (!issue) return json(res, { error: 'Issue not found' }, 404);

        // Get comments for context
        const { data: comments } = await supabase
          .from('issue_comments')
          .select('id, body, author_agent_id, created_at')
          .eq('issue_id', params.id)
          .order('created_at', { ascending: true })
          .limit(20);

        // Get parent issue if exists
        let parent = null;
        if (issue.parent_id) {
          const { data: p } = await supabase
            .from('issues')
            .select('id, identifier, title, status')
            .eq('id', issue.parent_id)
            .single();
          parent = p;
        }

        return json(res, {
          issue,
          comments: comments || [],
          parent,
        });
      }

      // ── POST /api/agent/issues/:id/checkout ───────────────
      params = matchRoute(url, '/api/agent/issues/:id/checkout');
      if (method === 'POST' && params) {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('issues')
          .update({
            execution_run_id: runId || null,
            execution_locked_at: now,
            status: 'in_progress',
            started_at: now,
            updated_at: now,
          })
          .eq('id', params.id)
          .is('execution_run_id', null)
          .select()
          .single();

        if (error || !data) {
          return json(res, { error: 'Issue already checked out by another agent' }, 409);
        }
        return json(res, data);
      }

      // ── POST /api/agent/issues/:id/comments ──────────────
      params = matchRoute(url, '/api/agent/issues/:id/comments');
      if (method === 'POST' && params) {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const body = await parseBody(req);
        if (!body.body) return json(res, { error: 'Missing body' }, 400);

        const { data: issue, error: issueError } = await supabase
          .from('issues')
          .select('company_id')
          .eq('id', params.id)
          .single();
        if (issueError || !issue) return json(res, { error: 'Issue not found' }, 404);

        // Rule 2: [PROOF] comments require ≥1 attachment from this agent on this issue in last 10 min
        const bodyText = body.body as string;
        const isProof = PROOF_REGEX.test(bodyText);
        const bypass = req.headers['x-forge-proof-bypass'] === 'true';

        if (isProof && !bypass) {
          const tenMinBefore = new Date(Date.now() - 10 * 60_000).toISOString();
          const { count, error: attachErr } = await supabase
            .from('issue_attachments')
            .select('id', { count: 'exact', head: true })
            .eq('issue_id', params.id)
            .eq('uploaded_by_agent_id', agentId)
            .gte('created_at', tenMinBefore);

          if (attachErr) {
            logger.warn({ err: attachErr }, '[comments POST] PROOF attachment check failed, allowing through');
          } else if ((count ?? 0) === 0) {
            return json(res, {
              error: 'PROOF_WITHOUT_ATTACHMENT',
              message:
                'Rule 2 of agent-comment-protocol.md: [PROOF] comments require ≥1 uploaded artifact ' +
                'from this agent on this issue in the 10 minutes before the comment. ' +
                'Upload via POST /api/agent/issues/{id}/attachments, then repost.',
              issueId: params.id,
              agentId,
              attachmentsFound: 0,
            }, 422);
          }
        }

        const { data, error } = await supabase
          .from('issue_comments')
          .insert({
            company_id: issue.company_id,
            issue_id: params.id,
            author_agent_id: agentId,
            body: body.body as string,
            created_by_run_id: runId || null,
          })
          .select()
          .single();

        if (error) return json(res, { error: error.message }, 500);
        return json(res, data, 201);
      }

      // ── POST /api/agent/issues/:id/attachments ────────────
      params = matchRoute(url, '/api/agent/issues/:id/attachments');
      if (method === 'POST' && params) {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const body = await parseBody(req);
        const { filename, mimeType, base64, category = 'agent_proof', caption = null, commentId = null } = body as {
          filename?: string; mimeType?: string; base64?: string;
          category?: string; caption?: string | null; commentId?: string | null;
        };

        if (!filename || !mimeType || !base64) {
          return json(res, { error: 'Missing required fields: filename, mimeType, base64' }, 400);
        }
        if (!ALLOWED_MIMES.has(mimeType)) {
          return json(res, { error: `Unsupported mimeType. Allowed: ${[...ALLOWED_MIMES].join(', ')}` }, 415);
        }
        if (category && !ALLOWED_CATEGORIES.has(category)) {
          return json(res, { error: 'Invalid category' }, 400);
        }

        let fileBuffer: Buffer;
        try {
          fileBuffer = Buffer.from(base64, 'base64');
        } catch {
          return json(res, { error: 'Invalid base64 data' }, 400);
        }

        const maxBytes = maxBytesFor(mimeType);
        if (fileBuffer.byteLength > maxBytes) {
          return json(res, { error: `File too large. Max ${maxBytes / (1024 * 1024)}MB for ${mimeType}` }, 413);
        }

        const ext = filename.split('.').pop() ?? 'bin';
        const rand = Math.random().toString(36).slice(2, 8);
        const storagePath = `agent-proof/${params.id}/${Date.now()}-${rand}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('artifacts')
          .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

        if (uploadError) {
          return json(res, { error: `Storage upload failed: ${uploadError.message}` }, 500);
        }

        const supabaseUrl = process.env.SUPABASE_URL ?? '';
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/artifacts/${storagePath}`;

        const { data: attachment, error: dbError } = await supabase
          .from('issue_attachments')
          .insert({
            issue_id: params.id,
            comment_id: commentId ?? null,
            uploaded_by_agent_id: agentId,
            filename,
            mime_type: mimeType,
            size_bytes: fileBuffer.byteLength,
            storage_path: storagePath,
            category: category ?? 'agent_proof',
            caption: caption ?? null,
          })
          .select()
          .single();

        if (dbError) {
          await supabase.storage.from('artifacts').remove([storagePath]);
          return json(res, { error: `DB insert failed: ${dbError.message}` }, 500);
        }

        const validRunId = runId && UUID_RE.test(runId) ? runId : null;
        return json(res, {
          id: attachment.id,
          storagePath,
          publicUrl,
          sizeBytes: fileBuffer.byteLength,
          category: attachment.category,
          caption: attachment.caption,
          runId: validRunId,
        }, 201);
      }

      // ── PATCH /api/agent/issues/:id ───────────────────────
      params = matchRoute(url, '/api/agent/issues/:id');
      if (method === 'PATCH' && params) {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const body = await parseBody(req);
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (body.status) {
          updates.status = body.status;
          if (body.status === 'in_progress') updates.started_at = new Date().toISOString();
          if (body.status === 'done') updates.completed_at = new Date().toISOString();
          if (body.status === 'cancelled') updates.cancelled_at = new Date().toISOString();
        }
        if (body.priority) updates.priority = body.priority;
        if (body.assignee_agent_id) updates.assignee_agent_id = body.assignee_agent_id;

        const { data, error } = await supabase
          .from('issues')
          .update(updates)
          .eq('id', params.id)
          .select()
          .single();

        if (error) return json(res, { error: error.message }, 500);

        // Add comment if provided
        if (body.comment) {
          await supabase.from('issue_comments').insert({
            company_id: data.company_id,
            issue_id: params.id,
            author_agent_id: agentId,
            body: body.comment as string,
            created_by_run_id: runId || null,
          });
        }

        return json(res, data);
      }

      // ── POST /api/agent/issues ────────────────────────────
      if (method === 'POST' && url === '/api/agent/issues') {
        if (!agentId) return json(res, { error: 'Missing x-forge-agent-id' }, 401);

        const body = await parseBody(req);

        // Get agent's company
        const { data: agent } = await supabase
          .from('agents')
          .select('company_id')
          .eq('id', agentId)
          .single();
        if (!agent) return json(res, { error: 'Agent not found' }, 404);

        // Increment issue counter atomically
        const { data: company } = await supabase
          .from('companies')
          .select('issue_prefix, issue_counter')
          .eq('id', agent.company_id)
          .single();

        const { data: updated } = await supabase
          .from('companies')
          .update({ issue_counter: (company?.issue_counter || 0) + 1 })
          .eq('id', agent.company_id)
          .select('issue_counter')
          .single();

        const issueNumber = updated?.issue_counter || 1;
        const identifier = `${company?.issue_prefix}-${issueNumber}`;

        const { data: issue, error } = await supabase.from('issues').insert({
          company_id: agent.company_id,
          title: body.title as string,
          description: (body.description as string) || null,
          status: (body.status as string) || 'todo',
          priority: (body.priority as string) || 'medium',
          assignee_agent_id: (body.assigneeAgentId as string) || null,
          parent_id: (body.parentId as string) || null,
          project_id: (body.projectId as string) || null,
          goal_id: (body.goal_id as string) || null,
          issue_number: issueNumber,
          identifier,
          origin_kind: 'agent_created',
          origin_id: agentId,
        }).select().single();

        if (error) return json(res, { error: error.message }, 500);
        return json(res, issue, 201);
      }

      // ── GET /api/health ───────────────────────────────────
      if (method === 'GET' && url === '/api/health') {
        return json(res, { status: 'ok', service: 'forge-agent-api' });
      }

      // ── 404 ───────────────────────────────────────────────
      json(res, { error: 'Not found' }, 404);

    } catch (err) {
      logger.error({ err, url, method }, 'Agent API error');
      json(res, { error: 'Internal server error' }, 500);
    }
  });

  // Bind to localhost ONLY — never expose to network
  server.listen(port, '127.0.0.1', () => {
    logger.info({ port }, 'Agent API listening on 127.0.0.1');
  });

  return server;
}
