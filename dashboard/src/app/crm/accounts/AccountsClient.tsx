'use client';

import { useState, useMemo } from 'react';
import { AccountCard } from '@/components/crm/AccountCard';
import type { Account, AccountType } from '@/lib/crm/types';

const TYPE_FILTERS: Array<AccountType | 'all'> = ['all', 'supplier', 'customer', 'partner', 'other'];

export function AccountsClient({ initialAccounts }: { initialAccounts: Account[] }) {
  const [filter, setFilter] = useState<AccountType | 'all'>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return initialAccounts.filter((a) => {
      if (filter !== 'all' && a.account_type !== filter) return false;
      if (q) {
        const hay = `${a.name} ${a.domain ?? ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [initialAccounts, filter, q]);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <input type="search" placeholder="Search name or domain…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as AccountType | 'all')} className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm">
          {TYPE_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="text-sm text-[#8b949e] p-8 text-center border border-dashed border-[#30363d] rounded">
          No accounts match.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => <AccountCard key={a.id} account={a} />)}
        </div>
      )}
    </>
  );
}
