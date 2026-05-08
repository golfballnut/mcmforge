'use client';

import { useState, useRef } from 'react';
import type { Contact, TimelineEntry } from '@/lib/crm/types';

// Note: SSE events carry the forge.run_events row shape, which uses `event_type`
// (not `kind`) since that's the real column name. Payload shape varies by event_type.

export function AgentEyePanel({ contact, timeline }: { contact: Contact; timeline: TimelineEntry[] }) {
  const [hypothetical, setHypothetical] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  async function preview() {
    setError(null);
    setDraft('');
    setStreaming(true);
    try {
      const res = await fetch('/api/crm/preview-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, hypothetical }),
      });
      if (res.status === 429) { setError('Slow down — 1 preview per 30s.'); setStreaming(false); return; }
      if (!res.ok) { setError(`Queue failed (${res.status})`); setStreaming(false); return; }
      const { runId } = (await res.json()) as { runId: string };
      const es = new EventSource(`/api/crm/preview-draft/stream?runId=${runId}`);
      esRef.current = es;
      es.addEventListener('event', (e) => {
        try {
          const evt = JSON.parse((e as MessageEvent).data) as { event_type?: string; payload?: { text?: string } };
          if (evt.payload?.text) setDraft((prev) => prev + evt.payload!.text);
        } catch { /* ignore parse errors */ }
      });
      es.addEventListener('done', () => { setStreaming(false); es.close(); });
      es.addEventListener('timeout', () => { setError('Timed out waiting for orchestrator.'); setStreaming(false); es.close(); });
      es.onerror = () => { setError('Stream interrupted.'); setStreaming(false); es.close(); };
    } catch (e) {
      setError(String(e));
      setStreaming(false);
    }
  }

  return (
    <aside className="w-80 shrink-0 p-4 border-l border-[#30363d] min-h-screen bg-[#0d1117]">
      <h2 className="text-sm font-semibold text-white mb-2">Agent&rsquo;s view</h2>

      <section className="mb-4">
        <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide mb-1">Knowledge summary</h3>
        <ul className="space-y-1 text-xs">
          <li><span className="text-[#8b949e]">Status:</span> <span className="text-white">{contact.status}</span></li>
          {timeline.slice(0, 5).map((e) => (
            <li key={e.id} className="text-[#c9d1d9]">
              {new Date(e.occurred_at).toLocaleDateString()} — <span className="text-[#8b949e]">{e.kind}</span>
              {e.subject && <> · {e.subject}</>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide mb-1">Preview a draft</h3>
        <textarea
          value={hypothetical}
          onChange={(e) => setHypothetical(e.target.value)}
          rows={3}
          placeholder="Hypothetical inbound message…"
          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs"
        />
        <button
          onClick={preview}
          disabled={streaming}
          className="mt-2 w-full px-3 py-1.5 bg-[#1f6feb] text-white rounded text-xs disabled:opacity-50"
          data-testid="preview-draft-button"
        >
          {streaming ? 'Streaming…' : 'Generate preview'}
        </button>
        {error && <div className="mt-2 text-xs text-[#f85149]">{error}</div>}
        {draft && (
          <div data-testid="preview-draft-result" className="mt-3 text-xs text-[#c9d1d9] whitespace-pre-wrap p-2 border border-[#30363d] rounded bg-[#0d1117]">
            {draft}
          </div>
        )}
      </section>
    </aside>
  );
}
