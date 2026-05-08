'use client';

import { useState, useMemo } from 'react';
import { ContactCard } from '@/components/crm/ContactCard';
import type { Contact, ContactStatus } from '@/lib/crm/types';

const STATUS_FILTERS: Array<ContactStatus | 'all'> = ['all', 'lead', 'qualified', 'won', 'lost', 'archived'];

export function ContactsClient({ initialContacts }: { initialContacts: Contact[] }) {
  const [filter, setFilter] = useState<ContactStatus | 'all'>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return initialContacts.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (q) {
        const hay = `${c.first_name ?? ''} ${c.last_name ?? ''} ${c.email ?? ''} ${c.title ?? ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [initialContacts, filter, q]);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search name/email/title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ContactStatus | 'all')}
          className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
        >
          {STATUS_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="text-sm text-[#8b949e] p-8 text-center border border-dashed border-[#30363d] rounded">
          No contacts match. Add one or change filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => <ContactCard key={c.id} contact={c} />)}
        </div>
      )}
    </>
  );
}
