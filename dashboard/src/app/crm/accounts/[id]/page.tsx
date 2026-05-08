import { createForgeClient } from '@/lib/supabase/forge-server';
import { listActivitiesForAccount } from '@/lib/crm/client';
import { AccountDetailClient } from './AccountDetailClient';
import { notFound } from 'next/navigation';
import type { Account, Contact } from '@/lib/crm/types';

export const revalidate = 0;

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createForgeClient();
  const { data: account } = await supabase
    .from('crm_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!account) notFound();
  const { data: contacts } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('account_id', id)
    .order('updated_at', { ascending: false })
    .limit(50);
  const timeline = await listActivitiesForAccount(id, 100);
  return (
    <AccountDetailClient
      account={account as Account}
      contacts={(contacts ?? []) as Contact[]}
      timeline={timeline}
    />
  );
}
