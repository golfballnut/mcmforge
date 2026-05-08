import type { Account, Contact, Activity, TimelineEntry, NewContact, NewActivity } from './types';
import { createForgeClient } from '@/lib/supabase/forge-server';

type SupabaseLike = Awaited<ReturnType<typeof createForgeClient>>;

// Cookie-auth client. RLS-respecting. Use from server components + server actions.
// Service-role variants (for /api/* routes) live in service-client.ts.

export async function findContactByEmail(
  companyId: string,
  email: string,
  client?: SupabaseLike,
): Promise<Contact | null> {
  const supabase = client ?? await createForgeClient();
  const { data, error } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('company_id', companyId)
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return (data as Contact | null) ?? null;
}

export async function createContact(
  input: NewContact,
  client?: SupabaseLike,
): Promise<Contact> {
  const supabase = client ?? await createForgeClient();
  const { data, error } = await supabase
    .from('crm_contacts')
    .insert(input as Record<string, unknown>)
    .select('*')
    .single();
  if (error) throw error;
  return data as Contact;
}

export async function updateContact(
  id: string,
  patch: Partial<NewContact>,
  client?: SupabaseLike,
): Promise<Contact> {
  const supabase = client ?? await createForgeClient();
  const { data, error } = await supabase
    .from('crm_contacts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Contact;
}

export async function findOrCreateAccount(
  companyId: string,
  domain: string,
  fallbackName: string,
  client?: SupabaseLike,
): Promise<Account> {
  const supabase = client ?? await createForgeClient();
  const { data: existing, error: findErr } = await supabase
    .from('crm_accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('domain', domain)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing as Account;
  const { data: created, error: insertErr } = await supabase
    .from('crm_accounts')
    .insert({ company_id: companyId, name: fallbackName, domain })
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  return created as Account;
}

export async function logActivity(
  input: NewActivity,
  client?: SupabaseLike,
): Promise<Activity> {
  if (!input.contact_id && !input.account_id) {
    throw new Error('logActivity requires contact_id or account_id');
  }
  const supabase = client ?? await createForgeClient();
  const { data, error } = await supabase
    .from('crm_activities')
    .insert(input as Record<string, unknown>)
    .select('*')
    .single();
  if (error) throw error;
  return data as Activity;
}

export async function listActivitiesForContact(
  contactId: string,
  limit: number = 100,
  client?: SupabaseLike,
): Promise<TimelineEntry[]> {
  const supabase = client ?? await createForgeClient();
  const { data, error } = await supabase
    .from('crm_activity_timeline')
    .select('*')
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TimelineEntry[];
}

export async function listActivitiesForAccount(
  accountId: string,
  limit: number = 100,
  client?: SupabaseLike,
): Promise<TimelineEntry[]> {
  const supabase = client ?? await createForgeClient();
  const { data, error } = await supabase
    .from('crm_activity_timeline')
    .select('*')
    .eq('account_id', accountId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TimelineEntry[];
}

export async function searchCrm(
  q: string,
  limit: number = 50,
  client?: SupabaseLike,
): Promise<Array<{ kind: 'contact' | 'account'; id: string; title: string; detail: string | null; portfolio_co: string }>> {
  throw new Error('not implemented');
}
