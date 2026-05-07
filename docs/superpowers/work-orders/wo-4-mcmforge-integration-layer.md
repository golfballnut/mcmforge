# WO-4 — MCMForge integration layer

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §6.4, §7, §9
**Status:** Ready to dispatch
**Depends on:** WO-2, WO-3
**Estimated effort:** 3 days
**Branch:** `feature/wo-4-integration-layer`

---

## Goal

Build the integration layer in MCMForge that connects Twenty + Formbricks to `forge.*` schema. Replace the WO-3 webhook stub with a real receiver that creates Twenty contacts/opportunities and `forge.issues` rows. Add the schema and typed REST clients agents will use everywhere downstream.

## Why this WO exists

WO-2 makes Twenty real. WO-3 makes Formbricks real. WO-4 is the bridge — without it, the form submission goes nowhere useful. This is the keystone of the agent loop.

## Definition of done

- [ ] Migration applied creating: `forge.form_submissions`, `forge.crm_links`, `forge.secrets` (pgsodium-encrypted).
- [ ] Migration applied adding: `forge.issues.approval_payload` JSONB column. (Note: `forge.issues.custom_fields` is added by WO-5.)
- [ ] `dashboard/src/lib/integrations/twenty.ts` typed REST client implemented: `createContact`, `findContactByEmail`, `createOpportunity`, `updateOpportunity`, `logActivity`, `listActivitiesForContact`.
- [ ] `dashboard/src/lib/integrations/formbricks.ts` typed REST client implemented (mostly read: `listSubmissions`, `getSubmission`).
- [ ] `dashboard/src/app/api/webhooks/formbricks/route.ts` — HMAC-verify, persist to `forge.form_submissions`, look up portfolio co by URL param, call Twenty to create-or-update contact + opportunity, insert `forge.issues` row.
- [ ] `dashboard/src/app/api/webhooks/twenty/route.ts` — verify subscription, log to `forge.issue_events` if linked, support optional issue creation rules.
- [ ] Per-co secrets seeded in `forge.secrets`: `twenty_api_key`, `formbricks_hmac` per company.
- [ ] PR merged.
- [ ] End-to-end manual test: submit Links Choice form (from WO-3) → see contact in Twenty Links Choice workspace + `forge.issues` row created in `awaiting_drafting` status within 60 seconds.

## In scope

### Schema (single migration file)

```sql
CREATE TABLE forge.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  form_slug TEXT NOT NULL,
  payload JSONB NOT NULL,
  parsed JSONB,
  issue_id UUID REFERENCES forge.issues(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE TABLE forge.crm_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  issue_id UUID NOT NULL REFERENCES forge.issues(id),
  twenty_workspace_slug TEXT NOT NULL,
  twenty_object_type TEXT NOT NULL,
  twenty_object_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (issue_id, twenty_object_type, twenty_object_id)
);

CREATE TABLE forge.secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  UNIQUE (company_id, key)
);

ALTER TABLE forge.issues ADD COLUMN IF NOT EXISTS approval_payload JSONB;
```

All three new tables: `ENABLE ROW LEVEL SECURITY` + service-role-only access.

### REST clients

Typed wrappers around Twenty REST + Formbricks REST. Auth via `forge.secrets`. Caching: 30-second per-key memo for read calls.

### Webhook receivers

- HMAC verification middleware.
- Idempotency: check `forge.form_submissions.external_id` UNIQUE before insert.
- Routing: portfolio co lookup by URL param against `forge.companies.slug`.
- Failure path: 5xx response triggers Formbricks/Twenty's retry; on third failure, alert via existing inbox.

## Out of scope

- Agent draft logic — that's WO-6 ("the agent reads the issue and drafts").
- Inbox UI changes for approval cards — WO-6.
- PM/tasks UI changes — WO-5.
- Forms or Twenty workspace setup — WO-2 / WO-3.

## Files likely touched

- `supabase/migrations/2026-05-XX-marketing-os-integration.sql` (new)
- `dashboard/src/lib/integrations/twenty.ts` (new)
- `dashboard/src/lib/integrations/formbricks.ts` (new)
- `dashboard/src/lib/integrations/secrets.ts` (new — pgsodium read helper)
- `dashboard/src/app/api/webhooks/formbricks/route.ts` (replaces WO-3 stub)
- `dashboard/src/app/api/webhooks/twenty/route.ts` (new)
- `dashboard/src/lib/integrations/__tests__/twenty.test.ts` (new — Vitest)
- `dashboard/src/app/api/webhooks/formbricks/__tests__/route.test.ts` (new)

## Suggested approach

1. Branch `feature/wo-4-integration-layer`.
2. Migration first (write + test on a Supabase branch DB).
3. Typed clients next (TDD: write tests against mocked HTTP, then implement).
4. Webhook receivers last — they compose the clients.
5. Integration test: spin up local dev Twenty (or use staging workspace if available), submit form, assert end-to-end.
6. PR — Steve verifies on Vercel preview by submitting a real Formbricks form on Links Choice staging.

## Test plan

### Unit
- HMAC verification (valid + invalid signatures, missing header).
- Idempotency (duplicate `external_id` returns 200, single insert).
- Twenty client: every method tested against mock with assertions on URL + headers + body.

### Integration
- Submit Formbricks form (Links Choice supplier intake) → `forge.form_submissions` row + Twenty contact + `forge.issues` row, all linked correctly via `forge.crm_links`.
- Twenty webhook fires (manually edit a contact) → `forge.issue_events` row appears for the linked issue.

### Manual
- Steve submits a real form on the Vercel preview URL — Pam can see the contact in Twenty Links Choice workspace within 60 sec.

## How to run this WO (fresh session bootstrap)

1. Open new Claude Code session.
2. Paste this WO doc.
3. `/superpowers:brainstorming` — likely covers: pgsodium setup, error-recovery details, idempotency edge cases.
4. `/superpowers:writing-plans` for implementation plan with file-level TDD breakdown.
5. Execute. Run tests locally. Migration on a Supabase branch DB before main.
6. PR + Steve verifies on Vercel preview with a real form submission.
