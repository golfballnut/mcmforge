# MCMForge CRM v1 — Implementation Plan (WO-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship CRM v1 inside the MCMForge dashboard — three new `forge.*` tables, one column delta on `forge.issues`, one SQL view, a typed CRM client, six pages under `/crm`, agent's-eye preview panel, and cross-portfolio search — all in one PR on `feature/wo-2-mcmforge-crm-design`.

**Architecture:** Single Postgres source of truth. Dashboard pages call a typed `lib/crm/client.ts` against the existing `forge` schema. Activity timeline is a `UNION ALL` view of explicit `forge.crm_activities` rows + auto-derived `forge.issue_events`. Preview-draft queues a `forge.runs` row tagged `kind='crm_preview_draft'`; the existing Mini orchestrator picks it up, runs `claude` CLI, writes events back; dashboard streams via Supabase Realtime. No new infrastructure.

**Tech Stack:** Next.js 16, React 19, Supabase (`@supabase/ssr` + service role client), TypeScript 5, Tailwind 4, Vitest 4 (unit), Playwright 1.59 (e2e), forge schema via `forge-server.ts` cookie auth, `forge-client.ts` browser realtime.

**Inputs read & assumed:**
- WO doc: `docs/superpowers/work-orders/wo-2-mcmforge-crm-v1.md`
- Approved spec: `docs/superpowers/specs/2026-05-07-mcmforge-crm-design.md`
- Pre-existing patterns: `dashboard/src/app/issues/{page.tsx,IssuesClient.tsx,[id]/page.tsx}`, `dashboard/src/lib/supabase/forge-server.ts`, `supabase/migrations/20260507_forge_rls_lockdown.sql`
- Branch already on `feature/wo-2-mcmforge-crm-design`

**Date convention:** Migrations in `supabase/migrations/` use `YYYYMMDD_<slug>.sql`. This plan uses `20260508_forge_crm_v1_schema.sql` to sort after the two WO-1 migrations dated 20260507. If the implementer is running on a later date, swap the prefix to that date — but keep the file name immutable across the rest of the plan steps below.

**Memory-driven gotchas baked in:**
- All LLM calls go through `claude` CLI on the Mini (never `new Anthropic()` with API key) — preview-draft uses the orchestrator queue, not direct Anthropic SDK.
- `forge.run_events.seq` is BIGINT (fixed in WO-1) — no overflow concerns when seeding test events.
- Dashboard already authenticates via `forge-server.ts` cookie auth; service-role client is only used in `/api/*` routes for agent-side writes.
- Plan never bypasses CI — pre-commit hooks must pass on every commit; if a hook fails, fix and create a NEW commit (don't `--amend`).

---

## File Structure

**Created:**
- `supabase/migrations/20260508_forge_crm_v1_schema.sql` — all schema changes in one transaction
- `dashboard/src/lib/crm/types.ts` — shared TypeScript types
- `dashboard/src/lib/crm/client.ts` — typed CRM operations (cookie-auth client)
- `dashboard/src/lib/crm/service-client.ts` — service-role client (used by API route only)
- `dashboard/src/lib/crm/agent-preview.ts` — prompt template + run-queue helper
- `dashboard/src/lib/crm/custom-fields/index.ts` — schema lookup by portfolio co
- `dashboard/src/lib/crm/custom-fields/{links-choice,gbn,hgb,mcm-forge,dirtsync}.ts` — five stub schemas
- `dashboard/src/lib/__tests__/crm-client.test.ts` — Vitest specs for client.ts
- `dashboard/src/lib/__tests__/crm-custom-fields.test.ts` — Vitest specs for schema lookup
- `dashboard/src/components/crm/ContactCard.tsx`
- `dashboard/src/components/crm/AccountCard.tsx`
- `dashboard/src/components/crm/ActivityTimeline.tsx`
- `dashboard/src/components/crm/CustomFieldForm.tsx`
- `dashboard/src/components/crm/__tests__/ActivityTimeline.test.tsx`
- `dashboard/src/components/crm/__tests__/CustomFieldForm.test.tsx`
- `dashboard/src/app/crm/page.tsx` — landing tabs
- `dashboard/src/app/crm/CrmLandingClient.tsx`
- `dashboard/src/app/crm/contacts/page.tsx` — list (server)
- `dashboard/src/app/crm/contacts/ContactsClient.tsx` — list (client)
- `dashboard/src/app/crm/contacts/new/page.tsx`
- `dashboard/src/app/crm/contacts/new/NewContactForm.tsx`
- `dashboard/src/app/crm/contacts/[id]/page.tsx` — detail (server)
- `dashboard/src/app/crm/contacts/[id]/ContactDetailClient.tsx`
- `dashboard/src/app/crm/contacts/[id]/AgentEyePanel.tsx`
- `dashboard/src/app/crm/contacts/[id]/actions.ts` — server actions (log activity, edit contact)
- `dashboard/src/app/crm/accounts/page.tsx`
- `dashboard/src/app/crm/accounts/AccountsClient.tsx`
- `dashboard/src/app/crm/accounts/new/page.tsx`
- `dashboard/src/app/crm/accounts/new/NewAccountForm.tsx`
- `dashboard/src/app/crm/accounts/[id]/page.tsx`
- `dashboard/src/app/crm/accounts/[id]/AccountDetailClient.tsx`
- `dashboard/src/app/crm/activities/page.tsx`
- `dashboard/src/app/crm/search/page.tsx`
- `dashboard/src/app/crm/search/SearchClient.tsx`
- `dashboard/src/app/api/crm/preview-draft/route.ts` — POST queues a run, returns runId for Realtime subscription
- `dashboard/src/app/api/crm/preview-draft/stream/route.ts` — GET SSE stream subscribed to a run's events
- `dashboard/e2e/crm.spec.ts` — Playwright end-to-end

**Modified:**
- `dashboard/src/components/Sidebar.tsx` — add `/crm` nav link next to `/issues`
- `dashboard/e2e/smoke.spec.ts` — add `/crm`, `/crm/contacts`, `/crm/accounts`, `/crm/search` to PAGES array

---

## Phase 1 — Database schema (Day 1)

### Task 1.1: Write the migration SQL

**Files:**
- Create: `supabase/migrations/20260508_forge_crm_v1_schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 20260508_forge_crm_v1_schema.sql
-- WO-2: MCMForge CRM v1.
-- Adds 3 tables (crm_accounts, crm_contacts, crm_activities), 1 column (issues.contact_id),
-- 1 view (crm_activity_timeline), and permissive RLS (matches WO-1 pattern).
-- Tenant isolation deferred to future RBAC WO.

BEGIN;

-- ─── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE forge.crm_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES forge.companies(id),
  name          TEXT NOT NULL,
  domain        TEXT,
  account_type  TEXT NOT NULL DEFAULT 'other'
                CHECK (account_type IN ('supplier','customer','partner','other')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive','churned')),
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  UNIQUE (company_id, domain)
);

CREATE INDEX idx_crm_accounts_company_id ON forge.crm_accounts(company_id);
CREATE INDEX idx_crm_accounts_domain     ON forge.crm_accounts(domain);

CREATE TABLE forge.crm_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES forge.companies(id),
  account_id    UUID REFERENCES forge.crm_accounts(id) ON DELETE SET NULL,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  title         TEXT,
  status        TEXT NOT NULL DEFAULT 'lead'
                CHECK (status IN ('lead','qualified','won','lost','archived')),
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  UNIQUE (company_id, email)
);

CREATE INDEX idx_crm_contacts_company_id ON forge.crm_contacts(company_id);
CREATE INDEX idx_crm_contacts_account_id ON forge.crm_contacts(account_id);
CREATE INDEX idx_crm_contacts_email      ON forge.crm_contacts(email);

CREATE TABLE forge.crm_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES forge.companies(id),
  contact_id  UUID REFERENCES forge.crm_contacts(id) ON DELETE CASCADE,
  account_id  UUID REFERENCES forge.crm_accounts(id) ON DELETE CASCADE,
  issue_id    UUID REFERENCES forge.issues(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL
              CHECK (kind IN ('call','email_sent','email_received','note','meeting')),
  subject     TEXT,
  body        TEXT,
  actor_kind  TEXT NOT NULL CHECK (actor_kind IN ('agent','human')),
  actor_id    TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (contact_id IS NOT NULL OR account_id IS NOT NULL)
);

CREATE INDEX idx_crm_activities_company_id  ON forge.crm_activities(company_id);
CREATE INDEX idx_crm_activities_contact_id  ON forge.crm_activities(contact_id);
CREATE INDEX idx_crm_activities_account_id  ON forge.crm_activities(account_id);
CREATE INDEX idx_crm_activities_occurred_at ON forge.crm_activities(occurred_at DESC);

-- ─── forge.issues column delta ─────────────────────────────────────────────

ALTER TABLE forge.issues
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES forge.crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_forge_issues_contact_id ON forge.issues(contact_id);

-- ─── Activity timeline view ────────────────────────────────────────────────

CREATE OR REPLACE VIEW forge.crm_activity_timeline AS
SELECT
  id, company_id, contact_id, account_id, issue_id,
  kind, subject, body, actor_kind, actor_id, occurred_at,
  'explicit'::text AS source
FROM forge.crm_activities

UNION ALL

SELECT
  ie.id,
  i.company_id,
  i.contact_id,
  c.account_id,
  i.id                                AS issue_id,
  ie.event_type                       AS kind,
  i.title                             AS subject,
  COALESCE(ie.new_value, ie.metadata::text) AS body,
  CASE WHEN ie.actor_type = 'agent' THEN 'agent' ELSE 'human' END AS actor_kind,
  ie.actor_id                         AS actor_id,
  ie.created_at                       AS occurred_at,
  'derived_issue_event'::text         AS source
FROM forge.issue_events ie
JOIN forge.issues i        ON i.id = ie.issue_id
LEFT JOIN forge.crm_contacts c ON c.id = i.contact_id
WHERE i.contact_id IS NOT NULL;

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE forge.crm_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.crm_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.crm_activities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.crm_accounts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.crm_contacts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.crm_activities
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
```

- [ ] **Step 2: Apply to a Supabase branch DB**

Use `mcp__supabase__create_branch` (name: `wo-2-crm-test`), then `mcp__supabase__apply_migration` against that branch with the SQL from Step 1. Verify via:

```
mcp__supabase__execute_sql:
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='forge' AND table_name LIKE 'crm_%'
  ORDER BY table_name;
```

Expected output: `crm_accounts`, `crm_activities`, `crm_contacts`.

Also verify the column + view + RLS:

```sql
SELECT column_name FROM information_schema.columns
  WHERE table_schema='forge' AND table_name='issues' AND column_name='contact_id';
SELECT viewname FROM pg_views WHERE schemaname='forge' AND viewname='crm_activity_timeline';
SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('crm_accounts','crm_contacts','crm_activities');
```

Expected: column exists, view exists, all three `relrowsecurity` are `t`.

- [ ] **Step 3: Smoke-test the view returns rows for a seeded contact**

```sql
-- via mcp__supabase__execute_sql against the branch
INSERT INTO forge.crm_accounts (company_id, name, domain)
VALUES ('170ebe36-d689-4f15-91f1-7474df6c98cd', 'Test Corp', 'testcorp.example')
RETURNING id;
-- save returned id as :acct

INSERT INTO forge.crm_contacts (company_id, account_id, email, first_name, last_name)
VALUES ('170ebe36-d689-4f15-91f1-7474df6c98cd', :acct, 'a@testcorp.example', 'Test', 'User')
RETURNING id;
-- save returned id as :contact

INSERT INTO forge.crm_activities (company_id, contact_id, kind, subject, body, actor_kind, actor_id)
VALUES ('170ebe36-d689-4f15-91f1-7474df6c98cd', :contact, 'note', 'Hi', 'Body', 'human', 'steve');

SELECT count(*) FROM forge.crm_activity_timeline WHERE contact_id = :contact;
-- expected: 1
```

If count is 1 and the row has `source='explicit'`, view works.

- [ ] **Step 4: Clean up branch test data + delete branch**

```sql
DELETE FROM forge.crm_activities  WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd';
DELETE FROM forge.crm_contacts    WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd';
DELETE FROM forge.crm_accounts    WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd';
```

Then `mcp__supabase__delete_branch` for the test branch.

(Production migration application is deferred to Phase 8 after PR review.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260508_forge_crm_v1_schema.sql
git commit -m "feat(forge): WO-2 — CRM v1 schema (3 tables + view + RLS)"
```

---

## Phase 2 — Types & client (TDD) (Days 2–3)

### Task 2.1: Define shared types

**Files:**
- Create: `dashboard/src/lib/crm/types.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/lib/crm/types.ts
git commit -m "feat(crm): types for Contact, Account, Activity, TimelineEntry"
```

### Task 2.2: CRM client skeleton

**Files:**
- Create: `dashboard/src/lib/crm/client.ts`

- [ ] **Step 1: Write skeleton with `not implemented` throws**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/lib/crm/client.ts
git commit -m "feat(crm): client.ts skeleton with typed signatures"
```

### Task 2.3: TDD `findContactByEmail`

**Files:**
- Create: `dashboard/src/lib/__tests__/crm-client.test.ts`
- Modify: `dashboard/src/lib/crm/client.ts`

- [ ] **Step 1: Write failing test**

```ts
// dashboard/src/lib/__tests__/crm-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { findContactByEmail } from '../crm/client';
import type { Contact } from '../crm/types';

function mockClient(opts: { single?: { data: unknown; error: unknown } } = {}) {
  const single = vi.fn().mockResolvedValue(opts.single ?? { data: null, error: null });
  const maybeSingle = vi.fn().mockResolvedValue(opts.single ?? { data: null, error: null });
  const chain = {} as {
    eq: ReturnType<typeof vi.fn>;
    single: typeof single;
    maybeSingle: typeof maybeSingle;
    limit: ReturnType<typeof vi.fn>;
  };
  chain.eq = vi.fn(() => chain);
  chain.single = single;
  chain.maybeSingle = maybeSingle;
  chain.limit = vi.fn(() => chain);
  const select = vi.fn().mockReturnValue(chain);
  const from = vi.fn().mockReturnValue({ select });
  return { from, _single: single, _eq: chain.eq, _select: select, _maybeSingle: maybeSingle } as never;
}

describe('findContactByEmail', () => {
  it('returns null when no row found', async () => {
    const client = mockClient({ single: { data: null, error: null } });
    const result = await findContactByEmail('co-1', 'nope@example.com', client);
    expect(result).toBeNull();
  });

  it('returns the contact when found', async () => {
    const fake: Partial<Contact> = { id: 'c-1', company_id: 'co-1', email: 'a@example.com' };
    const client = mockClient({ single: { data: fake, error: null } });
    const result = await findContactByEmail('co-1', 'a@example.com', client);
    expect(result).toMatchObject({ id: 'c-1', email: 'a@example.com' });
  });

  it('queries crm_contacts table filtered by company_id and email', async () => {
    const client = mockClient();
    await findContactByEmail('co-1', 'a@example.com', client);
    expect((client as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('crm_contacts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- crm-client`
Expected: FAIL with `not implemented` thrown.

- [ ] **Step 3: Implement**

Replace `findContactByEmail` body in `dashboard/src/lib/crm/client.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- crm-client`
Expected: 3 passing tests for `findContactByEmail`.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/crm/client.ts dashboard/src/lib/__tests__/crm-client.test.ts
git commit -m "feat(crm): findContactByEmail + tests"
```

### Task 2.4: TDD `createContact`

**Files:**
- Modify: `dashboard/src/lib/__tests__/crm-client.test.ts`
- Modify: `dashboard/src/lib/crm/client.ts`

- [ ] **Step 1: Add failing tests**

Append to `crm-client.test.ts`:

```ts
import { createContact } from '../crm/client';

function mockInsertClient(returnRow: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: returnRow, error });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { from, _insert: insert, _single: single } as never;
}

describe('createContact', () => {
  it('inserts into crm_contacts and returns the row', async () => {
    const fake = { id: 'c-2', company_id: 'co-1', email: 'b@example.com' };
    const client = mockInsertClient(fake);
    const result = await createContact(
      { company_id: 'co-1', email: 'b@example.com', first_name: 'B' },
      client,
    );
    expect(result).toMatchObject({ id: 'c-2', email: 'b@example.com' });
    expect((client as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('crm_contacts');
  });

  it('throws when supabase returns an error', async () => {
    const client = mockInsertClient(null, { message: 'unique violation', code: '23505' });
    await expect(
      createContact({ company_id: 'co-1', email: 'dup@example.com' }, client),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- crm-client`
Expected: 2 new failing tests for `createContact`.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- crm-client`
Expected: all `createContact` tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/crm/client.ts dashboard/src/lib/__tests__/crm-client.test.ts
git commit -m "feat(crm): createContact + tests"
```

### Task 2.5: TDD `updateContact`

**Files:**
- Modify: `dashboard/src/lib/__tests__/crm-client.test.ts`
- Modify: `dashboard/src/lib/crm/client.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { updateContact } from '../crm/client';

function mockUpdateClient(returnRow: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: returnRow, error });
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, _update: update, _eq: eq } as never;
}

describe('updateContact', () => {
  it('patches and returns updated row', async () => {
    const fake = { id: 'c-1', status: 'qualified' };
    const client = mockUpdateClient(fake);
    const result = await updateContact('c-1', { status: 'qualified' }, client);
    expect(result).toMatchObject({ id: 'c-1', status: 'qualified' });
  });

  it('throws on supabase error', async () => {
    const client = mockUpdateClient(null, { message: 'rls denied' });
    await expect(updateContact('c-1', { status: 'won' }, client)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- crm-client`
Expected: 2 new failing tests.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- crm-client`
Expected: all `updateContact` tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/crm/client.ts dashboard/src/lib/__tests__/crm-client.test.ts
git commit -m "feat(crm): updateContact + tests"
```

### Task 2.6: TDD `findOrCreateAccount`

**Files:**
- Modify: `dashboard/src/lib/__tests__/crm-client.test.ts`
- Modify: `dashboard/src/lib/crm/client.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { findOrCreateAccount } from '../crm/client';

describe('findOrCreateAccount', () => {
  it('returns existing account when domain matches', async () => {
    const fake = { id: 'a-1', company_id: 'co-1', name: 'Acme', domain: 'acme.com' };
    const findSingle = vi.fn().mockResolvedValue({ data: fake, error: null });
    const findEq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: findSingle }) });
    const select = vi.fn().mockReturnValue({ eq: findEq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as never;
    const result = await findOrCreateAccount('co-1', 'acme.com', 'Acme', client);
    expect(result).toMatchObject({ id: 'a-1', domain: 'acme.com' });
  });

  it('creates new account when no domain match', async () => {
    const created = { id: 'a-2', company_id: 'co-1', name: 'NewCo', domain: 'newco.com' };
    const findMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const findEq2 = vi.fn().mockReturnValue({ maybeSingle: findMaybeSingle });
    const findEq1 = vi.fn().mockReturnValue({ eq: findEq2 });
    const select = vi.fn().mockReturnValue({ eq: findEq1 });
    const insertSingle = vi.fn().mockResolvedValue({ data: created, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const from = vi.fn().mockReturnValue({ select, insert });
    const client = { from } as never;
    const result = await findOrCreateAccount('co-1', 'newco.com', 'NewCo', client);
    expect(result).toMatchObject({ id: 'a-2', domain: 'newco.com' });
    expect(insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- crm-client`
Expected: 2 new failing tests.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- crm-client`
Expected: all `findOrCreateAccount` tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/crm/client.ts dashboard/src/lib/__tests__/crm-client.test.ts
git commit -m "feat(crm): findOrCreateAccount + tests"
```

### Task 2.7: TDD `logActivity`

**Files:**
- Modify: `dashboard/src/lib/__tests__/crm-client.test.ts`
- Modify: `dashboard/src/lib/crm/client.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { logActivity } from '../crm/client';

describe('logActivity', () => {
  it('inserts and returns the activity', async () => {
    const fake = { id: 'act-1', kind: 'note', body: 'hi' };
    const single = vi.fn().mockResolvedValue({ data: fake, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const client = { from } as never;
    const result = await logActivity(
      { company_id: 'co-1', contact_id: 'c-1', kind: 'note', body: 'hi', actor_kind: 'human' },
      client,
    );
    expect(result).toMatchObject({ id: 'act-1', kind: 'note' });
  });

  it('throws when neither contact_id nor account_id is set', async () => {
    const client = { from: vi.fn() } as never;
    await expect(
      logActivity({ company_id: 'co-1', kind: 'note', actor_kind: 'human' }, client),
    ).rejects.toThrow(/contact_id or account_id/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- crm-client`
Expected: 2 new failing tests.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- crm-client`
Expected: all `logActivity` tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/crm/client.ts dashboard/src/lib/__tests__/crm-client.test.ts
git commit -m "feat(crm): logActivity + tests"
```

### Task 2.8: TDD `listActivitiesForContact` and `listActivitiesForAccount`

**Files:**
- Modify: `dashboard/src/lib/__tests__/crm-client.test.ts`
- Modify: `dashboard/src/lib/crm/client.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { listActivitiesForContact, listActivitiesForAccount } from '../crm/client';

describe('listActivitiesForContact', () => {
  it('queries crm_activity_timeline filtered by contact_id, ordered desc', async () => {
    const rows = [
      { id: 'e1', occurred_at: '2026-05-07T01:00:00Z', kind: 'note', source: 'explicit' },
      { id: 'e2', occurred_at: '2026-05-07T00:00:00Z', kind: 'comment', source: 'derived_issue_event' },
    ];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as never;
    const result = await listActivitiesForContact('c-1', 50, client);
    expect(result).toHaveLength(2);
    expect(from).toHaveBeenCalledWith('crm_activity_timeline');
    expect(eq).toHaveBeenCalledWith('contact_id', 'c-1');
  });
});

describe('listActivitiesForAccount', () => {
  it('queries crm_activity_timeline filtered by account_id', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as never;
    await listActivitiesForAccount('a-1', 50, client);
    expect(eq).toHaveBeenCalledWith('account_id', 'a-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- crm-client`
Expected: 2 new failing tests.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- crm-client`
Expected: all listActivitiesFor* tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/crm/client.ts dashboard/src/lib/__tests__/crm-client.test.ts
git commit -m "feat(crm): listActivitiesForContact / listActivitiesForAccount + tests"
```

### Task 2.9: TDD `searchCrm` (cross-portfolio search)

**Files:**
- Modify: `dashboard/src/lib/__tests__/crm-client.test.ts`
- Modify: `dashboard/src/lib/crm/client.ts`

- [ ] **Step 1: Add failing test**

```ts
import { searchCrm } from '../crm/client';

describe('searchCrm', () => {
  it('returns flat results from RPC across contacts + accounts', async () => {
    const rpcResult = {
      data: [
        { kind: 'contact', id: 'c-1', title: 'A B', detail: 'a@b.com', portfolio_co: 'MCM Forge' },
        { kind: 'account', id: 'a-1', title: 'Acme',  detail: 'acme.com', portfolio_co: 'GBN' },
      ],
      error: null,
    };
    const rpc = vi.fn().mockResolvedValue(rpcResult);
    const client = { rpc } as never;
    const result = await searchCrm('a', 50, client);
    expect(result).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith('crm_search', { q: 'a', max_results: 50 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- crm-client`
Expected: 1 new failing test.

- [ ] **Step 3: Add the search RPC to the migration**

We'll add the RPC function via a small migration addendum. Open `supabase/migrations/20260508_forge_crm_v1_schema.sql` and append before the final `COMMIT;`:

```sql
-- ─── Cross-portfolio search RPC ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION forge.crm_search(q TEXT, max_results INT DEFAULT 50)
RETURNS TABLE (
  kind         TEXT,
  id           UUID,
  title        TEXT,
  detail       TEXT,
  portfolio_co TEXT
)
LANGUAGE sql STABLE
AS $$
  SELECT 'contact'::TEXT,
         c.id,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), c.email),
         c.email,
         co.name
  FROM forge.crm_contacts c
  JOIN forge.companies co ON co.id = c.company_id
  WHERE c.email      ILIKE '%' || q || '%'
     OR c.first_name ILIKE '%' || q || '%'
     OR c.last_name  ILIKE '%' || q || '%'

  UNION ALL

  SELECT 'account'::TEXT,
         a.id,
         a.name,
         a.domain,
         co.name
  FROM forge.crm_accounts a
  JOIN forge.companies co ON co.id = a.company_id
  WHERE a.name   ILIKE '%' || q || '%'
     OR a.domain ILIKE '%' || q || '%'
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION forge.crm_search(TEXT, INT) TO authenticated;
```

Re-apply to a fresh Supabase branch (drop and recreate):
```
mcp__supabase__delete_branch  (the previous test branch if still around)
mcp__supabase__create_branch  wo-2-crm-test-2
mcp__supabase__apply_migration  (the now-updated file)
```

Verify with:
```sql
SELECT * FROM forge.crm_search('test', 10);  -- should return 0 rows on an empty branch, no error
```

- [ ] **Step 4: Implement client function**

```ts
export async function searchCrm(
  q: string,
  limit: number = 50,
  client?: SupabaseLike,
): Promise<Array<{ kind: 'contact' | 'account'; id: string; title: string; detail: string | null; portfolio_co: string }>> {
  const supabase = client ?? await createForgeClient();
  const { data, error } = await supabase.rpc('crm_search', { q, max_results: limit });
  if (error) throw error;
  return (data ?? []) as Array<{ kind: 'contact' | 'account'; id: string; title: string; detail: string | null; portfolio_co: string }>;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd dashboard && npm test -- crm-client`
Expected: searchCrm test passes; whole crm-client suite green.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/crm/client.ts dashboard/src/lib/__tests__/crm-client.test.ts supabase/migrations/20260508_forge_crm_v1_schema.sql
git commit -m "feat(crm): searchCrm + crm_search RPC + tests"
```

---

## Phase 3 — Custom fields (Day 3)

### Task 3.1: Custom-fields schema lookup

**Files:**
- Create: `dashboard/src/lib/crm/custom-fields/index.ts`
- Create: `dashboard/src/lib/crm/custom-fields/{links-choice,gbn,hgb,mcm-forge,dirtsync}.ts`
- Create: `dashboard/src/lib/__tests__/crm-custom-fields.test.ts`

- [ ] **Step 1: Write five stub schema files**

`dashboard/src/lib/crm/custom-fields/links-choice.ts`:
```ts
import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  {
    entity: 'contact',
    key: 'preferred_contact_method',
    label: 'Preferred contact method',
    type: 'select',
    options: ['email', 'phone', 'text'],
    required: false,
  },
];
```

`dashboard/src/lib/crm/custom-fields/gbn.ts`:
```ts
import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  { entity: 'account', key: 'reseller_status', label: 'Reseller status', type: 'text', required: false },
];
```

`dashboard/src/lib/crm/custom-fields/hgb.ts`:
```ts
import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'product_interest', label: 'Product interest', type: 'text', required: false },
];
```

`dashboard/src/lib/crm/custom-fields/mcm-forge.ts`:
```ts
import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'lead_source', label: 'Lead source', type: 'text', required: false },
];
```

`dashboard/src/lib/crm/custom-fields/dirtsync.ts`:
```ts
import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'rider_type', label: 'Rider type', type: 'text', required: false },
];
```

- [ ] **Step 2: Write `index.ts`**

```ts
import { customFields as linksChoice } from './links-choice';
import { customFields as gbn } from './gbn';
import { customFields as hgb } from './hgb';
import { customFields as mcmForge } from './mcm-forge';
import { customFields as dirtsync } from './dirtsync';

export type CustomFieldType = 'text' | 'number' | 'select' | 'date' | 'boolean';

export interface CustomFieldSchema {
  entity: 'contact' | 'account';
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
}

const REGISTRY: Record<string, CustomFieldSchema[]> = {
  'links-choice': linksChoice,
  'gbn':          gbn,
  'hgb':          hgb,
  'mcm-forge':    mcmForge,
  'dirtsync':     dirtsync,
};

export function getCustomFieldsFor(
  portfolioSlug: string,
  entity: 'contact' | 'account',
): CustomFieldSchema[] {
  const all = REGISTRY[portfolioSlug] ?? [];
  return all.filter(f => f.entity === entity);
}

export function listAllCustomFields(portfolioSlug: string): CustomFieldSchema[] {
  return REGISTRY[portfolioSlug] ?? [];
}
```

- [ ] **Step 3: Write failing tests**

`dashboard/src/lib/__tests__/crm-custom-fields.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getCustomFieldsFor, listAllCustomFields } from '../crm/custom-fields';

describe('getCustomFieldsFor', () => {
  it('returns contact fields for links-choice', () => {
    const fields = getCustomFieldsFor('links-choice', 'contact');
    expect(fields.some(f => f.key === 'preferred_contact_method')).toBe(true);
  });

  it('filters out account fields when asked for contact', () => {
    const fields = getCustomFieldsFor('gbn', 'contact');
    expect(fields.every(f => f.entity === 'contact')).toBe(true);
  });

  it('returns [] for unknown portfolio slug', () => {
    expect(getCustomFieldsFor('unknown', 'contact')).toEqual([]);
  });
});

describe('listAllCustomFields', () => {
  it('returns all five portfolios with at least one field each', () => {
    for (const slug of ['links-choice', 'gbn', 'hgb', 'mcm-forge', 'dirtsync']) {
      expect(listAllCustomFields(slug).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd dashboard && npm test -- crm-custom-fields`
Expected: all tests pass on first run (the fields are static data, code is straightforward).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/crm/custom-fields dashboard/src/lib/__tests__/crm-custom-fields.test.ts
git commit -m "feat(crm): custom-field schema registry per portfolio co + tests"
```

### Task 3.2: `CustomFieldForm.tsx` component

**Files:**
- Create: `dashboard/src/components/crm/CustomFieldForm.tsx`
- Create: `dashboard/src/components/crm/__tests__/CustomFieldForm.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomFieldForm } from '../CustomFieldForm';
import type { CustomFieldSchema } from '@/lib/crm/custom-fields';

const fields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'lead_source', label: 'Lead source', type: 'text' },
  { entity: 'contact', key: 'preferred_contact_method', label: 'Preferred', type: 'select', options: ['email', 'phone'] },
];

describe('CustomFieldForm', () => {
  it('renders one input per field', () => {
    render(<CustomFieldForm fields={fields} values={{ lead_source: 'web' }} />);
    expect(screen.getByLabelText('Lead source')).toHaveValue('web');
  });

  it('renders select with options', () => {
    render(<CustomFieldForm fields={fields} values={{}} />);
    const sel = screen.getByLabelText('Preferred');
    expect(sel.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'email' })).toBeInTheDocument();
  });

  it('renders nothing when fields is empty', () => {
    const { container } = render(<CustomFieldForm fields={[]} values={{}} />);
    expect(container.querySelector('input,select')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- CustomFieldForm`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
'use client';

import type { CustomFieldSchema } from '@/lib/crm/custom-fields';

interface Props {
  fields: CustomFieldSchema[];
  values: Record<string, unknown>;
  onChange?: (key: string, value: string) => void;
  namePrefix?: string;
}

export function CustomFieldForm({ fields, values, onChange, namePrefix = 'custom_fields' }: Props) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const inputId = `cf-${f.key}`;
        const value = (values[f.key] ?? '') as string;
        const inputName = `${namePrefix}.${f.key}`;
        if (f.type === 'select') {
          return (
            <div key={f.key}>
              <label htmlFor={inputId} className="block text-sm text-[#8b949e] mb-1">{f.label}</label>
              <select
                id={inputId}
                name={inputName}
                value={value}
                onChange={(e) => onChange?.(f.key, e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
                required={f.required}
              >
                <option value="">—</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <div key={f.key}>
            <label htmlFor={inputId} className="block text-sm text-[#8b949e] mb-1">{f.label}</label>
            <input
              id={inputId}
              name={inputName}
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={value}
              onChange={(e) => onChange?.(f.key, e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
              required={f.required}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- CustomFieldForm`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/crm/CustomFieldForm.tsx dashboard/src/components/crm/__tests__/CustomFieldForm.test.tsx
git commit -m "feat(crm): CustomFieldForm component + tests"
```

---

## Phase 4 — Components (Day 4)

### Task 4.1: `ContactCard.tsx`

**Files:**
- Create: `dashboard/src/components/crm/ContactCard.tsx`

- [ ] **Step 1: Implement**

```tsx
import Link from 'next/link';
import type { Contact } from '@/lib/crm/types';

const STATUS_COLORS: Record<string, string> = {
  lead:       'bg-[#1f3358] text-[#58a6ff]',
  qualified:  'bg-[#3a2f00] text-[#d29922]',
  won:        'bg-[#0f2d1f] text-[#3fb950]',
  lost:       'bg-[#3d1f1f] text-[#f85149]',
  archived:   'bg-[#30363d] text-[#8b949e]',
};

export function ContactCard({ contact }: { contact: Contact }) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || '(no name)';
  return (
    <Link
      href={`/crm/contacts/${contact.id}`}
      className="block border border-[#30363d] rounded p-3 hover:border-[#58a6ff] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">{name}</div>
          {contact.email && <div className="text-xs text-[#8b949e]">{contact.email}</div>}
          {contact.title && <div className="text-xs text-[#8b949e]">{contact.title}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[contact.status] ?? STATUS_COLORS.lead}`}>
          {contact.status}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/crm/ContactCard.tsx
git commit -m "feat(crm): ContactCard component"
```

### Task 4.2: `AccountCard.tsx`

**Files:**
- Create: `dashboard/src/components/crm/AccountCard.tsx`

- [ ] **Step 1: Implement**

```tsx
import Link from 'next/link';
import type { Account } from '@/lib/crm/types';

const TYPE_COLORS: Record<string, string> = {
  supplier: 'bg-[#1f3358] text-[#58a6ff]',
  customer: 'bg-[#0f2d1f] text-[#3fb950]',
  partner:  'bg-[#2b1f5c] text-[#a371f7]',
  other:    'bg-[#30363d] text-[#8b949e]',
};

export function AccountCard({ account }: { account: Account }) {
  return (
    <Link
      href={`/crm/accounts/${account.id}`}
      className="block border border-[#30363d] rounded p-3 hover:border-[#58a6ff] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">{account.name}</div>
          {account.domain && <div className="text-xs text-[#8b949e]">{account.domain}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLORS[account.account_type] ?? TYPE_COLORS.other}`}>
          {account.account_type}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/crm/AccountCard.tsx
git commit -m "feat(crm): AccountCard component"
```

### Task 4.3: `ActivityTimeline.tsx`

**Files:**
- Create: `dashboard/src/components/crm/ActivityTimeline.tsx`
- Create: `dashboard/src/components/crm/__tests__/ActivityTimeline.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityTimeline } from '../ActivityTimeline';
import type { TimelineEntry } from '@/lib/crm/types';

const entries: TimelineEntry[] = [
  {
    id: '1', company_id: 'co-1', contact_id: 'c-1', account_id: null, issue_id: null,
    kind: 'note', subject: 'Hi', body: 'Talked to Pam',
    actor_kind: 'human', actor_id: 'steve',
    occurred_at: '2026-05-07T01:00:00Z', source: 'explicit',
  },
  {
    id: '2', company_id: 'co-1', contact_id: 'c-1', account_id: null,
    issue_id: 'iss-1',
    kind: 'comment', subject: 'Issue title',
    body: 'agent posted',
    actor_kind: 'agent', actor_id: 'sonnet',
    occurred_at: '2026-05-07T00:00:00Z', source: 'derived_issue_event',
  },
];

describe('ActivityTimeline', () => {
  it('renders one row per entry', () => {
    render(<ActivityTimeline entries={entries} />);
    expect(screen.getByText('Hi')).toBeInTheDocument();
    expect(screen.getByText('Issue title')).toBeInTheDocument();
  });

  it('shows source badge for derived events', () => {
    render(<ActivityTimeline entries={entries} />);
    expect(screen.getByText(/from issue/i)).toBeInTheDocument();
  });

  it('shows empty state when entries is empty', () => {
    render(<ActivityTimeline entries={[]} />);
    expect(screen.getByText(/no activity/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- ActivityTimeline`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import Link from 'next/link';
import type { TimelineEntry } from '@/lib/crm/types';

const KIND_ICONS: Record<string, string> = {
  call:           '📞',
  email_sent:     '✉️ →',
  email_received: '✉️ ←',
  note:           '📝',
  meeting:        '🤝',
};

export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-sm text-[#8b949e] p-4 text-center">No activity yet.</div>;
  }
  return (
    <ul className="divide-y divide-[#21262d]">
      {entries.map((e) => {
        const icon = KIND_ICONS[e.kind] ?? '•';
        const when = new Date(e.occurred_at).toLocaleString();
        return (
          <li key={e.id} className="py-3 flex gap-3">
            <span className="text-xl shrink-0" aria-hidden>{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                <span className={`px-1.5 py-0.5 rounded ${e.actor_kind === 'agent' ? 'bg-[#2b1f5c] text-[#a371f7]' : 'bg-[#30363d] text-[#c9d1d9]'}`}>
                  {e.actor_kind}{e.actor_id ? ` · ${e.actor_id}` : ''}
                </span>
                <span>{when}</span>
                {e.source === 'derived_issue_event' && e.issue_id && (
                  <Link href={`/issues/${e.issue_id}`} className="text-[#58a6ff] hover:underline">
                    from issue
                  </Link>
                )}
              </div>
              {e.subject && <div className="text-sm text-white mt-0.5">{e.subject}</div>}
              {e.body && <div className="text-sm text-[#c9d1d9] mt-0.5 line-clamp-3">{e.body}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- ActivityTimeline`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/crm/ActivityTimeline.tsx dashboard/src/components/crm/__tests__/ActivityTimeline.test.tsx
git commit -m "feat(crm): ActivityTimeline component + tests"
```

---

## Phase 5 — Pages (Days 5–7)

### Task 5.1: Sidebar nav link

**Files:**
- Modify: `dashboard/src/components/Sidebar.tsx`

- [ ] **Step 1: Read the existing nav block**

Use Read tool on `dashboard/src/components/Sidebar.tsx` to find the section around lines 422–460 where `/inbox` and `/issues` nav items live. The nav items follow a consistent JSX pattern — `<Link href="/issues" isActive={isActive("/issues")} ...>`.

- [ ] **Step 2: Insert a `/crm` link immediately after the `/issues` block**

Add this JSX directly after the existing `/issues` `<Link>` (use the same indentation and component pattern visible in the file — e.g. if there's a `NavItem` wrapper, use it; otherwise mirror the surrounding `<Link>` shape):

```tsx
<Link
  href="/crm"
  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${isActive('/crm') ? 'bg-[#21262d] text-white' : 'text-[#8b949e] hover:bg-[#21262d]'}`}
>
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
  CRM
</Link>
```

If the file uses a `NavItem` component instead, use that wrapper to stay consistent. The visual outcome is one new sidebar entry labelled "CRM" between Issues and the next item.

- [ ] **Step 3: Smoke check**

Run: `cd dashboard && npm run dev` (background), then visit `http://localhost:3000`. Verify "CRM" link is visible in the sidebar; clicking it routes to `/crm` (which won't exist yet — expect Next.js 404 placeholder, fine for now). Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/Sidebar.tsx
git commit -m "feat(crm): add CRM link to sidebar nav"
```

### Task 5.2: `/crm` landing page

**Files:**
- Create: `dashboard/src/app/crm/page.tsx`
- Create: `dashboard/src/app/crm/CrmLandingClient.tsx`

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { getActiveCompany } from '@/lib/get-active-company';
import { CrmLandingClient } from './CrmLandingClient';

export const revalidate = 0;

export default async function CrmLandingPage() {
  const company = await getActiveCompany();
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">CRM</h1>
      <p className="text-sm text-[#8b949e] mb-6">
        Contacts, accounts, and activity for <span className="text-white">{company?.name ?? 'this company'}</span>.
      </p>
      <CrmLandingClient />
    </div>
  );
}
```

- [ ] **Step 2: Write `CrmLandingClient.tsx`**

```tsx
'use client';

import Link from 'next/link';

const TABS: Array<{ label: string; href: string; description: string }> = [
  { label: 'Contacts',   href: '/crm/contacts',   description: 'People you talk to.' },
  { label: 'Accounts',   href: '/crm/accounts',   description: 'Companies (suppliers, customers, partners).' },
  { label: 'Activities', href: '/crm/activities', description: 'Timeline of calls, notes, emails.' },
  { label: 'Search',     href: '/crm/search',     description: 'Find anything across all 5 portfolio cos.' },
];

export function CrmLandingClient() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="block border border-[#30363d] rounded p-4 hover:border-[#58a6ff] transition-colors"
        >
          <div className="text-base font-semibold text-white">{t.label}</div>
          <div className="text-xs text-[#8b949e] mt-1">{t.description}</div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Smoke**

Run: `cd dashboard && npm run dev` (background), visit `http://localhost:3000/crm` (logged in). Confirm 200 + four cards render. Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/app/crm/page.tsx dashboard/src/app/crm/CrmLandingClient.tsx
git commit -m "feat(crm): /crm landing with four tabs"
```

### Task 5.3: `/crm/contacts` list

**Files:**
- Create: `dashboard/src/app/crm/contacts/page.tsx`
- Create: `dashboard/src/app/crm/contacts/ContactsClient.tsx`

- [ ] **Step 1: Write `page.tsx`**

```tsx
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
        <a
          href="/crm/contacts/new"
          className="px-3 py-1.5 bg-[#238636] text-white rounded text-sm hover:bg-[#2ea043]"
        >
          + New contact
        </a>
      </div>
      <ContactsClient initialContacts={contacts} />
    </div>
  );
}
```

- [ ] **Step 2: Write `ContactsClient.tsx`**

```tsx
'use client';

import { useState, useMemo } from 'react';
import { ContactCard } from '@/components/crm/ContactCard';
import type { Contact, ContactStatus } from '@/lib/crm/types';

const STATUS_FILTERS: Array<ContactStatus | 'all'> = ['all', 'lead', 'qualified', 'won', 'lost', 'archived'];

export function ContactsClient({ initialContacts }: { initialContacts: Contact[] }) {
  const [filter, setFilter] = useState<ContactStatus | 'all'>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return initialContacts.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (q) {
        const hay = `${c.first_name ?? ''} ${c.last_name ?? ''} ${c.email ?? ''} ${c.title ?? ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [initialContacts, filter, q]);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search name/email/title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ContactStatus | 'all')}
          className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
        >
          {STATUS_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="text-sm text-[#8b949e] p-8 text-center border border-dashed border-[#30363d] rounded">
          No contacts match. Add one or change filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => <ContactCard key={c.id} contact={c} />)}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Smoke**

Insert a test contact via `mcp__supabase__execute_sql` against production (NOT prod yet — branch DB if not migrated). Or skip live data and just verify the page renders empty.

```sql
-- For local smoke against prod ONLY if migration is applied (it's not yet — Phase 8).
-- Otherwise, the page should render but show "No contacts match" cleanly.
```

Run dev server, visit `/crm/contacts`, confirm 200 + filters render + empty state shows.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/app/crm/contacts/page.tsx dashboard/src/app/crm/contacts/ContactsClient.tsx
git commit -m "feat(crm): /crm/contacts list with filter + search"
```

### Task 5.4: `/crm/contacts/new` form

**Files:**
- Create: `dashboard/src/app/crm/contacts/new/page.tsx`
- Create: `dashboard/src/app/crm/contacts/new/NewContactForm.tsx`
- Create: `dashboard/src/app/crm/contacts/new/actions.ts`

- [ ] **Step 1: Write server action**

`dashboard/src/app/crm/contacts/new/actions.ts`:
```ts
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
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
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
```

- [ ] **Step 3: Write `NewContactForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { CustomFieldForm } from '@/components/crm/CustomFieldForm';
import type { Account } from '@/lib/crm/types';
import type { CustomFieldSchema } from '@/lib/crm/custom-fields';
import { createContactAction } from './actions';

interface Props {
  accounts: Account[];
  customFields: CustomFieldSchema[];
}

export function NewContactForm({ accounts, customFields }: Props) {
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  return (
    <form action={createContactAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input name="first_name" label="First name" />
        <Input name="last_name"  label="Last name" />
      </div>
      <Input name="email" label="Email" type="email" />
      <Input name="phone" label="Phone" />
      <Input name="title" label="Title" />
      <div>
        <label htmlFor="status" className="block text-sm text-[#8b949e] mb-1">Status</label>
        <select id="status" name="status" defaultValue="lead" className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm">
          {['lead','qualified','won','lost','archived'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="account_id" className="block text-sm text-[#8b949e] mb-1">Account</label>
        <select id="account_id" name="account_id" className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm">
          <option value="">— No account —</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.domain ? ` (${a.domain})` : ''}</option>)}
        </select>
      </div>
      <CustomFieldForm
        fields={customFields}
        values={customValues}
        onChange={(k, v) => setCustomValues((prev) => ({ ...prev, [k]: v }))}
      />
      <button type="submit" className="px-4 py-2 bg-[#238636] text-white rounded hover:bg-[#2ea043]">
        Create contact
      </button>
    </form>
  );
}

function Input({ name, label, type = 'text' }: { name: string; label: string; type?: string }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm text-[#8b949e] mb-1">{label}</label>
      <input id={name} name={name} type={type} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm" />
    </div>
  );
}
```

- [ ] **Step 4: Smoke**

Visit `/crm/contacts/new`. Verify form renders + custom fields show for the active portfolio. (Submit will fail in prod until migration applied; test full submit in Phase 7.)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/app/crm/contacts/new
git commit -m "feat(crm): /crm/contacts/new form + server action"
```

### Task 5.5: `/crm/contacts/[id]` detail (no agent panel yet)

**Files:**
- Create: `dashboard/src/app/crm/contacts/[id]/page.tsx`
- Create: `dashboard/src/app/crm/contacts/[id]/ContactDetailClient.tsx`
- Create: `dashboard/src/app/crm/contacts/[id]/actions.ts`

- [ ] **Step 1: Write server action**

`dashboard/src/app/crm/contacts/[id]/actions.ts`:
```ts
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
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
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
```

- [ ] **Step 3: Write `ContactDetailClient.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ActivityTimeline } from '@/components/crm/ActivityTimeline';
import { CustomFieldForm } from '@/components/crm/CustomFieldForm';
import type { Contact, Account, TimelineEntry, ContactStatus } from '@/lib/crm/types';
import type { CustomFieldSchema } from '@/lib/crm/custom-fields';
import { logActivityAction, updateContactStatusAction } from './actions';
import { AgentEyePanel } from './AgentEyePanel';

interface Props {
  contact: Contact;
  account: Account | null;
  timeline: TimelineEntry[];
  customFields: CustomFieldSchema[];
  openIssues: Array<{ id: string; identifier: string | null; title: string; status: string }>;
}

export function ContactDetailClient({ contact, account, timeline, customFields, openIssues }: Props) {
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [, startTransition] = useTransition();
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || '(no name)';

  return (
    <div className="flex">
      <div className="flex-1 p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/crm/contacts" className="text-sm text-[#58a6ff] hover:underline">← Contacts</Link>
        </div>
        <h1 className="text-2xl font-bold text-white">{name}</h1>
        <div className="text-sm text-[#8b949e] mb-4">
          {contact.email && <>{contact.email}</>}
          {contact.title && <> · {contact.title}</>}
          {account && (
            <> · <Link href={`/crm/accounts/${account.id}`} className="text-[#58a6ff] hover:underline">{account.name}</Link></>
          )}
        </div>

        <div className="flex items-center gap-2 mb-6">
          <select
            value={contact.status}
            onChange={(e) => startTransition(() => updateContactStatusAction(contact.id, e.target.value))}
            className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-sm"
          >
            {(['lead','qualified','won','lost','archived'] as ContactStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setAgentPanelOpen(v => !v)}
            className="px-3 py-1.5 border border-[#30363d] rounded text-sm hover:bg-[#21262d]"
          >
            {agentPanelOpen ? '← Hide agent view' : 'Agent’s view →'}
          </button>
        </div>

        {openIssues.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-white mb-2">Open issues</h2>
            <ul className="space-y-1">
              {openIssues.map((iss) => (
                <li key={iss.id}>
                  <Link href={`/issues/${iss.identifier ?? iss.id}`} className="text-sm text-[#58a6ff] hover:underline">
                    {iss.identifier ? `${iss.identifier} — ` : ''}{iss.title}
                  </Link>
                  <span className="text-xs text-[#8b949e] ml-2">[{iss.status}]</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {customFields.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-white mb-2">Custom fields</h2>
            <CustomFieldForm fields={customFields} values={contact.custom_fields ?? {}} />
          </section>
        )}

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-2">Log activity</h2>
          <form
            action={(fd) => logActivityAction(contact.id, fd)}
            className="space-y-2 border border-[#30363d] rounded p-3"
          >
            <select name="kind" defaultValue="note" className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm">
              {['note','call','email_sent','email_received','meeting'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input name="subject" placeholder="Subject" className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm" />
            <textarea name="body" placeholder="What happened?" rows={3} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-sm" />
            <button type="submit" className="px-3 py-1 bg-[#238636] text-white rounded text-sm hover:bg-[#2ea043]">Log it</button>
          </form>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white mb-2">Activity timeline</h2>
          <ActivityTimeline entries={timeline} />
        </section>
      </div>

      {agentPanelOpen && <AgentEyePanel contact={contact} timeline={timeline} />}
    </div>
  );
}
```

- [ ] **Step 4: Stub `AgentEyePanel.tsx` so the import resolves (real impl is Task 6.x)**

`dashboard/src/app/crm/contacts/[id]/AgentEyePanel.tsx`:
```tsx
'use client';

import type { Contact, TimelineEntry } from '@/lib/crm/types';

export function AgentEyePanel({ contact, timeline }: { contact: Contact; timeline: TimelineEntry[] }) {
  return (
    <aside className="w-80 shrink-0 p-4 border-l border-[#30363d] min-h-screen bg-[#0d1117]">
      <h2 className="text-sm font-semibold text-white mb-2">Agent&rsquo;s view</h2>
      <div className="text-xs text-[#8b949e]">
        Last 5 activities, status, custom fields, preview-draft button — wired in next task.
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {timeline.slice(0, 5).map((e) => (
          <li key={e.id} className="text-[#c9d1d9]">
            {new Date(e.occurred_at).toLocaleDateString()} — <span className="text-[#8b949e]">{e.kind}</span>
            {e.subject && <> · {e.subject}</>}
          </li>
        ))}
      </ul>
      <div className="mt-4 text-xs text-[#8b949e]">Status: <span className="text-white">{contact.status}</span></div>
    </aside>
  );
}
```

- [ ] **Step 5: Smoke**

Apply the migration to a Supabase branch DB (if not already), insert a test contact + activity, visit `/crm/contacts/<id>`. Verify 200, timeline renders, status dropdown works, log-activity form posts and revalidates the timeline.

- [ ] **Step 6: Commit**

```bash
git add "dashboard/src/app/crm/contacts/[id]/"
git commit -m "feat(crm): /crm/contacts/[id] detail with timeline + log-activity form"
```

### Task 5.6: `/crm/accounts` list

**Files:**
- Create: `dashboard/src/app/crm/accounts/page.tsx`
- Create: `dashboard/src/app/crm/accounts/AccountsClient.tsx`

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { createForgeClient } from '@/lib/supabase/forge-server';
import { getActiveCompany } from '@/lib/get-active-company';
import { AccountsClient } from './AccountsClient';
import type { Account } from '@/lib/crm/types';

export const revalidate = 0;

async function getAccounts(companyId: string): Promise<Account[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from('crm_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(200);
  return (data ?? []) as Account[];
}

export default async function AccountsListPage() {
  const company = await getActiveCompany();
  const accounts = company ? await getAccounts(company.id) : [];
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Accounts</h1>
        <a href="/crm/accounts/new" className="px-3 py-1.5 bg-[#238636] text-white rounded text-sm hover:bg-[#2ea043]">+ New account</a>
      </div>
      <AccountsClient initialAccounts={accounts} />
    </div>
  );
}
```

- [ ] **Step 2: Write `AccountsClient.tsx`**

```tsx
'use client';

import { useState, useMemo } from 'react';
import { AccountCard } from '@/components/crm/AccountCard';
import type { Account, AccountType } from '@/lib/crm/types';

const TYPE_FILTERS: Array<AccountType | 'all'> = ['all', 'supplier', 'customer', 'partner', 'other'];

export function AccountsClient({ initialAccounts }: { initialAccounts: Account[] }) {
  const [filter, setFilter] = useState<AccountType | 'all'>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return initialAccounts.filter((a) => {
      if (filter !== 'all' && a.account_type !== filter) return false;
      if (q) {
        const hay = `${a.name} ${a.domain ?? ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [initialAccounts, filter, q]);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <input type="search" placeholder="Search name or domain…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as AccountType | 'all')} className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm">
          {TYPE_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="text-sm text-[#8b949e] p-8 text-center border border-dashed border-[#30363d] rounded">
          No accounts match.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => <AccountCard key={a.id} account={a} />)}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Smoke**

Visit `/crm/accounts`. Confirm 200 and empty state.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/app/crm/accounts/page.tsx dashboard/src/app/crm/accounts/AccountsClient.tsx
git commit -m "feat(crm): /crm/accounts list"
```

### Task 5.7: `/crm/accounts/new` form

**Files:**
- Create: `dashboard/src/app/crm/accounts/new/page.tsx`
- Create: `dashboard/src/app/crm/accounts/new/NewAccountForm.tsx`
- Create: `dashboard/src/app/crm/accounts/new/actions.ts`

- [ ] **Step 1: Write server action**

```ts
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
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
import { NewAccountForm } from './NewAccountForm';

export default function NewAccountPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-4">New account</h1>
      <NewAccountForm />
    </div>
  );
}
```

- [ ] **Step 3: Write `NewAccountForm.tsx`**

```tsx
'use client';

import { createAccountAction } from './actions';

export function NewAccountForm() {
  return (
    <form action={createAccountAction} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm text-[#8b949e] mb-1">Name</label>
        <input id="name" name="name" required className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="domain" className="block text-sm text-[#8b949e] mb-1">Domain</label>
        <input id="domain" name="domain" placeholder="acme.com" className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm" />
      </div>
      <button type="submit" className="px-4 py-2 bg-[#238636] text-white rounded">Create account</button>
    </form>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/app/crm/accounts/new
git commit -m "feat(crm): /crm/accounts/new form"
```

### Task 5.8: `/crm/accounts/[id]` detail

**Files:**
- Create: `dashboard/src/app/crm/accounts/[id]/page.tsx`
- Create: `dashboard/src/app/crm/accounts/[id]/AccountDetailClient.tsx`

- [ ] **Step 1: Write `page.tsx`**

```tsx
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
```

- [ ] **Step 2: Write `AccountDetailClient.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { ActivityTimeline } from '@/components/crm/ActivityTimeline';
import { ContactCard } from '@/components/crm/ContactCard';
import type { Account, Contact, TimelineEntry } from '@/lib/crm/types';

interface Props {
  account: Account;
  contacts: Contact[];
  timeline: TimelineEntry[];
}

export function AccountDetailClient({ account, contacts, timeline }: Props) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/crm/accounts" className="text-sm text-[#58a6ff] hover:underline">← Accounts</Link>
      <h1 className="text-2xl font-bold text-white mt-1">{account.name}</h1>
      <div className="text-sm text-[#8b949e] mb-6">
        {account.domain && <>{account.domain} · </>}
        {account.account_type} · {account.status}
      </div>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-white mb-2">Contacts ({contacts.length})</h2>
        {contacts.length === 0 ? (
          <div className="text-sm text-[#8b949e]">No contacts yet.</div>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => <ContactCard key={c.id} contact={c} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white mb-2">Account timeline</h2>
        <ActivityTimeline entries={timeline} />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "dashboard/src/app/crm/accounts/[id]/"
git commit -m "feat(crm): /crm/accounts/[id] detail with rolled-up contacts + timeline"
```

### Task 5.9: `/crm/activities` list

**Files:**
- Create: `dashboard/src/app/crm/activities/page.tsx`

- [ ] **Step 1: Write page**

```tsx
import { createForgeClient } from '@/lib/supabase/forge-server';
import { getActiveCompany } from '@/lib/get-active-company';
import { ActivityTimeline } from '@/components/crm/ActivityTimeline';
import type { TimelineEntry } from '@/lib/crm/types';

export const revalidate = 0;

async function getRecent(companyId: string): Promise<TimelineEntry[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from('crm_activity_timeline')
    .select('*')
    .eq('company_id', companyId)
    .order('occurred_at', { ascending: false })
    .limit(200);
  return (data ?? []) as TimelineEntry[];
}

export default async function ActivitiesPage() {
  const company = await getActiveCompany();
  const items = company ? await getRecent(company.id) : [];
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Activities</h1>
      <p className="text-sm text-[#8b949e] mb-4">Most-recent {items.length} entries.</p>
      <ActivityTimeline entries={items} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/crm/activities/page.tsx
git commit -m "feat(crm): /crm/activities recent timeline"
```

### Task 5.10: `/crm/search` global cross-portfolio

**Files:**
- Create: `dashboard/src/app/crm/search/page.tsx`
- Create: `dashboard/src/app/crm/search/SearchClient.tsx`

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { searchCrm } from '@/lib/crm/client';
import { SearchClient } from './SearchClient';

export const revalidate = 0;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const results = q ? await searchCrm(q, 50) : [];
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Cross-portfolio search</h1>
      <p className="text-sm text-[#8b949e] mb-4">Searches contacts + accounts across all 5 portfolio cos.</p>
      <SearchClient initialQuery={q ?? ''} initialResults={results} />
    </div>
  );
}
```

- [ ] **Step 2: Write `SearchClient.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Row {
  kind: 'contact' | 'account';
  id: string;
  title: string;
  detail: string | null;
  portfolio_co: string;
}

export function SearchClient({ initialQuery, initialResults }: { initialQuery: string; initialResults: Row[] }) {
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/crm/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <>
      <form onSubmit={submit} className="mb-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="email, name, domain…"
          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
          autoFocus
        />
      </form>
      {initialResults.length === 0 && initialQuery ? (
        <div className="text-sm text-[#8b949e]">No matches.</div>
      ) : (
        <ul className="divide-y divide-[#21262d]">
          {initialResults.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="py-2">
              <Link href={r.kind === 'contact' ? `/crm/contacts/${r.id}` : `/crm/accounts/${r.id}`} className="text-[#58a6ff] hover:underline">
                {r.title}
              </Link>
              <div className="text-xs text-[#8b949e]">
                <span className="px-1.5 py-0.5 mr-2 bg-[#21262d] rounded">{r.kind}</span>
                <span className="px-1.5 py-0.5 mr-2 bg-[#1f3358] text-[#58a6ff] rounded">{r.portfolio_co}</span>
                {r.detail && <span>{r.detail}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/app/crm/search
git commit -m "feat(crm): /crm/search cross-portfolio (RPC-backed)"
```

---

## Phase 6 — Agent's-eye preview-draft (Days 7–8)

### Task 6.1: Prompt template + run-queue helper

**Files:**
- Create: `dashboard/src/lib/crm/agent-preview.ts`
- Create: `dashboard/src/lib/crm/service-client.ts`

- [ ] **Step 1: Write service-role client**

```ts
// dashboard/src/lib/crm/service-client.ts
// Server-only. Used by /api/crm/preview-draft to enqueue runs without RLS.
import { createClient } from '@supabase/supabase-js';

export function createForgeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Service-role client env vars missing');
  return createClient(url, key, { db: { schema: 'forge' } });
}
```

- [ ] **Step 2: Write the agent-preview helper**

```ts
// dashboard/src/lib/crm/agent-preview.ts
// Builds a preview-draft prompt from a contact's history and queues a forge.runs row.
// The Mini orchestrator picks 'queued' rows up; we don't invoke claude here.

import { createForgeServiceClient } from './service-client';
import type { Contact, TimelineEntry } from './types';

const RATE_LIMIT_MS = 30_000; // 1 call per 30s per contact

const recentCalls = new Map<string, number>(); // contactId -> last timestamp

export function buildPreviewPrompt(contact: Contact, timeline: TimelineEntry[], hypothetical: string): string {
  const last5 = timeline.slice(0, 5).map((e) => `- [${e.occurred_at}] ${e.kind}: ${e.subject ?? ''} ${e.body ?? ''}`).join('\n');
  return [
    `You are drafting a reply for the MCMForge CRM.`,
    `Contact: ${contact.first_name ?? ''} ${contact.last_name ?? ''} (${contact.email ?? 'no-email'})`,
    `Status: ${contact.status}`,
    `Recent activity:`,
    last5 || '(none)',
    ``,
    `Hypothetical inbound message:`,
    hypothetical || '(generic ping — draft a friendly check-in)',
    ``,
    `Draft a 3-5 sentence reply. No preamble. No "Sure, here's a draft:" framing.`,
  ].join('\n');
}

export interface QueueResult {
  runId: string;
  rateLimited: boolean;
}

export async function queuePreviewDraft(
  contact: Contact,
  timeline: TimelineEntry[],
  hypothetical: string,
): Promise<QueueResult> {
  const last = recentCalls.get(contact.id);
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    return { runId: '', rateLimited: true };
  }
  recentCalls.set(contact.id, Date.now());

  const supabase = createForgeServiceClient();
  const prompt = buildPreviewPrompt(contact, timeline, hypothetical);
  const { data, error } = await supabase
    .from('runs')
    .insert({
      kind: 'crm_preview_draft',
      status: 'queued',
      input: { prompt, contact_id: contact.id },
      company_id: contact.company_id,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { runId: (data as { id: string }).id, rateLimited: false };
}
```

> **Note for the implementer:** the `forge.runs` table column names may differ slightly. Before coding, run `mcp__supabase__list_tables` filtered to `forge.runs` and adjust the `.insert({...})` keys to match (e.g., it may be `prompt` or `payload` instead of `input`). Same for `kind` vs `goal_kind`. Fix the insert shape, then update this task. Existing examples: `dashboard/src/app/api/agent/issues/[id]/attachments/route.ts` writes to forge tables — match that shape.

- [ ] **Step 3: Add a small test for the prompt builder**

`dashboard/src/lib/__tests__/crm-agent-preview.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildPreviewPrompt } from '../crm/agent-preview';
import type { Contact, TimelineEntry } from '../crm/types';

const contact: Contact = {
  id: 'c-1', company_id: 'co-1', account_id: null,
  first_name: 'Pam', last_name: 'M', email: 'pam@example.com',
  phone: null, title: 'Buyer', status: 'qualified',
  custom_fields: {}, created_at: '', updated_at: '', created_by: null,
};

describe('buildPreviewPrompt', () => {
  it('includes contact name + email + status', () => {
    const out = buildPreviewPrompt(contact, [], 'hello?');
    expect(out).toContain('Pam M');
    expect(out).toContain('pam@example.com');
    expect(out).toContain('qualified');
  });

  it('handles empty timeline gracefully', () => {
    const out = buildPreviewPrompt(contact, [], 'x');
    expect(out).toContain('(none)');
  });

  it('handles missing hypothetical with generic prompt', () => {
    const out = buildPreviewPrompt(contact, [], '');
    expect(out).toContain('generic ping');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd dashboard && npm test -- crm-agent-preview`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/crm/agent-preview.ts dashboard/src/lib/crm/service-client.ts dashboard/src/lib/__tests__/crm-agent-preview.test.ts
git commit -m "feat(crm): preview-draft prompt builder + run-queue helper"
```

### Task 6.2: API route — POST `/api/crm/preview-draft`

**Files:**
- Create: `dashboard/src/app/api/crm/preview-draft/route.ts`

- [ ] **Step 1: Write route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createForgeClient } from '@/lib/supabase/forge-server';
import { queuePreviewDraft } from '@/lib/crm/agent-preview';
import { listActivitiesForContact } from '@/lib/crm/client';
import type { Contact } from '@/lib/crm/types';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { contactId?: string; hypothetical?: string };
  if (!body.contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

  const supabase = await createForgeClient();
  const { data: contact } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('id', body.contactId)
    .maybeSingle();
  if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 });

  const timeline = await listActivitiesForContact(body.contactId, 50);
  const result = await queuePreviewDraft(contact as Contact, timeline, body.hypothetical ?? '');
  if (result.rateLimited) {
    return NextResponse.json({ error: 'rate-limited (1 per 30s)' }, { status: 429 });
  }
  return NextResponse.json({ runId: result.runId });
}
```

- [ ] **Step 2: Manual smoke**

In dev mode, log into the dashboard, then in the browser console:

```js
await fetch('/api/crm/preview-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId: '<some-uuid>', hypothetical: 'are you still in?' }) }).then(r => r.json())
```

Expected: `{ runId: '<uuid>' }`. Confirm the row landed via `mcp__supabase__execute_sql`:
```sql
SELECT id, kind, status FROM forge.runs WHERE id = '<runId>';
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/app/api/crm/preview-draft/route.ts
git commit -m "feat(crm): POST /api/crm/preview-draft queues a forge.runs row"
```

### Task 6.3: API route — SSE stream `/api/crm/preview-draft/stream`

**Files:**
- Create: `dashboard/src/app/api/crm/preview-draft/stream/route.ts`

- [ ] **Step 1: Write route**

```ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const runId = url.searchParams.get('runId');
  if (!runId) return new Response('runId required', { status: 400 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supaUrl, supaKey, { db: { schema: 'forge' }, realtime: { params: { eventsPerSecond: 10 } } });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`));
      };

      // Send any existing events first
      const { data: existing } = await supabase
        .from('run_events')
        .select('seq, kind, payload, created_at')
        .eq('run_id', runId)
        .order('seq', { ascending: true })
        .limit(500);
      for (const e of existing ?? []) send('event', e);

      // Subscribe to new events
      const channel = supabase
        .channel(`run-events-${runId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'forge', table: 'run_events', filter: `run_id=eq.${runId}` }, (payload) => {
          send('event', payload.new);
          const kind = (payload.new as { kind?: string }).kind ?? '';
          if (kind === 'run_completed' || kind === 'run_failed') {
            send('done', { runId });
            channel.unsubscribe();
            controller.close();
          }
        })
        .subscribe();

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', () => {
        channel.unsubscribe();
        controller.close();
      });

      // 90s safety timeout
      setTimeout(() => {
        send('timeout', { runId });
        channel.unsubscribe();
        controller.close();
      }, 90_000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

> **Note:** Adjust the `forge.run_events` column names (`kind`, `payload`) if they differ — quick check via `mcp__supabase__list_tables` then patch.

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/app/api/crm/preview-draft/stream/route.ts
git commit -m "feat(crm): SSE stream for preview-draft run events"
```

### Task 6.4: Wire `AgentEyePanel` to streaming endpoint

**Files:**
- Modify: `dashboard/src/app/crm/contacts/[id]/AgentEyePanel.tsx`

- [ ] **Step 1: Replace stub with full implementation**

```tsx
'use client';

import { useState, useRef } from 'react';
import type { Contact, TimelineEntry } from '@/lib/crm/types';

export function AgentEyePanel({ contact, timeline }: { contact: Contact; timeline: TimelineEntry[] }) {
  const [hypothetical, setHypothetical] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  async function preview() {
    setError(null);
    setDraft('');
    setStreaming(true);
    try {
      const res = await fetch('/api/crm/preview-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, hypothetical }),
      });
      if (res.status === 429) { setError('Slow down — 1 preview per 30s.'); setStreaming(false); return; }
      if (!res.ok) { setError(`Queue failed (${res.status})`); setStreaming(false); return; }
      const { runId } = (await res.json()) as { runId: string };
      const es = new EventSource(`/api/crm/preview-draft/stream?runId=${runId}`);
      esRef.current = es;
      es.addEventListener('event', (e) => {
        try {
          const evt = JSON.parse((e as MessageEvent).data) as { kind?: string; payload?: { text?: string } };
          if (evt.payload?.text) setDraft((prev) => prev + evt.payload!.text);
        } catch { /* ignore parse errors */ }
      });
      es.addEventListener('done', () => { setStreaming(false); es.close(); });
      es.addEventListener('timeout', () => { setError('Timed out waiting for orchestrator.'); setStreaming(false); es.close(); });
      es.onerror = () => { setError('Stream interrupted.'); setStreaming(false); es.close(); };
    } catch (e) {
      setError(String(e));
      setStreaming(false);
    }
  }

  return (
    <aside className="w-80 shrink-0 p-4 border-l border-[#30363d] min-h-screen bg-[#0d1117]">
      <h2 className="text-sm font-semibold text-white mb-2">Agent&rsquo;s view</h2>

      <section className="mb-4">
        <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide mb-1">Knowledge summary</h3>
        <ul className="space-y-1 text-xs">
          <li><span className="text-[#8b949e]">Status:</span> <span className="text-white">{contact.status}</span></li>
          {timeline.slice(0, 5).map((e) => (
            <li key={e.id} className="text-[#c9d1d9]">
              {new Date(e.occurred_at).toLocaleDateString()} — <span className="text-[#8b949e]">{e.kind}</span>
              {e.subject && <> · {e.subject}</>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide mb-1">Preview a draft</h3>
        <textarea
          value={hypothetical}
          onChange={(e) => setHypothetical(e.target.value)}
          rows={3}
          placeholder="Hypothetical inbound message…"
          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs"
        />
        <button
          onClick={preview}
          disabled={streaming}
          className="mt-2 w-full px-3 py-1.5 bg-[#1f6feb] text-white rounded text-xs disabled:opacity-50"
          data-testid="preview-draft-button"
        >
          {streaming ? 'Streaming…' : 'Generate preview'}
        </button>
        {error && <div className="mt-2 text-xs text-[#f85149]">{error}</div>}
        {draft && (
          <div data-testid="preview-draft-result" className="mt-3 text-xs text-[#c9d1d9] whitespace-pre-wrap p-2 border border-[#30363d] rounded bg-[#0d1117]">
            {draft}
          </div>
        )}
      </section>
    </aside>
  );
}
```

- [ ] **Step 2: Smoke**

Open `/crm/contacts/<id>` with the agent panel, click "Generate preview". Confirm:
- POST returns runId
- SSE stream connects
- Streaming works once the orchestrator emits `run_events` (orchestrator must be online + handling `kind='crm_preview_draft'`)
- If orchestrator doesn't yet handle this kind, the stream will sit idle until 90s timeout — that's expected pre-orchestrator-update; we still ship the dashboard side here. Orchestrator support is tracked separately (see Phase 8 follow-ups).

- [ ] **Step 3: Commit**

```bash
git add "dashboard/src/app/crm/contacts/[id]/AgentEyePanel.tsx"
git commit -m "feat(crm): AgentEyePanel wired to /api/crm/preview-draft + SSE"
```

---

## Phase 7 — Tests (Day 8)

### Task 7.1: Add CRM routes to smoke spec

**Files:**
- Modify: `dashboard/e2e/smoke.spec.ts`

- [ ] **Step 1: Read the existing PAGES array (around lines 16–20) and extend**

Replace the `PAGES` constant in `dashboard/e2e/smoke.spec.ts` with:

```ts
const PAGES = [
  { path: '/issues',         label: 'issues' },
  { path: '/runs',           label: 'runs' },
  { path: '/agents',         label: 'agents' },
  { path: '/crm',            label: 'crm-landing' },
  { path: '/crm/contacts',   label: 'crm-contacts' },
  { path: '/crm/accounts',   label: 'crm-accounts' },
  { path: '/crm/activities', label: 'crm-activities' },
  { path: '/crm/search',     label: 'crm-search' },
];
```

- [ ] **Step 2: Run smoke locally**

Run: `cd dashboard && npm run dev` (background); in another terminal: `cd dashboard && npm run test:e2e -- smoke.spec.ts`
Expected: all pages return < 500 status (auth gate counts as success per the existing spec).

- [ ] **Step 3: Commit**

```bash
git add dashboard/e2e/smoke.spec.ts
git commit -m "test(crm): add CRM routes to smoke spec"
```

### Task 7.2: Playwright end-to-end for CRM

**Files:**
- Create: `dashboard/e2e/crm.spec.ts`

- [ ] **Step 1: Write spec**

```ts
import { test, expect } from '@playwright/test';

// Authenticated CRM happy path. Mirrors the WO DOD checklist.
//   1. Create account
//   2. Create contact attached to it
//   3. Log a note activity
//   4. Verify timeline shows the note
//   5. Click preview-draft → assert a result element appears
//
// Auth: this spec assumes the test environment has agent@mcmforge.com
// authentication available (cookie or storage-state file at ./e2e/.auth/agent.json).
// If your project uses a different auth pattern, adjust the test.use() block below.

test.describe('CRM happy path', () => {
  test('create account → contact → log note → preview-draft', async ({ page }) => {
    const stamp = Date.now().toString();

    // 1. Account
    await page.goto('/crm/accounts/new');
    await page.getByLabel('Name').fill(`E2E Acct ${stamp}`);
    await page.getByLabel('Domain').fill(`e2e-${stamp}.example`);
    await page.getByRole('button', { name: /Create account/i }).click();
    await page.waitForURL(/\/crm\/accounts\/[0-9a-f-]+$/);

    // Capture the account ID from the URL.
    const accountUrl = page.url();
    const accountId = accountUrl.split('/').pop()!;

    // 2. Contact
    await page.goto('/crm/contacts/new');
    await page.getByLabel('First name').fill('E2E');
    await page.getByLabel('Last name').fill(stamp);
    await page.getByLabel('Email').fill(`e2e-${stamp}@example.com`);
    // Pick the just-created account from the select
    const accountSelect = page.getByLabel('Account');
    await accountSelect.selectOption({ label: new RegExp(`E2E Acct ${stamp}`) });
    await page.getByRole('button', { name: /Create contact/i }).click();
    await page.waitForURL(/\/crm\/contacts\/[0-9a-f-]+$/);

    // 3. Log note
    await page.locator('select[name="kind"]').selectOption('note');
    await page.locator('input[name="subject"]').fill('E2E note');
    await page.locator('textarea[name="body"]').fill(`Body ${stamp}`);
    await page.getByRole('button', { name: /Log it/i }).click();

    // 4. Verify timeline contains the note (after revalidate)
    await expect(page.getByText('E2E note')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Body ${stamp}`)).toBeVisible();

    // 5. Open agent panel + click preview-draft. We do not assert on streamed content
    //    (orchestrator may not handle the kind yet), but we DO assert the API contract:
    //    button click triggers a POST and the request resolves with runId or 429.
    await page.getByRole('button', { name: /Agent.*view/i }).click();
    const respPromise = page.waitForResponse((r) => r.url().includes('/api/crm/preview-draft') && r.request().method() === 'POST');
    await page.getByTestId('preview-draft-button').click();
    const resp = await respPromise;
    expect([200, 429]).toContain(resp.status());

    // Cleanup hint: account/contact rows persist with E2E prefix; a follow-up SQL job can purge.
  });

  test('cross-portfolio search returns matches', async ({ page }) => {
    await page.goto('/crm/search?q=example');
    // Empty result is acceptable on a fresh DB; we only assert the page renders.
    await expect(page.locator('h1')).toContainText('Cross-portfolio search');
  });
});
```

- [ ] **Step 2: Run e2e against Vercel preview**

After the next push, the Vercel preview URL is in the PR. Run:
```
PLAYWRIGHT_BASE_URL=<preview-url> cd dashboard && npm run test:e2e -- crm.spec.ts
```
(If the existing setup uses a different env var, mirror what `mission-control.spec.ts` does.)

Expected: both tests green. The preview-draft assertion accepts either 200 or 429 (since rate-limit is shared across runs).

- [ ] **Step 3: Commit**

```bash
git add dashboard/e2e/crm.spec.ts
git commit -m "test(crm): Playwright happy-path spec (account → contact → note → preview)"
```

---

## Phase 8 — Apply migration to prod & ship (Day 9)

### Task 8.1: Run full local quality gate

- [ ] **Step 1: Vitest**

Run: `cd dashboard && npm test`
Expected: all tests pass, including pre-existing suites.

- [ ] **Step 2: Lint**

Run: `cd dashboard && npm run lint`
Expected: zero errors. Fix anything that surfaces.

- [ ] **Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Smoke regression**

Run: `cd dashboard && npm run dev` (background); manually click through `/`, `/issues`, `/issues/<existing-id>`, `/inbox`, `/agents`, `/approvals`, `/runs`. Confirm no console errors in any. Stop the dev server.

If anything is broken, fix and create a NEW commit (don't `--amend`).

### Task 8.2: Apply migration to production

- [ ] **Step 1: Apply via MCP**

```
mcp__supabase__apply_migration:
  project_id: ncwxeeqvujgyiggkviqq
  name: 20260508_forge_crm_v1_schema
  query: <contents of supabase/migrations/20260508_forge_crm_v1_schema.sql>
```

- [ ] **Step 2: Verify in production**

```sql
-- via mcp__supabase__execute_sql against project_id=ncwxeeqvujgyiggkviqq
SELECT table_name FROM information_schema.tables
  WHERE table_schema='forge' AND table_name LIKE 'crm_%' ORDER BY table_name;
SELECT column_name FROM information_schema.columns
  WHERE table_schema='forge' AND table_name='issues' AND column_name='contact_id';
SELECT viewname FROM pg_views WHERE schemaname='forge' AND viewname='crm_activity_timeline';
SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('crm_accounts','crm_contacts','crm_activities');
SELECT proname FROM pg_proc WHERE proname='crm_search';
```

Expected: 3 tables, contact_id column, view, RLS=t on all three, function exists.

- [ ] **Step 3: Smoke prod-via-Vercel-preview manually**

After the next push to feature branch, Vercel produces a preview URL. Visit the preview, log in as `agent@mcmforge.com`, walk the WO DOD checklist:
- Create an account
- Create a contact attached to it
- Log a note
- See it in the timeline
- Trigger preview-draft (verify request fires; streaming may be no-op until orchestrator handles `kind='crm_preview_draft'`)
- Verify auto-derived activity: open an existing `forge.issues` row, set its `contact_id` via SQL to the test contact, refresh the contact detail page, confirm issue events appear in the timeline.
- Cross-portfolio search: insert two contacts under different `company_id`s with similar emails via SQL, run `/crm/search?q=<term>`, assert both rows appear with portfolio badges.
- Cleanup the SQL test rows.

If anything fails, fix in a new commit. Push.

### Task 8.3: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/wo-2-mcmforge-crm-design
```

- [ ] **Step 2: Open PR via gh**

```bash
gh pr create --title "feat(forge): WO-2 — MCMForge CRM v1 (Lean)" --body "$(cat <<'EOF'
## Summary
- Schema: 3 new `forge.crm_*` tables + `forge.issues.contact_id` + `forge.crm_activity_timeline` view + `forge.crm_search` RPC, all with permissive `authenticated_all` RLS (matches WO-1)
- Typed CRM client at `dashboard/src/lib/crm/client.ts` with full Vitest coverage
- 6 pages under `/crm/`: landing, contacts (list / new / detail), accounts (list / new / detail), activities, search
- Agent's-eye panel on contact detail with preview-draft button → POST /api/crm/preview-draft → SSE stream from forge.run_events
- Cross-portfolio search via `forge.crm_search` RPC across all 5 portfolio cos
- Playwright happy-path E2E + CRM routes added to smoke spec

Supersedes the prior Twenty-self-host approach (see PRD §6.2 + spec at `docs/superpowers/specs/2026-05-07-mcmforge-crm-design.md`).

Migration applied to production: `20260508_forge_crm_v1_schema.sql` ✅

## Test plan
- [x] Vitest green locally (`npm test`)
- [x] ESLint clean (`npm run lint`)
- [x] Build green (`npm run build`)
- [x] Manual regression: `/`, `/issues`, `/inbox`, `/agents`, `/approvals`, `/runs` still 200, no console errors
- [x] Migration applied + verified in prod (3 tables, view, RLS, RPC)
- [x] Manual smoke on Vercel preview: account → contact → note → timeline → preview-draft fires
- [x] Auto-derived activity: setting `forge.issues.contact_id` surfaces issue events in contact timeline
- [x] Cross-portfolio search returns matches with portfolio badges
- [x] Playwright `crm.spec.ts` green on Vercel preview
- [ ] Steve manual approval before merge
- [ ] Mini orchestrator: handle `kind='crm_preview_draft'` runs (follow-up — streaming endpoint already works for any future agent that emits `run_events`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verify CI**

Watch CI checks. If any fail, fix in a new commit, push.

### Task 8.4: After Steve approves and merges

- [ ] **Step 1: Verify Vercel auto-deployed `main` to production**

Visit `https://mcmforge.com/crm`. Confirm 200, contacts list renders.

- [ ] **Step 2: Stamp persistent memory**

Update `~/.claude/projects/-Users-stevemcmillian-llama-3-agents-Apps-projects-MCMForge/memory/MEMORY.md` with a new entry under "Currently shipped / load-bearing":

```
- [project_wo2_shipped_2026_05_XX.md](project_wo2_shipped_2026_05_XX.md) — WO-2 shipped: MCMForge CRM v1 (3 tables, view, RPC, 6 pages, agent panel, cross-portfolio search). PR #<N>. Foundation for WO-3 (Formbricks intake) and WO-4 (integration layer).
```

…and create the corresponding memory file with date, PR link, what was punched out, and any follow-ups (orchestrator support for `kind='crm_preview_draft'`).

---

## Self-Review

After writing this plan, the implementer should re-verify the spec items below are covered by the listed tasks:

- [x] Spec §4.1 — 3 tables (Task 1.1)
- [x] Spec §4.2 — `forge.issues.contact_id` (Task 1.1)
- [x] Spec §4.3 — `crm_activity_timeline` view (Task 1.1)
- [x] Spec §4.4 — RLS on all three (Task 1.1)
- [x] Spec §5.1 — six pages (Tasks 5.2, 5.3, 5.5, 5.6, 5.8, 5.9, 5.10)
- [x] Spec §5.2 — timeline UI (Task 4.3)
- [x] Spec §5.3 — agent's-eye panel (Tasks 5.5 stub + 6.4 wired)
- [x] Spec §5.4 — cross-portfolio search (Task 5.10 + RPC in 2.9)
- [x] Spec §5.5 — custom-fields rendering (Tasks 3.1, 3.2)
- [x] Spec §6 — typed CRM client (Tasks 2.1–2.9)
- [x] Spec §8 — acceptance criteria all addressed
- [x] WO DOD — every checkbox has a task
- [x] No placeholders ("TBD", "fill in details", "implement later") anywhere in code blocks above
- [x] Type names consistent (`Contact`, `Account`, `Activity`, `TimelineEntry`, `NewContact`, `NewActivity`, `CustomFieldSchema`) used identically across tasks
- [x] Function signatures consistent: `findContactByEmail`, `createContact`, `updateContact`, `findOrCreateAccount`, `logActivity`, `listActivitiesForContact`, `listActivitiesForAccount`, `searchCrm` — same shape in skeleton (Task 2.2), tests, and implementations.

If the implementer finds a gap, fix inline in a new commit before continuing.

---

## Notes for the implementer

- **Branch is already correct.** Don't re-create `feature/wo-2-mcmforge-crm-design`.
- **Migration is the single point of truth for schema.** Don't ship CRM-related schema in any other migration in this PR.
- **forge.runs / forge.run_events column shapes** may need a quick `mcp__supabase__list_tables` to confirm (Task 6.1 + 6.3 highlight this). If columns differ, fix the insert/select shape in those files before committing.
- **Mini orchestrator** does not yet know how to handle `kind='crm_preview_draft'`. The dashboard side ships in this PR; orchestrator support is a follow-up. The streaming endpoint is generic enough to work the moment the orchestrator emits run_events for that kind.
- **Don't add features.** Spec §7 is explicit about out-of-scope; resist the urge to ship inline editing, kanban, saved views, custom-field UI builder, CSV import, or email sync in this PR.
- **Frequent commits.** Every task ends with a commit. Don't squash. PR review reads the chronological diff.
- **CI gates the merge.** If a hook or check fails, fix and create a NEW commit. Never `--amend` on a failed pre-commit hook.
