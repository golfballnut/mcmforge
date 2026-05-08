'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Row {
  kind: 'contact' | 'account';
  id: string;
  title: string;
  detail: string | null;
  portfolio_co: string;
}

export function SearchClient({ initialQuery, initialResults }: { initialQuery: string; initialResults: Row[] }) {
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/crm/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <>
      <form onSubmit={submit} className="mb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="email, name, domain…"
          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
          autoFocus
        />
      </form>
      {initialResults.length === 0 && initialQuery ? (
        <div className="text-sm text-[#8b949e]">No matches.</div>
      ) : (
        <ul className="divide-y divide-[#21262d]">
          {initialResults.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="py-2">
              <Link href={r.kind === 'contact' ? `/crm/contacts/${r.id}` : `/crm/accounts/${r.id}`} className="text-[#58a6ff] hover:underline">
                {r.title}
              </Link>
              <div className="text-xs text-[#8b949e]">
                <span className="px-1.5 py-0.5 mr-2 bg-[#21262d] rounded">{r.kind}</span>
                <span className="px-1.5 py-0.5 mr-2 bg-[#1f3358] text-[#58a6ff] rounded">{r.portfolio_co}</span>
                {r.detail && <span>{r.detail}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
