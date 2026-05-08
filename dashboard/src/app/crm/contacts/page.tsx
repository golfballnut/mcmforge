import Link from 'next/link';
import { createForgeClient } from '@/lib/supabase/forge-server';
import { getActiveCompany } from '@/lib/get-active-company';
import { ContactsClient } from './ContactsClient';
import type { Contact } from '@/lib/crm/types';

export const revalidate = 0;

async function getContacts(companyId: string): Promise<Contact[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(200);
  return (data ?? []) as Contact[];
}

export default async function ContactsListPage() {
  const company = await getActiveCompany();
  const contacts = company ? await getContacts(company.id) : [];
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Contacts</h1>
        <Link
          href="/crm/contacts/new"
          className="px-3 py-1.5 bg-[#238636] text-white rounded text-sm hover:bg-[#2ea043]"
        >
          + New contact
        </Link>
      </div>
      <ContactsClient initialContacts={contacts} />
    </div>
  );
}
