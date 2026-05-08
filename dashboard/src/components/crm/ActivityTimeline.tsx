import Link from 'next/link';
import type { TimelineEntry } from '@/lib/crm/types';

const KIND_ICONS: Record<string, string> = {
  call:           '📞',
  email_sent:     '✉️ →',
  email_received: '✉️ ←',
  note:           '📝',
  meeting:        '🤝',
};

export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-sm text-[#8b949e] p-4 text-center">No activity yet.</div>;
  }
  return (
    <ul className="divide-y divide-[#21262d]">
      {entries.map((e) => {
        const icon = KIND_ICONS[e.kind] ?? '•';
        const when = new Date(e.occurred_at).toLocaleString();
        return (
          <li key={e.id} className="py-3 flex gap-3">
            <span className="text-xl shrink-0" aria-hidden>{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                <span className={`px-1.5 py-0.5 rounded ${e.actor_kind === 'agent' ? 'bg-[#2b1f5c] text-[#a371f7]' : 'bg-[#30363d] text-[#c9d1d9]'}`}>
                  {e.actor_kind}{e.actor_id ? ` · ${e.actor_id}` : ''}
                </span>
                <span>{when}</span>
                {e.source === 'derived_issue_event' && e.issue_id && (
                  <Link href={`/issues/${e.issue_id}`} className="text-[#58a6ff] hover:underline">
                    from issue
                  </Link>
                )}
              </div>
              {e.subject && <div className="text-sm text-white mt-0.5">{e.subject}</div>}
              {e.body && <div className="text-sm text-[#c9d1d9] mt-0.5 line-clamp-3">{e.body}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
