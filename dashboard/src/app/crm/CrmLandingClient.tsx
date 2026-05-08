'use client';

import Link from 'next/link';

const TABS: Array<{ label: string; href: string; description: string }> = [
  { label: 'Contacts',   href: '/crm/contacts',   description: 'People you talk to.' },
  { label: 'Accounts',   href: '/crm/accounts',   description: 'Companies (suppliers, customers, partners).' },
  { label: 'Activities', href: '/crm/activities', description: 'Timeline of calls, notes, emails.' },
  { label: 'Search',     href: '/crm/search',     description: 'Find anything across all 5 portfolio cos.' },
];

export function CrmLandingClient() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="block border border-[#30363d] rounded p-4 hover:border-[#58a6ff] transition-colors"
        >
          <div className="text-base font-semibold text-white">{t.label}</div>
          <div className="text-xs text-[#8b949e] mt-1">{t.description}</div>
        </Link>
      ))}
    </div>
  );
}
