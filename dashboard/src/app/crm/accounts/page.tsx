import Link from 'next/link';
import { createForgeClient } from '@/lib/supabase/forge-server';
import { getActiveCompany } from '@/lib/get-active-company';
import { AccountsClient } from './AccountsClient';
import type { Account } from '@/lib/crm/types';

export const revalidate = 0;

async function getAccounts(companyId: string): Promise<Account[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from('crm_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(200);
  return (data ?? []) as Account[];
}

export default async function AccountsListPage() {
  const company = await getActiveCompany();
  const accounts = company ? await getAccounts(company.id) : [];
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Accounts</h1>
        <Link href="/crm/accounts/new" className="px-3 py-1.5 bg-[#238636] text-white rounded text-sm hover:bg-[#2ea043]">+ New account</Link>
      </div>
      <AccountsClient initialAccounts={accounts} />
    </div>
  );
}
