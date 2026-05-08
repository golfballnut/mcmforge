'use server';

import { logActivity, updateContact } from '@/lib/crm/client';
import { getActiveCompany } from '@/lib/get-active-company';
import { revalidatePath } from 'next/cache';

export async function logActivityAction(contactId: string, formData: FormData) {
  const company = await getActiveCompany();
  if (!company) throw new Error('No active company');
  await logActivity({
    company_id: company.id,
    contact_id: contactId,
    kind: (formData.get('kind') as 'call' | 'email_sent' | 'email_received' | 'note' | 'meeting') ?? 'note',
    subject: (formData.get('subject') as string) || null,
    body:    (formData.get('body')    as string) || null,
    actor_kind: 'human',
    actor_id: 'dashboard-user',
  });
  revalidatePath(`/crm/contacts/${contactId}`);
}

export async function updateContactStatusAction(contactId: string, status: string) {
  await updateContact(contactId, { status: status as 'lead' | 'qualified' | 'won' | 'lost' | 'archived' });
  revalidatePath(`/crm/contacts/${contactId}`);
}
