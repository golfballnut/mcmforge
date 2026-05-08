import { createForgeClient } from '@/lib/supabase/forge-server';
import { listActivitiesForContact } from '@/lib/crm/client';
import { getActiveCompany } from '@/lib/get-active-company';
import { getCustomFieldsFor } from '@/lib/crm/custom-fields';
import { ContactDetailClient } from './ContactDetailClient';
import { notFound } from 'next/navigation';
import type { Contact, Account } from '@/lib/crm/types';

export const revalidate = 0;

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createForgeClient();
  const { data: contact } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!contact) notFound();

  let account: Account | null = null;
  if ((contact as Contact).account_id) {
    const { data } = await supabase
      .from('crm_accounts')
      .select('*')
      .eq('id', (contact as Contact).account_id)
      .maybeSingle();
    account = (data ?? null) as Account | null;
  }

  const timeline = await listActivitiesForContact(id, 100);
  const company = await getActiveCompany();
  const customFields = company ? getCustomFieldsFor(company.slug, 'contact') : [];

  const { data: openIssues } = await supabase
    .from('issues')
    .select('id, identifier, title, status')
    .eq('contact_id', id)
    .neq('status', 'done')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <ContactDetailClient
      contact={contact as Contact}
      account={account}
      timeline={timeline}
      customFields={customFields}
      openIssues={openIssues ?? []}
    />
  );
}
