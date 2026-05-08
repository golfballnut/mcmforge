'use client';

import type { Contact, TimelineEntry } from '@/lib/crm/types';

export function AgentEyePanel({ contact, timeline }: { contact: Contact; timeline: TimelineEntry[] }) {
  return (
    <aside className="w-80 shrink-0 p-4 border-l border-[#30363d] min-h-screen bg-[#0d1117]">
      <h2 className="text-sm font-semibold text-white mb-2">Agent&rsquo;s view</h2>
      <div className="text-xs text-[#8b949e]">
        Last 5 activities, status, custom fields, preview-draft button — wired in next task.
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {timeline.slice(0, 5).map((e) => (
          <li key={e.id} className="text-[#c9d1d9]">
            {new Date(e.occurred_at).toLocaleDateString()} — <span className="text-[#8b949e]">{e.kind}</span>
            {e.subject && <> · {e.subject}</>}
          </li>
        ))}
      </ul>
      <div className="mt-4 text-xs text-[#8b949e]">Status: <span className="text-white">{contact.status}</span></div>
    </aside>
  );
}
