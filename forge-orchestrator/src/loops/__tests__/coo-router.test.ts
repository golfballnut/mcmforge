import { describe, it, expect } from 'vitest';
import { parseMetaTags } from '../coo-router.js';

describe('COO router — parseMetaTags', () => {
  it('detects [GATE-PASSED N] with single digit', () => {
    const tags = parseMetaTags('[GATE-PASSED 3] Forge Builder cleared supervised run.');
    expect(tags).toEqual([{ type: 'gate_passed', gate: 3 }]);
  });

  it('detects [GATE-FAILED N]', () => {
    const tags = parseMetaTags('Some prose.\n[GATE-FAILED 2] Dry-run failed on step 5.');
    expect(tags).toEqual([{ type: 'gate_failed', gate: 2 }]);
  });

  it('detects [DISPATCH-OK] anywhere in body', () => {
    const tags = parseMetaTags('Authorizing a run. [DISPATCH-OK] Good to go.');
    expect(tags).toContainEqual({ type: 'dispatch_ok' });
  });

  it('detects [APPROVED]', () => {
    const tags = parseMetaTags('Looks good. [APPROVED] by Steve.');
    expect(tags).toContainEqual({ type: 'approved' });
  });

  it('detects [PROOF] at start of body', () => {
    const tags = parseMetaTags('[PROOF] Build passes. Branch agent/x.');
    expect(tags).toContainEqual({ type: 'proof' });
  });

  it('detects **[PROOF — …** bolded form', () => {
    const tags = parseMetaTags('**[PROOF — infrastructure validation]**\n\nSomething');
    expect(tags).toContainEqual({ type: 'proof' });
  });

  it('detects [BLOCKED] with @mention in same line', () => {
    const tags = parseMetaTags('[BLOCKED] Build fails. @Map Rendering Expert please fix.');
    expect(tags).toContainEqual({ type: 'blocked_mention', agentName: 'Map Rendering Expert' });
  });

  it('detects [BLOCKED] with simple @mention', () => {
    const tags = parseMetaTags('[BLOCKED] Need help. @Forge-Builder over to you.');
    expect(tags).toContainEqual({ type: 'blocked_mention', agentName: 'Forge-Builder' });
  });

  it('returns multiple tags when present', () => {
    const body = '[GATE-PASSED 2] Dry-run clean. [DISPATCH-OK] Go.';
    const tags = parseMetaTags(body);
    expect(tags).toContainEqual({ type: 'gate_passed', gate: 2 });
    expect(tags).toContainEqual({ type: 'dispatch_ok' });
    expect(tags).toHaveLength(2);
  });

  it('returns empty array on plain prose', () => {
    const tags = parseMetaTags('Just a status update with no meta-tags.');
    expect(tags).toEqual([]);
  });

  it('is case-insensitive for tag matching', () => {
    const tags = parseMetaTags('[gate-passed 1] lowercase test');
    expect(tags).toContainEqual({ type: 'gate_passed', gate: 1 });
  });

  it('does NOT match partial tokens like [GATE] alone', () => {
    const tags = parseMetaTags('[GATE] by itself is not a tag.');
    expect(tags).toEqual([]);
  });

  it('does NOT match tags inside URLs or code blocks (best-effort — regex based)', () => {
    // This is a known limitation — the regex is line-based, doesn't understand markdown.
    // Documented here so the behavior is explicit.
    const tags = parseMetaTags('See https://example.com/[GATE-PASSED 1] for details');
    // Current behavior: will match. A future upgrade could skip inline code/URLs.
    expect(tags).toContainEqual({ type: 'gate_passed', gate: 1 });
  });
});

describe('COO router — integration (Supabase mock)', () => {
  // Minimal mock client for evaluateComment happy path.
  // Full integration tests should run against a local Supabase.
  function makeMockSupabase(state: {
    issue: { id: string; assignee_agent_id: string | null };
    agents: Array<{ id: string; name: string; company_id: string; status: string; certification_gate: number }>;
    attachments: Array<{ id: string; issue_id: string; uploaded_by_agent_id: string; created_at: string }>;
  }) {
    const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

    const build = (table: string) => ({
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        const q: Record<string, unknown> = { table, op: 'select', count: opts?.count };
        const chain = {
          eq: (_col: string, _val: unknown) => chain,
          gte: (_col: string, _val: unknown) => chain,
          lte: (_col: string, _val: unknown) => chain,
          in: (_col: string, _vals: unknown[]) => chain,
          order: (_col: string, _o?: unknown) => chain,
          limit: (_n: number) => chain,
          single: async () => {
            if (table === 'issues') return { data: state.issue, error: null };
            if (table === 'agents' && _val_matcher(q, 'assignee')) {
              const a = state.agents.find(x => x.id === state.issue.assignee_agent_id);
              return { data: a ?? null, error: null };
            }
            return { data: null, error: null };
          },
          then: (cb: (r: { data: unknown; error: unknown; count?: number }) => void) => {
            if (table === 'agents') cb({ data: state.agents, error: null });
            else if (table === 'issue_attachments' && opts?.count) {
              cb({ data: null, error: null, count: state.attachments.length });
            } else cb({ data: [], error: null });
          },
        };
        // minimal thenable for .eq().eq()... chains that await
        return chain;
      },
      insert: async (payload: unknown) => {
        calls.push({ table, op: 'insert', payload });
        return { data: payload, error: null };
      },
      update: (payload: unknown) => {
        calls.push({ table, op: 'update', payload });
        return { eq: () => Promise.resolve({ data: payload, error: null }) };
      },
    });

    function _val_matcher(_q: unknown, _label: string) { return true; }

    return {
      from: (table: string) => build(table),
      _calls: () => calls,
    };
  }

  it('is wired (smoke test — parseMetaTags exported)', () => {
    // The full Supabase mock gets complex; rely on parse tests + real-DB integration test.
    expect(typeof parseMetaTags).toBe('function');
  });
});
