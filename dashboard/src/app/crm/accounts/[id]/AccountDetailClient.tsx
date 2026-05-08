'use client';

import Link from 'next/link';
import { ActivityTimeline } from '@/components/crm/ActivityTimeline';
import { ContactCard } from '@/components/crm/ContactCard';
import type { Account, Contact, TimelineEntry } from '@/lib/crm/types';

interface Props {
  account: Account;
  contacts: Contact[];
  timeline: TimelineEntry[];
}

export function AccountDetailClient({ account, contacts, timeline }: Props) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/crm/accounts" className="text-sm text-[#58a6ff] hover:underline">← Accounts</Link>
      <h1 className="text-2xl font-bold text-white mt-1">{account.name}</h1>
      <div className="text-sm text-[#8b949e] mb-6">
        {account.domain && <>{account.domain} · </>}
        {account.account_type} · {account.status}
      </div>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-white mb-2">Contacts ({contacts.length})</h2>
        {contacts.length === 0 ? (
          <div className="text-sm text-[#8b949e]">No contacts yet.</div>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => <ContactCard key={c.id} contact={c} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white mb-2">Account timeline</h2>
        <ActivityTimeline entries={timeline} />
      </section>
    </div>
  );
}
