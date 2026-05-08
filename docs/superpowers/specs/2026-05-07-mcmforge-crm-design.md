# MCMForge CRM — Design Spec

**Date:** 2026-05-07
**Author:** Claude (Opus 4.7) + Steve McMillian
**Status:** Approved, ready for implementation plan
**Supersedes:** Twenty-self-host approach in Marketing-OS PRD §2 (CRM row), WO-2 (Twenty self-host), and WO-2 pre-decisions PR #104.

---

## 1. Goal

Build a CRM **inside the existing MCMForge dashboard** instead of self-hosting Twenty. The CRM stores contacts, accounts (CRM-side companies, distinct from `forge.companies` which are the 5 portfolio cos), and activities. It's purpose-built for an agent-driven marketing operation: every contact's timeline shows agent actions and human approvals in one feed; agents read CRM data directly from Postgres; the team works inside one app instead of bouncing between MCMForge and Twenty.

**This collapses WO-2 entirely (was 3 days of Twenty self-host) and shrinks WO-3, WO-4, WO-6, WO-7.** Total Marketing-OS effort drops by 2–4 days net.

## 2. Why this design over Twenty

| Dimension | Twenty | MCMForge CRM |
|---|---|---|
| Data integrity | Eventual consistency between Twenty DB and `forge.*` via webhooks/REST | Single Postgres, single source of truth |
| Agent reads | GraphQL/REST round-trips, rate-limited | Direct SQL via Supabase service role |
| Activity timeline | Flat events; no native link to issue/approval chain | Auto-derived from `forge.issue_events` + explicit `forge.crm_activities`, unified in a SQL view |
| Cross-portfolio search | Strictly impossible (workspace isolation is the security model) | First-class — single ILIKE across all 5 portfolio cos |
| In-place approvals | Must app-switch from Twenty to MCMForge Inbox | Approval card embeds in the contact detail page |
| Agent's-eye view | Requires Twenty plugin against undocumented internals | Native — preview-draft button on the contact page |
| Deploy footprint | App + Postgres + Redis + BullMQ in Docker on Mac Mini, Cloudflare Tunnel, AGPL compliance | Already deployed on Vercel; no new infra |
| Visual polish (inline editing, kanban, custom-field UI builder) | Better | Worse — explicitly deferred |

We accept the polish gap. Inline editing and a custom-field UI builder are not on the team's actual workflow path; the agent-native architecture is.

## 3. Architecture

```
                ┌───────────────────────────────────────────┐
                │         dashboard/ (Vercel)                │
                │                                            │
   Pam/Steve ──►│  /crm/contacts  /crm/accounts  /crm/search │
                │  /crm/contacts/[id]  /crm/accounts/[id]    │
                │           │                                │
                │           ├──── lib/crm/client.ts          │
                │           │     (typed Supabase calls)     │
                │           ▼                                │
                │  forge.crm_contacts                        │
                │  forge.crm_accounts          ◄──────┐      │
                │  forge.crm_activities (explicit)    │      │
                │  forge.crm_activity_timeline (view) │      │
                │           ▲                         │      │
                │           │                         │      │
                │  forge.issues (with contact_id)     │      │
                │  forge.issue_events ────────────────┘      │
                │  forge.run_events                          │
                └───────────────────────────────────────────┘
                            ▲                ▲
                            │                │
                ┌───────────┘                └───────────┐
                │                                        │
        Forge orchestrator                       Formbricks webhook
        (agents, service role)                   (intake, WO-3)
```

One app. One DB. Agents and humans read the same tables.

## 4. Data Model

### 4.1 New tables

```sql
-- forge.crm_accounts: a CRM-side company (supplier/customer/partner/other)
CREATE TABLE forge.crm_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES forge.companies(id),  -- portfolio co (1 of 5)
  name          TEXT NOT NULL,
  domain        TEXT,                                          -- e.g. "acme.com" for dedup
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

-- forge.crm_contacts: a person at an account (or unaffiliated)
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

-- forge.crm_activities: explicit log entries (calls, notes, sent emails)
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
```

### 4.2 Modify `forge.issues`

```sql
ALTER TABLE forge.issues
  ADD COLUMN contact_id UUID REFERENCES forge.crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_forge_issues_contact_id ON forge.issues(contact_id);
```

Nullable — not every issue is CRM-related. Account is derivable via `contact.account_id`. Multi-contact issues (rare for our flow) extend with a link table when/if needed.

### 4.3 Activity timeline view

`forge.issue_events` columns (verified 2026-05-07): `id, issue_id, event_type, actor_type, actor_id, old_value, new_value, metadata (jsonb), created_at`. No `company_id` directly — derived via the issue join.

```sql
CREATE VIEW forge.crm_activity_timeline AS
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
  i.id                              AS issue_id,
  ie.event_type                     AS kind,
  i.title                           AS subject,
  COALESCE(ie.new_value, ie.metadata::text) AS body,
  CASE WHEN ie.actor_type = 'agent' THEN 'agent' ELSE 'human' END AS actor_kind,
  ie.actor_id                       AS actor_id,
  ie.created_at                     AS occurred_at,
  'derived_issue_event'::text       AS source
FROM forge.issue_events ie
JOIN forge.issues i ON i.id = ie.issue_id
LEFT JOIN forge.crm_contacts c ON c.id = i.contact_id
WHERE i.contact_id IS NOT NULL;
```

The view never double-counts: explicit `forge.crm_activities` rows are entries the user/agent typed; derived rows come from issue events that already happened. They're disjoint.

### 4.4 RLS

All three new tables get the same pattern as `forge.issue_attachments` from WO-1:

```sql
ALTER TABLE forge.crm_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.crm_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON forge.crm_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- (× 3, one per table)
```

Permissive `authenticated`. Service role bypasses for orchestrator/agent writes. Tenant isolation deferred to the future RBAC WO (same call as WO-1's `issue_attachments`).

The view inherits RLS from its underlying tables.

## 5. UI

### 5.1 Pages

All under `dashboard/src/app/crm/`:

| Path | Responsibility |
|---|---|
| `/crm` | Landing — three tabs: Contacts, Accounts, Activities |
| `/crm/contacts` | List: sortable, filterable (status, account, portfolio co), paginated. Reuses the `/issues` list pattern. |
| `/crm/contacts/[id]` | Detail: header, activity timeline (uses the view), open issues for this contact, custom-fields form, agent's-eye panel |
| `/crm/accounts` | List: sortable, filterable (account_type, status, portfolio co), paginated |
| `/crm/accounts/[id]` | Detail: header, rolled-up contact list, account-level activity timeline, custom-fields form |
| `/crm/search` | Global cross-portfolio search across contacts + accounts |

### 5.2 Activity timeline UI

Renders results from `forge.crm_activity_timeline` ordered by `occurred_at DESC`. Each entry shows:
- Icon by `kind` (call, note, email, status_change, etc.)
- Actor chip: agent name (with model) or human name with avatar
- Subject + body excerpt
- Click-through: explicit activities open an edit modal; derived issue events open the source issue

### 5.3 Agent's-eye view (the marquee differentiator)

Collapsible side panel on `/crm/contacts/[id]`. Shows:
- **Knowledge summary:** last 5 activities, current status, open issues, custom-field values
- **Preview-draft button:** triggers a one-shot agent run with prompt "given this contact's history, draft a reply to a hypothetical inbound message" — streams the result inline. Reuses existing agent-runner infrastructure from `forge-orchestrator`.
- **Agent's notes:** any agent run that wrote to `forge.run_events` with `kind='crm_observation'` shows here

### 5.4 Cross-portfolio search

`/crm/search?q=<term>` runs:

```sql
SELECT 'contact' AS kind, c.id, c.first_name || ' ' || c.last_name AS title,
       c.email AS detail, co.name AS portfolio_co
FROM forge.crm_contacts c
JOIN forge.companies co ON co.id = c.company_id
WHERE c.email ILIKE '%' || $1 || '%'
   OR c.first_name ILIKE '%' || $1 || '%'
   OR c.last_name ILIKE '%' || $1 || '%'

UNION ALL

SELECT 'account', a.id, a.name, a.domain, co.name
FROM forge.crm_accounts a
JOIN forge.companies co ON co.id = a.company_id
WHERE a.name ILIKE '%' || $1 || '%'
   OR a.domain ILIKE '%' || $1 || '%'

ORDER BY title
LIMIT 50;
```

Works across all 5 portfolio cos. Fast at <10k contacts. Revisit with `pg_trgm` indexes when results slow past ~200ms.

### 5.5 Custom fields rendering

Per-portfolio-co schema lives at `dashboard/src/lib/crm/custom-fields/<portfolio-co-slug>.ts`. Exports:

```ts
export const customFields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'preferred_contact_method',
    label: 'Preferred contact method', type: 'select',
    options: ['email', 'phone', 'text'], required: false },
  // ...
];
```

Frontend looks up the schema for the active portfolio co and renders the form. Backend stores keys/values in `custom_fields` JSONB. Adding a field = ~5 min code change + commit + deploy.

## 6. Agent integration

`dashboard/src/lib/crm/client.ts`:

```ts
export type Contact = { /* … */ };

export async function findContactByEmail(
  companyId: string, email: string
): Promise<Contact | null>;

export async function createContact(input: NewContact): Promise<Contact>;
export async function updateContact(id: string, patch: Partial<Contact>): Promise<Contact>;

export async function findOrCreateAccount(
  companyId: string, byDomain: string, fallbackName: string
): Promise<Account>;

export async function logActivity(input: NewActivity): Promise<Activity>;
export async function listActivitiesForContact(
  contactId: string, limit?: number
): Promise<TimelineEntry[]>;

export async function previewAgentDraft(
  contactId: string, hypotheticalIncoming: string
): Promise<{ draft: string; runId: string }>;
```

All functions use the service-role Supabase client. Direct DB access; no REST/GraphQL layer.

The Formbricks webhook (WO-3) calls `findOrCreateAccount` + `findContactByEmail`/`createContact` + `logActivity` to land an intake submission as a Contact + Activity in <500ms — no Twenty round-trip required.

## 7. Out of scope (v1)

Explicitly deferred to follow-on work:

- **Notion-style inline editing.** v1 ships form-based modals. WO-5 (PM/Tasks UI extensions) covers inline editing patterns; CRM picks them up after.
- **Kanban deal pipeline.** v1 uses the `status` field on `forge.crm_contacts`. A real `forge.crm_deals` table + kanban view promotes when the team needs pipeline tracking (likely v2).
- **Saved filter views per user.** v1 has standard list filters; saved views deferred to WO-5.
- **Custom-field UI builder.** v1 requires a TypeScript edit to add a field. UI builder is v3 territory.
- **Bulk CSV import.** v1 has manual entry + Formbricks intake only. CSV import is in WO-7 polish.
- **Email/calendar sync to activities.** v1 auto-derives from `forge.issue_events` only. Two-way Gmail/Calendar sync is its own future WO.
- **Multi-contact-per-issue.** v1 has one `contact_id` on `forge.issues`. Extend with a link table when the need actually arises.
- **Tenant-isolation policies.** v1 uses permissive `authenticated_all` policies (matches WO-1). Per-portfolio-co isolation lands with the future RBAC WO.

## 8. Acceptance criteria

The CRM is "shipped" when:

1. All three tables and the `crm_activity_timeline` view exist with RLS enabled.
2. `forge.issues.contact_id` column added with FK + index.
3. `/crm/contacts`, `/crm/accounts`, `/crm/search`, plus their detail pages all 200 on Vercel preview, clean smoke tests.
4. Pam can manually create a contact, attach it to an account, log an explicit activity, and see it in the timeline.
5. Auto-derived activities appear in a contact's timeline when an issue with `contact_id` set has `forge.issue_events` rows.
6. Agent's-eye preview panel renders the contact's knowledge summary and produces a streamed draft on demand.
7. Cross-portfolio search returns matching contacts + accounts across all 5 portfolio cos.
8. `dashboard/src/lib/crm/client.ts` is fully typed and unit-tested.
9. Playwright E2E: create contact via UI → log activity → see in timeline → click preview-draft → assert streamed result.
10. PR merged. Mini orchestrator unaffected.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Activity-timeline view performance at scale | Indexed `contact_id` on issues; cap UI to last 100 events; revisit with materialized view if needed |
| Cross-portfolio search slows past ~200ms | Add `pg_trgm` GIN indexes on email/name/domain when threshold hit |
| Agent-draft preview burns tokens on idle clicks | Rate-limit per contact (1 call per 30s); cache last result for 5 min |
| Custom fields drift between code schema and stored JSONB | Migration script that nulls unknown keys; per-key validation in `client.ts` |
| Polish gap (no inline editing) frustrates daily users | Ship v1 fast, gather feedback, prioritize follow-on UX work in WO-5 |
| RLS regression breaks dashboard reads | Smoke test pattern from WO-1; rollback is per-policy `DROP POLICY` |

## 10. File structure

```
supabase/migrations/
  YYYYMMDD_forge_crm_v1_schema.sql            -- 3 tables + indexes + view + RLS

dashboard/src/
  app/crm/
    page.tsx                                   -- /crm landing
    contacts/page.tsx                          -- /crm/contacts list
    contacts/[id]/page.tsx                     -- /crm/contacts/[id] detail
    contacts/[id]/AgentEyePanel.tsx
    accounts/page.tsx
    accounts/[id]/page.tsx
    activities/page.tsx                        -- /crm/activities list
    search/page.tsx
  lib/crm/
    client.ts                                  -- typed CRM operations
    types.ts                                   -- shared types
    custom-fields/
      index.ts                                 -- schema lookup by portfolio co
      links-choice.ts
      gbn.ts
      hgb.ts
      mcm-forge.ts
      dirtsync.ts
  components/crm/
    ContactCard.tsx
    ActivityTimeline.tsx
    CustomFieldForm.tsx
```

Mirrors the existing `dashboard/src/app/issues/` layout so reviewers can map one to the other.
