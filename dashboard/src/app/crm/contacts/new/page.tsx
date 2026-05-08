import { getActiveCompany } from '@/lib/get-active-company';
import { getCustomFieldsFor } from '@/lib/crm/custom-fields';
import { createForgeClient } from '@/lib/supabase/forge-server';
import { NewContactForm } from './NewContactForm';
import type { Account } from '@/lib/crm/types';

export const revalidate = 0;

async function getAccounts(companyId: string): Promise<Account[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from('crm_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  return (data ?? []) as Account[];
}

export default async function NewContactPage() {
  const company = await getActiveCompany();
  if (!company) return <div className="p-6">No active company.</div>;
  const accounts = await getAccounts(company.id);
  const customFields = getCustomFieldsFor(company.slug, 'contact');
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-4">New contact</h1>
      <NewContactForm accounts={accounts} customFields={customFields} />
    </div>
  );
}
