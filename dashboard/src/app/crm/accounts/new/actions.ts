'use server';

import { findOrCreateAccount } from '@/lib/crm/client';
import { getActiveCompany } from '@/lib/get-active-company';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function createAccountAction(formData: FormData) {
  const company = await getActiveCompany();
  if (!company) throw new Error('No active company');
  const domain = (formData.get('domain') as string) || `manual-${Date.now()}.example`;
  const name = (formData.get('name') as string) || 'Untitled account';
  const account = await findOrCreateAccount(company.id, domain, name);
  revalidatePath('/crm/accounts');
  redirect(`/crm/accounts/${account.id}`);
}
