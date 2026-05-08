# WO-2 — MCMForge CRM v1

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §6.2
**CRM design spec:** [`2026-05-07-mcmforge-crm-design.md`](../specs/2026-05-07-mcmforge-crm-design.md)
**Status:** Ready to dispatch
**Depends on:** WO-1 ✅ (shipped 2026-05-07)
**Estimated effort:** 10 days
**Branch:** `feature/wo-2-mcmforge-crm`

> **Supersedes the prior "WO-2 Twenty self-host" content (and the pre-decisions PR #104).** Marketing-OS pivoted away from Twenty 2026-05-07; the CRM is now built into the MCMForge dashboard against the `forge.*` schema. See parent PRD §2 for the rationale.

---

## Goal

Ship the MCMForge CRM v1 (Approach A: Lean) per [`2026-05-07-mcmforge-crm-design.md`](../specs/2026-05-07-mcmforge-crm-design.md). Three new tables (`forge.crm_accounts`, `forge.crm_contacts`, `forge.crm_activities`), a SQL view (`forge.crm_activity_timeline`), six new pages under `/crm`, a typed CRM client used by webhooks and agents, an "agent's-eye" preview panel on contact detail, and cross-portfolio global search. Done in one PR on `feature/wo-2-mcmforge-crm`.

## Why this WO exists

Marketing-OS depends on a working CRM. Without contacts, accounts, and activities, agents can't read history to draft replies and Pam can't see what's been sent or said. This WO replaces the Twenty-self-host approach with a CRM built into the existing dashboard — single Postgres, agent-native timelines, cross-portfolio search, in-place approvals. WO-3 (Formbricks intake) and WO-4 (integration layer) both call into the CRM client this WO produces.

## Definition of done

- [ ] Migration `YYYYMMDD_forge_crm_v1_schema.sql` applied: 3 tables created (`forge.crm_accounts`, `forge.crm_contacts`, `forge.crm_activities`), `forge.issues.contact_id` column added, view `forge.crm_activity_timeline` created. RLS enabled on all three tables with permissive `authenticated_all` policies.
- [ ] `dashboard/src/lib/crm/client.ts` implemented and unit-tested: `findContactByEmail`, `createContact`, `updateContact`, `findOrCreateAccount`, `logActivity`, `listActivitiesForContact`, `previewAgentDraft`.
- [ ] `dashboard/src/lib/crm/custom-fields/` with one schema file per portfolio company (links-choice, gbn, hgb, mcm-forge, dirtsync) plus an index.
- [ ] Pages live on Vercel preview, all 200, no console errors, login required:
  - `/crm` — landing tabs
  - `/crm/contacts` — list with filter/sort/pagination
  - `/crm/contacts/[id]` — detail with activity timeline + agent's-eye panel + open issues
  - `/crm/accounts` — list
  - `/crm/accounts/[id]` — detail with contact rollup + account-level timeline
  - `/crm/search` — global cross-portfolio
- [ ] Manual smoke (Steve): create an account → create a contact attached to it → log a `note` activity → see it in the timeline → trigger preview-draft → verify streamed result renders.
- [ ] Auto-derived activity check: pick an existing `forge.issues` row, set its `contact_id` to a test contact, verify that issue's events appear in `/crm/contacts/[id]` timeline.
- [ ] Cross-portfolio search returns matches across all 5 portfolio cos for a known shared term (e.g., a domain that appears under multiple cos).
- [ ] Playwright E2E green: create contact via UI → log activity → see in timeline → click preview-draft → assert streamed result.
- [ ] Vercel preview build green; Vitest + Playwright suites green; smoke routes (`/`, `/issues`, `/inbox`) still 200 (regression check).
- [ ] PR merged. Mini orchestrator unaffected.

## In scope

See spec §3–§6. Brief recap:

- **Schema:** 3 new tables + 1 column delta + 1 view, single migration file.
- **RLS:** permissive `authenticated_all` policies (matches WO-1 pattern). Future RBAC tightens later.
- **Pages:** 6 routes under `/crm/`. Reuse existing `/issues` patterns for list/detail layouts.
- **CRM client:** typed Supabase service-role calls. No REST/GraphQL.
- **Custom fields:** TypeScript-config per portfolio co; JSONB storage.
- **Agent's-eye panel:** collapsible side panel on contact detail. Knowledge summary + on-demand preview-draft button (rate-limited).
- **Cross-portfolio search:** ILIKE across `forge.crm_contacts` + `forge.crm_accounts` regardless of `company_id`. Result rows show portfolio co badge.

## Out of scope (per spec §7)

- Notion-style inline editing (form-based modals only).
- Kanban deal pipeline (use `status` field on Contact).
- Saved filter views per user.
- Custom-field UI builder.
- Bulk CSV import (manual + Formbricks intake only).
- Email/calendar sync to activities.
- Multi-contact-per-issue.
- Tenant-isolation policies via `user_companies` (deferred to RBAC WO).

## Files likely touched

**Created:**
- `supabase/migrations/YYYYMMDD_forge_crm_v1_schema.sql`
- `dashboard/src/app/crm/page.tsx`
- `dashboard/src/app/crm/contacts/page.tsx`
- `dashboard/src/app/crm/contacts/[id]/page.tsx`
- `dashboard/src/app/crm/contacts/[id]/AgentEyePanel.tsx`
- `dashboard/src/app/crm/accounts/page.tsx`
- `dashboard/src/app/crm/accounts/[id]/page.tsx`
- `dashboard/src/app/crm/activities/page.tsx`
- `dashboard/src/app/crm/search/page.tsx`
- `dashboard/src/lib/crm/client.ts`
- `dashboard/src/lib/crm/types.ts`
- `dashboard/src/lib/crm/agent-preview.ts` (prompt template for preview-draft)
- `dashboard/src/lib/crm/custom-fields/index.ts`
- `dashboard/src/lib/crm/custom-fields/{links-choice,gbn,hgb,mcm-forge,dirtsync}.ts`
- `dashboard/src/components/crm/ContactCard.tsx`
- `dashboard/src/components/crm/ActivityTimeline.tsx`
- `dashboard/src/components/crm/CustomFieldForm.tsx`
- Vitest specs for `lib/crm/client.ts`
- Playwright spec for the contact-create-to-preview flow

**Modified:**
- `dashboard/src/app/layout.tsx` or nav component to add `/crm` link (existing nav pattern)

## Suggested approach

1. Branch `feature/wo-2-mcmforge-crm`.
2. Migration first: write `forge_crm_v1_schema.sql`, apply to a Supabase branch DB, verify schema + RLS via `mcp__supabase__execute_sql` (same pattern WO-1 used). Commit.
3. Types + client (TDD): write `dashboard/src/lib/crm/types.ts`, then failing Vitest specs for `client.ts` operations against a mock Supabase, then implement.
4. Custom-field schemas: stub all 5 with one trivial field each. We'll fill them in over time.
5. Apply migration to production via `mcp__supabase__apply_migration` (after PR review by Steve).
6. Pages, in this order so the test-as-you-go cycle is tight:
   1. `/crm/contacts` list (copy `/issues` list pattern)
   2. `/crm/contacts/[id]` detail without agent-eye panel — verify timeline renders from view
   3. Add agent-eye panel + preview-draft button (reuses orchestrator's run mechanism)
   4. `/crm/accounts` list and detail (mostly mirrors contacts)
   5. `/crm/search` global search
   6. `/crm` landing with tabs
7. Smoke test on Vercel preview. Manually exercise the DOD checklist.
8. Open PR. CI green. Steve approves. Merge.

## Test plan

- Migration on Supabase branch DB before prod (same pattern as WO-1).
- Vitest for `lib/crm/client.ts` (mocked Supabase): every public function gets at least one happy-path test and one error case.
- Playwright E2E: contact create → activity log → timeline render → preview-draft → assert streamed result. Run on Vercel preview.
- Manual regression: smoke `/`, `/issues`, `/issues/[id]`, `/inbox`, `/agents`, `/approvals` — confirm RLS additions didn't break existing reads.
- Cross-portfolio search test: insert two test contacts with same email under different `company_id`, run `/crm/search?q=that-email`, assert both appear with correct portfolio badges. Cleanup after.

## How to run this WO (fresh session bootstrap)

1. Open new Claude Code session in `/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge`.
2. Paste this WO doc into the chat (or just reference the path).
3. The CRM design spec is already written (`docs/superpowers/specs/2026-05-07-mcmforge-crm-design.md`) — you do not need to re-brainstorm. Skip directly to `/superpowers:writing-plans` to produce the implementation plan against that spec.
4. Execute via `/superpowers:subagent-driven-development` or `/superpowers:executing-plans`.
5. Open PR. Tag Steve.
