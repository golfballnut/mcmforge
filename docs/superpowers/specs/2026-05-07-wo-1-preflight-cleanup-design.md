# WO-1 — Pre-flight Cleanup — Design Spec

**Date:** 2026-05-07
**Author:** Claude (Opus 4.7) + Steve McMillian
**Parent WO:** [`docs/superpowers/work-orders/wo-1-pre-flight-cleanup.md`](../work-orders/wo-1-pre-flight-cleanup.md)
**Parent PRD:** [`docs/superpowers/specs/2026-05-07-marketing-os-design.md`](2026-05-07-marketing-os-design.md) §11
**Branch:** `feature/wo-1-preflight-cleanup`
**Status:** Approved, ready for implementation plan

---

## 1. Goal

Land three independent pre-flight infrastructure fixes before any Marketing-OS work order touches `forge.*`:

1. Enable RLS on 10 tables currently flagged by Supabase advisor.
2. Migrate `forge.run_events.seq` from INT4 to BIGINT (to stop silent insert failures from `Date.now()` overflow in 2026).
3. Configure Telegram webhook secrets in Supabase and redeploy the `telegram-webhook` edge function so inbound messages create rows.

Ship as a single PR with two migrations and one operational change.

---

## 2. Architecture

One feature branch (`feature/wo-1-preflight-cleanup`) → one PR → three artifacts:

| Artifact | Type | File |
|---|---|---|
| **Migration A** | SQL migration | `supabase/migrations/20260507_forge_rls_lockdown.sql` |
| **Migration B** | SQL migration | `supabase/migrations/20260507_forge_run_events_seq_bigint.sql` |
| **Telegram activation** | Operational steps in PR description | n/a — manual + `supabase functions deploy` |

Two migration files (not one) so RLS and BIGINT can roll back independently if needed.

---

## 3. Migration A — RLS Lockdown

### 3.1 The 9 unused tables (service-role only)

Tables: `forge.tag_keywords`, `forge.file_tag_mappings`, `forge.tag_agent_mappings`, `forge.trigger_errors`, `forge.run_ratings`, `forge.gap_taxonomy`, `forge.stage_artifacts`, `forge.stack_state`, `forge.video_diff_runs`.

**Pre-flight:** `grep -rn` against `dashboard/src` and `forge-orchestrator/src` returns zero non-test references for all 9. They are dead/legacy.

**SQL pattern (per table):**
```sql
ALTER TABLE forge.<name> ENABLE ROW LEVEL SECURITY;
```

No policies. Service role bypasses RLS. If anything is silently writing to these tables, it'll surface in orchestrator logs immediately and we can add policy or roll back the single statement.

`ENABLE ROW LEVEL SECURITY` is naturally idempotent (no-op if already on).

### 3.2 The 1 active table — `forge.issue_attachments`

**Pre-flight reads:** `dashboard/src/app/issues/page.tsx` reads `issue_attachments` via `dashboard/src/lib/supabase/server.ts`, which uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` with cookie-based auth. So reads happen as the **authenticated user**, not service role. Enabling RLS without a policy would break the dashboard.

**Writes:** `forge-orchestrator/src/services/auto-attach-proof.ts`, agent API routes (`dashboard/src/app/api/agent/issues/[id]/attachments/route.ts`), and issue actions all use service role for writes. Service role bypasses RLS, so writes are unaffected.

**Policy:** Permissive `authenticated_all`. Matches today's operational reality (team members have access to all 5 portfolio companies). Tenant isolation by `company_id` is deferred to a future WO that introduces RBAC.

**SQL:**
```sql
ALTER TABLE forge.issue_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.issue_attachments
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
```

`DO $$ ... EXCEPTION WHEN duplicate_object` wrapper makes the policy creation idempotent on re-runs (since `CREATE POLICY IF NOT EXISTS` is unsupported on PG <15).

### 3.3 Rollback

```sql
-- Per-table rollback if needed:
ALTER TABLE forge.<name> DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON forge.issue_attachments;
```

---

## 4. Migration B — BIGINT on `forge.run_events.seq`

### 4.1 Why

`forge.run_events.seq` is INT4 (max 2,147,483,647 ≈ 2.1 × 10^9). Code that wrote `seq: Date.now()` produced values around 1.78 × 10^12 in 2026 — three orders of magnitude past INT4 max. Every insert silently failed with "integer out of range," swallowed by `.catch(()=>{})` in `runChildProcess`. The defect was discovered 2026-05-05 with **808 lifetime runs producing zero `run_events` rows**.

Fix: widen the column to BIGINT (INT8, max ≈ 9.2 × 10^18) so any sub-second-resolution counter fits with room to spare.

### 4.2 SQL

```sql
ALTER TABLE forge.run_events ALTER COLUMN seq TYPE BIGINT;
```

Postgres rewrites the column in place. Brief `ACCESS EXCLUSIVE` lock on the table proportional to row count. For typical `forge.run_events` size, this is seconds, not minutes. Run during a low-traffic window (operator discretion).

### 4.3 Pre-flight verification

- Confirm no TypeScript/JS code path treats `seq` as a 32-bit integer (e.g., bitwise ops, `Int32Array`, etc.).
- Confirm no DB constraint, index, or view depends on the column type in a way that requires drop/recreate.

### 4.4 Rollback

```sql
-- Only safe if no row has seq > 2^31 - 1
ALTER TABLE forge.run_events ALTER COLUMN seq TYPE INT4;
```

---

## 5. Telegram Webhook Activation

### 5.1 Required secrets

The edge function (`supabase/functions/telegram-webhook/index.ts`) reads four `Deno.env` vars:

| Var | Source |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Existing value in Mini's `dispatcher/.env` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Same value as Mini's `TELEGRAM_CHAT_ID`, comma-separated format (single ID is fine) |
| `SUPABASE_URL` | Auto-injected by Supabase runtime, but set explicitly per WO |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase runtime, but set explicitly per WO |

**Note:** Mini's dispatcher uses `TELEGRAM_CHAT_ID` (singular). The edge function expects `TELEGRAM_ALLOWED_CHAT_IDS` (plural, comma-separated). Same value, new var name — not a breaking change to dispatcher.

### 5.2 Activation steps

1. Agent SSHes to Mac Mini, reads values from `dispatcher/.env` (do not commit values to repo).
2. Steve pastes the 4 values into Supabase dashboard → Edge Functions → Secrets manually.
3. Agent verifies via Supabase MCP or CLI.
4. Agent redeploys: `supabase functions deploy telegram-webhook`.
5. Agent sends a test message to the bot.
6. Agent queries the destination table to confirm a row was inserted within 5 seconds.

### 5.3 Destination table

The webhook inserts into `task_queue` (per `supabase/functions/telegram-webhook/index.ts:439-440, 495-496`). Note: `task_queue` is slated to migrate to `forge.issues` under FORGE-365, out of scope here.

---

## 6. Test Plan

### 6.1 CI gates (automated)

- Vercel preview build for `dashboard` is green.
- TypeScript and lint pass on both `dashboard` and `forge-orchestrator`.

### 6.2 Smoke tests on preview URL (manual)

- `/` loads, no 500s.
- `/issues` loads, attachment counts render correctly.
- `/issues/[id]` loads, attachments list renders.
- `/inbox`, `/agents`, `/approvals` load without 500s.

### 6.3 BIGINT proof

```sql
INSERT INTO forge.run_events (run_id, seq, kind, payload)
VALUES ('<existing-run-id>', 2147483648, 'test', '{}');
-- Expect: success. Then DELETE the test row.
```

### 6.4 Telegram proof

- Send test message to bot.
- `SELECT * FROM task_queue ORDER BY created_at DESC LIMIT 1;`
- Confirm row exists, `created_at` within 5 seconds of message send.

---

## 7. Out of Scope

- **Dropping the 9 dead tables.** Confirmed unused in app code, but a separate WO if Steve wants them gone — preserves rollback simplicity.
- **Tenant-isolation policies on `issue_attachments` via `company_id`.** Depends on a `user_companies` claim or table that doesn't exist yet. Future WO when RBAC lands.
- **FORGE-365 `task_queue` → `forge.issues` migration.** Explicit in parent WO.
- **Refactoring dashboard code beyond the strict minimum.** WO-5 will do the broader PM/UI work.
- **Performance tuning on any table.**

---

## 8. Definition of Done

- [ ] All 10 tables in §3 have RLS enabled.
- [ ] `forge.issue_attachments` has the `authenticated_all` policy attached.
- [ ] `forge.run_events.seq` is BIGINT (verified by `\d forge.run_events`).
- [ ] 4 Telegram secrets are set in Supabase dashboard.
- [ ] `telegram-webhook` redeployed.
- [ ] Test Telegram message produces a row in the destination table within 5s.
- [ ] BIGINT-overflow insert test (§6.3) succeeds.
- [ ] PR merged to `main`. CI green throughout.
- [ ] Mini orchestrator unaffected (no restart needed unless schema break observed).

---

## 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| RLS on `issue_attachments` breaks dashboard reads | Low | Permissive `authenticated_all` policy; manual smoke tests on preview URL pre-merge |
| One of the "dead" tables is silently written by a cron we missed | Low | RLS-only (no policies) means service role still works; orchestrator logs surface any anon/auth writes |
| BIGINT migration locks the table too long | Very low | Run during low-traffic window; row count is small; rollback is a one-liner |
| Telegram secret values mismatch between Mini and webhook | Medium | Source from Mini directly; verify with test message before declaring done |
| Idempotency failure on re-run | Low | `DO $$ ... EXCEPTION` wrapper for policy; `ALTER TABLE` statements are naturally idempotent |

---

## 10. Files Touched

**New:**
- `supabase/migrations/20260507_forge_rls_lockdown.sql`
- `supabase/migrations/20260507_forge_run_events_seq_bigint.sql`

**Modified (likely none, possibly one):**
- `dashboard/src/lib/supabase/server.ts` — only if smoke tests reveal an unexpected anon-client read on a now-RLS-locked table. Unlikely.

**No changes:**
- `supabase/functions/telegram-webhook/index.ts` — redeploy only, no code edits.

---

## 11. Sequencing

1. Branch `feature/wo-1-preflight-cleanup`.
2. Write migration A.
3. Pre-flight grep on each of the 9 unused tables (confirm in-PR).
4. Write migration B.
5. Apply both migrations against a Supabase branch DB; smoke test preview URL.
6. Operational steps for Telegram (Steve manual + agent redeploy + test).
7. Open PR. CI green. Smoke tests pass. Merge.
