// Single source of truth for CRM types. Every client + UI imports from here.

export type AccountType = 'supplier' | 'customer' | 'partner' | 'other';
export type AccountStatus = 'active' | 'inactive' | 'churned';
export type ContactStatus = 'lead' | 'qualified' | 'won' | 'lost' | 'archived';
export type ActivityKind = 'call' | 'email_sent' | 'email_received' | 'note' | 'meeting';
export type ActorKind = 'agent' | 'human';
export type TimelineSource = 'explicit' | 'derived_issue_event';

export interface Account {
  id: string;
  company_id: string;
  name: string;
  domain: string | null;
  account_type: AccountType;
  status: AccountStatus;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Contact {
  id: string;
  company_id: string;
  account_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  status: ContactStatus;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Activity {
  id: string;
  company_id: string;
  contact_id: string | null;
  account_id: string | null;
  issue_id: string | null;
  kind: ActivityKind;
  subject: string | null;
  body: string | null;
  actor_kind: ActorKind;
  actor_id: string | null;
  occurred_at: string;
  created_at: string;
}

export interface TimelineEntry {
  id: string;
  company_id: string;
  contact_id: string | null;
  account_id: string | null;
  issue_id: string | null;
  kind: string;            // wider than ActivityKind because issue_events use event_type strings
  subject: string | null;
  body: string | null;
  actor_kind: ActorKind;
  actor_id: string | null;
  occurred_at: string;
  source: TimelineSource;
}

export interface NewContact {
  company_id: string;
  account_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  status?: ContactStatus;
  custom_fields?: Record<string, unknown>;
}

export interface NewActivity {
  company_id: string;
  contact_id?: string | null;
  account_id?: string | null;
  issue_id?: string | null;
  kind: ActivityKind;
  subject?: string | null;
  body?: string | null;
  actor_kind: ActorKind;
  actor_id?: string | null;
  occurred_at?: string;
}
