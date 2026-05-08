import { searchCrm } from '@/lib/crm/client';
import { SearchClient } from './SearchClient';

export const revalidate = 0;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const results = q ? await searchCrm(q, 50) : [];
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Cross-portfolio search</h1>
      <p className="text-sm text-[#8b949e] mb-4">Searches contacts + accounts across all 5 portfolio cos.</p>
      <SearchClient initialQuery={q ?? ''} initialResults={results} />
    </div>
  );
}
