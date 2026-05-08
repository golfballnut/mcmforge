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
  throw new Error('not implemented');
}

export async function createContact(
  input: NewContact,
  client?: SupabaseLike,
): Promise<Contact> {
  throw new Error('not implemented');
}

export async function updateContact(
  id: string,
  patch: Partial<NewContact>,
  client?: SupabaseLike,
): Promise<Contact> {
  throw new Error('not implemented');
}

export async function findOrCreateAccount(
  companyId: string,
  domain: string,
  fallbackName: string,
  client?: SupabaseLike,
): Promise<Account> {
  throw new Error('not implemented');
}

export async function logActivity(
  input: NewActivity,
  client?: SupabaseLike,
): Promise<Activity> {
  throw new Error('not implemented');
}

export async function listActivitiesForContact(
  contactId: string,
  limit: number = 100,
  client?: SupabaseLike,
): Promise<TimelineEntry[]> {
  throw new Error('not implemented');
}

export async function listActivitiesForAccount(
  accountId: string,
  limit: number = 100,
  client?: SupabaseLike,
): Promise<TimelineEntry[]> {
  throw new Error('not implemented');
}

export async function searchCrm(
  q: string,
  limit: number = 50,
  client?: SupabaseLike,
): Promise<Array<{ kind: 'contact' | 'account'; id: string; title: string; detail: string | null; portfolio_co: string }>> {
  throw new Error('not implemented');
}
