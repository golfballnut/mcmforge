'use server';

import { createContact } from '@/lib/crm/client';
import { getActiveCompany } from '@/lib/get-active-company';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function createContactAction(formData: FormData) {
  const company = await getActiveCompany();
  if (!company) throw new Error('No active company');
  const customFields: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('custom_fields.')) customFields[key.slice('custom_fields.'.length)] = value;
  }
  const contact = await createContact({
    company_id: company.id,
    first_name: (formData.get('first_name') as string) || null,
    last_name:  (formData.get('last_name')  as string) || null,
    email:      (formData.get('email')      as string) || null,
    phone:      (formData.get('phone')      as string) || null,
    title:      (formData.get('title')      as string) || null,
    status:     ((formData.get('status')    as string) || 'lead') as 'lead' | 'qualified' | 'won' | 'lost' | 'archived',
    account_id: ((formData.get('account_id') as string) || null) || null,
    custom_fields: customFields,
  });
  revalidatePath('/crm/contacts');
  redirect(`/crm/contacts/${contact.id}`);
}
