import Link from 'next/link';
import type { Contact } from '@/lib/crm/types';

const STATUS_COLORS: Record<string, string> = {
  lead:       'bg-[#1f3358] text-[#58a6ff]',
  qualified:  'bg-[#3a2f00] text-[#d29922]',
  won:        'bg-[#0f2d1f] text-[#3fb950]',
  lost:       'bg-[#3d1f1f] text-[#f85149]',
  archived:   'bg-[#30363d] text-[#8b949e]',
};

export function ContactCard({ contact }: { contact: Contact }) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || '(no name)';
  return (
    <Link
      href={`/crm/contacts/${contact.id}`}
      className="block border border-[#30363d] rounded p-3 hover:border-[#58a6ff] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">{name}</div>
          {contact.email && <div className="text-xs text-[#8b949e]">{contact.email}</div>}
          {contact.title && <div className="text-xs text-[#8b949e]">{contact.title}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[contact.status] ?? STATUS_COLORS.lead}`}>
          {contact.status}
        </span>
      </div>
    </Link>
  );
}
