# WO-4 — MCMForge integration layer

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §6.4, §7, §9
**Status:** Ready to dispatch
**Depends on:** WO-2, WO-3
**Estimated effort:** 2 days
**Branch:** `feature/wo-4-integration-layer`

> **Shrunk 2026-05-07** when Marketing-OS pivoted from Twenty to CRM-in-MCMForge. No Twenty REST client, no Twenty webhook receiver, no `forge.crm_links` table — all collapsed because the CRM is local. WO-2 ships `dashboard/src/lib/crm/client.ts` which this WO consumes.

---

## Goal

Build the integration layer that wires Formbricks → MCMForge. Replace the WO-3 webhook stub with a real receiver that parses submissions, calls the WO-2 CRM client to upsert account/contact/activity, and inserts a `forge.issues` row with `contact_id` set so the agent loop has work to do. Add `forge.form_submissions` and `forge.secrets` tables. Add `forge.issues.approval_payload` column.

## Why this WO exists

WO-2 makes the CRM real. WO-3 makes Formbricks real. WO-4 is the bridge — without it, the form submission goes nowhere useful. This is the keystone of the agent loop.

## Definition of done

- [ ] Migration applied creating: `forge.form_submissions`, `forge.secrets` (pgsodium-encrypted). RLS on both.
- [ ] Migration applied adding: `forge.issues.approval_payload` JSONB column. (Note: `forge.issues.custom_fields` is added by WO-5; `forge.issues.contact_id` was added by WO-2.)
- [ ] `dashboard/src/lib/integrations/formbricks.ts` typed REST client implemented (mostly read: `listSubmissions`, `getSubmission`).
- [ ] `dashboard/src/app/api/webhooks/formbricks/route.ts` — HMAC-verify, persist to `forge.form_submissions`, look up portfolio co by URL param, call `lib/crm/client.ts` (`findOrCreateAccount`, `findContactByEmail`/`createContact`, `logActivity`), insert `forge.issues` row with `contact_id` set, status `drafting`.
- [ ] Per-co secrets seeded in `forge.secrets`: `formbricks_hmac` per company.
- [ ] PR merged.
- [ ] End-to-end manual test: submit Links Choice form (from WO-3) → see `forge.crm_contacts` row + `forge.crm_activities` row + `forge.issues` row (status=`drafting`, `contact_id` set), all linked, within 60 seconds.

## In scope

### Schema (single migration file)

```sql
CREATE TABLE forge.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  source TEXT NOT NULL,                     -- 'formbricks'
  external_id TEXT NOT NULL,                -- Formbricks submission id
  form_slug TEXT NOT NULL,                  -- 'links-choice-supplier-intake'
  payload JSONB NOT NULL,                   -- raw submission
  parsed JSONB,                             -- normalized {name, email, phone, ...}
  issue_id UUID REFERENCES forge.issues(id),
  contact_id UUID REFERENCES forge.crm_contacts(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE TABLE forge.secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  key TEXT NOT NULL,                        -- 'formbricks_hmac' | future
  value_encrypted TEXT NOT NULL,            -- pgsodium-encrypted; service role only
  created_at TIMESTAMPTZ DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  UNIQUE (company_id, key)
);

ALTER TABLE forge.issues ADD COLUMN IF NOT EXISTS approval_payload JSONB;
```

Both new tables: `ENABLE ROW LEVEL SECURITY` + service-role-only access (no policies — service role bypasses).

### Formbricks REST client

Typed wrapper around Formbricks REST. Auth via `forge.secrets`. Caching: 30-second per-key memo for read calls.

### Webhook receiver

- HMAC verification middleware against `formbricks_hmac` secret per portfolio co.
- Idempotency: check `forge.form_submissions.external_id` UNIQUE before insert.
- Routing: portfolio co lookup by URL param (`?company=links-choice`) against `forge.companies.slug`.
- CRM upsert via `lib/crm/client.ts` (the WO-2 deliverable).
- Issue insertion with `contact_id` set so the agent draft loop has the link.
- Failure path: 5xx response triggers Formbricks retry; on third failure, alert via existing inbox.

## Out of scope

- Agent draft logic — that's WO-6 ("the agent reads the issue and drafts").
- Inbox UI changes for approval cards — WO-6.
- PM/tasks UI changes — WO-5.
- Forms setup or CRM views — WO-2 / WO-3.

## Files likely touched

- `supabase/migrations/2026-05-XX-marketing-os-integration.sql` (new)
- `dashboard/src/lib/integrations/formbricks.ts` (new)
- `dashboard/src/lib/integrations/secrets.ts` (new — pgsodium read helper)
- `dashboard/src/app/api/webhooks/formbricks/route.ts` (replaces WO-3 stub)
- `dashboard/src/app/api/webhooks/formbricks/__tests__/route.test.ts` (new)

## Suggested approach

1. Branch `feature/wo-4-integration-layer`.
2. Migration first (write + test on a Supabase branch DB).
3. Formbricks typed client next (TDD: tests against mocked HTTP, then implement).
4. Webhook receiver last — composes the Formbricks client + CRM client from WO-2.
5. Integration test: simulate a Formbricks webhook payload locally, assert end-to-end (form_submissions + crm_contacts + crm_activities + issues all linked).
6. PR — Steve verifies on Vercel preview by submitting a real Formbricks form on Links Choice staging.

## Test plan

### Unit
- HMAC verification (valid + invalid signatures, missing header).
- Idempotency (duplicate `external_id` returns 200, single insert).
- Formbricks client: every method tested against mock with assertions on URL + headers + body.

### Integration
- Submit a webhook payload locally → `forge.form_submissions` row + CRM contact/account/activity + `forge.issues` row, all linked.

### Manual
- Steve submits a real form on the Vercel preview URL — within 60 sec, contact appears in `/crm/contacts/[id]`, issue appears in `/issues` with the contact link, activity timeline shows the intake note.

## How to run this WO (fresh session bootstrap)

1. Open new Claude Code session.
2. Paste this WO doc.
3. `/superpowers:brainstorming` — likely covers: pgsodium setup, error-recovery details, idempotency edge cases.
4. `/superpowers:writing-plans` for implementation plan with file-level TDD breakdown.
5. Execute. Run tests locally. Migration on a Supabase branch DB before main.
6. PR + Steve verifies on Vercel preview with a real form submission.
