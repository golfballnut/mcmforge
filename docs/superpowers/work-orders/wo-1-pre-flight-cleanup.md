# WO-1 — Pre-flight cleanup

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §11
**Status:** Ready to dispatch
**Depends on:** none
**Estimated effort:** 1 day
**Branch:** `feature/wo-1-preflight-cleanup`

---

## Goal

Land three small infrastructure fixes before any Marketing-OS WO touches `forge.*`. None are blockers individually, but collectively they harden the foundation that WO-2 through WO-7 will build on.

## Why this WO exists

WO-2 stands up Twenty against `forge.companies`. WO-4 adds new tables (`forge.form_submissions`, `forge.crm_links`, `forge.secrets`). If `forge.run_events.seq` is silently overflowing or 10 tables are RLS-disabled when we add public-webhook entry points, we ship security holes by default. Knock these out clean before adding surface area.

## Definition of done

- [ ] All 10 RLS-disabled tables in `forge.*` either have RLS enabled with appropriate policies, or have a documented exemption in this WO's PR description.
- [ ] `forge.run_events.seq` migrated from INT4 → BIGINT (or counter source switched away from `Date.now()`).
- [ ] FORGE-364 secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_IDS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) added in Supabase dashboard.
- [ ] `telegram-webhook` edge function redeployed.
- [ ] Test message to Telegram bot creates a row in the destination table within 5 seconds.
- [ ] PR merged. Mini orchestrator restarted (no actual restart needed if no schema break — verify).

## In scope

### 1. RLS on 10 tables

Affected tables (per Supabase advisor):
- `forge.issue_attachments`
- `forge.tag_keywords`
- `forge.file_tag_mappings`
- `forge.trigger_errors`
- `forge.tag_agent_mappings`
- `forge.run_ratings`
- `forge.gap_taxonomy`
- `forge.stage_artifacts`
- `forge.stack_state`
- `forge.video_diff_runs`

For each:
1. Grep `dashboard/` and `forge-orchestrator/` for SELECT/INSERT/UPDATE/DELETE references.
2. Classify access: anon · authenticated · service_role only.
3. Service-role-only tables → `ENABLE ROW LEVEL SECURITY` with no policies (service role bypasses RLS).
4. Tables read by authenticated users → `ENABLE RLS` + permissive `authenticated` policy filtered by `company_id` where applicable.
5. Tables genuinely public → leave RLS off, document the exemption.

### 2. INT4 → BIGINT on `forge.run_events.seq`

Per memory ([`feedback_forge_run_events_seq_int4_overflow.md`](file path in memory)): `Date.now()` overflows INT4 in 2026. Migration:

```sql
-- Drop the dependent constraint first if any, then alter
ALTER TABLE forge.run_events ALTER COLUMN seq TYPE BIGINT;
```

Verify no other code path assumes INT4 max.

### 3. FORGE-364 Telegram secrets + redeploy

Per handoff: edge function exists, no secrets configured. Steps:
1. Steve adds 4 secrets in Supabase dashboard (manual UI step — not automatable).
2. Agent verifies via `supabase functions list-secrets` (or equivalent).
3. Agent runs `supabase functions deploy telegram-webhook`.
4. Agent sends test message to bot, verifies row appears in destination table.

## Out of scope

- FORGE-365 schema migration (`task_queue` → `forge.issues`). Becomes its own WO post-Marketing-OS.
- Refactoring existing dashboard code beyond the strict minimum to make RLS work.
- Performance tuning on any of these tables.

## Files likely touched

- New migration file in `supabase/migrations/2026-05-XX-rls-and-bigint.sql`.
- `supabase/functions/telegram-webhook/` (redeploy only — no code changes expected).
- Possibly tiny edits in `dashboard/src/lib/supabase/queries.ts` if a query needs an authenticated client where it was using anon.

## Suggested approach

1. Branch `feature/wo-1-preflight-cleanup`.
2. Read advisor remediation SQL but **do not auto-apply.**
3. For each of 10 tables: grep callers, classify, draft policy.
4. Single migration file with all RLS + BIGINT changes, idempotent (`IF EXISTS` / `IF NOT EXISTS`).
5. Apply migration locally via `supabase db reset` or against a branch DB; verify no app breakage.
6. Steve handles Telegram secrets manually.
7. Redeploy `telegram-webhook`, test.
8. Open PR. CI green. Steve approves. Merge.

## Test plan

- `dashboard` build green on Vercel preview.
- Smoke test: load `/`, `/issues`, `/inbox`, `/agents`, `/approvals` on preview URL — no 500s.
- Telegram bot test message → row inserted within 5 sec.
- Manually run a `forge.run_events` insert with seq > 2^31 to confirm BIGINT works.

## How to run this WO (fresh session bootstrap)

1. Open new Claude Code session in `/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge`.
2. Paste this WO doc into the chat.
3. Invoke `/superpowers:brainstorming` — it'll interview you on edge cases (e.g., specific access policies for ambiguous tables).
4. After brainstorming produces a sub-spec, invoke `/superpowers:writing-plans` for the implementation plan.
5. Execute plan with `/superpowers:executing-plans` or `/forge-ship` patterns.
6. Open PR. Tag Steve.
