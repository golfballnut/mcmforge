# WO-1 Pre-flight Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land RLS on 10 `forge.*` tables, widen `forge.run_events.seq` from INT4 to BIGINT, and activate the `telegram-webhook` edge function — in one PR on `feature/wo-1-preflight-cleanup`.

**Architecture:** Two SQL migrations under `supabase/migrations/` and one operational change (Supabase secrets + `supabase functions deploy`). Migrations are tested on a temporary Supabase branch DB before being applied to production via `mcp__supabase__apply_migration`. Telegram secrets are sourced from the Mac Mini's `dispatcher/.env` where they already work.

**Tech Stack:** PostgreSQL 15 (Supabase project `ncwxeeqvujgyiggkviqq`), Supabase MCP tools (`mcp__supabase__*`), Supabase CLI for edge functions, SSH to Mac Mini for credential retrieval.

**Spec:** [`docs/superpowers/specs/2026-05-07-wo-1-preflight-cleanup-design.md`](../specs/2026-05-07-wo-1-preflight-cleanup-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260507_forge_rls_lockdown.sql` | **Create** | Enable RLS on 10 tables; add `authenticated_all` policy on `forge.issue_attachments` |
| `supabase/migrations/20260507_forge_run_events_seq_bigint.sql` | **Create** | `ALTER COLUMN seq TYPE BIGINT` |
| `supabase/functions/telegram-webhook/index.ts` | No code change | Redeploy only (post-secrets) |
| PR description | **Author** | Document RLS exemptions and Telegram activation steps |

---

## Task 1: Setup and pre-flight verification

**Files:** none (read-only)

- [ ] **Step 1: Confirm we're on the feature branch**

Run: `git branch --show-current`
Expected: `feature/wo-1-preflight-cleanup`
If not: `git checkout feature/wo-1-preflight-cleanup`

- [ ] **Step 2: Re-confirm 9 "dead" tables have no app references**

Run:
```bash
grep -rn "tag_keywords\|file_tag_mappings\|tag_agent_mappings\|trigger_errors\|run_ratings\|gap_taxonomy\|stage_artifacts\|stack_state\|video_diff_runs" dashboard/src forge-orchestrator/src 2>/dev/null | grep -v "test\|\.test\."
```
Expected: empty output. If non-empty, STOP and surface the references — they may need a real policy instead of bare RLS.

- [ ] **Step 3: Capture RLS pre-state via Supabase MCP**

Use `mcp__supabase__execute_sql` against project `ncwxeeqvujgyiggkviqq`:
```sql
SELECT n.nspname AS schema, c.relname AS table, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'forge'
  AND c.relname IN (
    'issue_attachments','tag_keywords','file_tag_mappings','tag_agent_mappings',
    'trigger_errors','run_ratings','gap_taxonomy','stage_artifacts',
    'stack_state','video_diff_runs'
  )
ORDER BY c.relname;
```
Expected: 10 rows, all with `rls_enabled = false`. Save output as proof of pre-state.

- [ ] **Step 4: Capture `run_events.seq` pre-state**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'forge' AND table_name = 'run_events' AND column_name = 'seq';
```
Expected: `seq | integer` (INT4). Save as proof.

---

## Task 2: Write Migration A — RLS lockdown

**Files:**
- Create: `supabase/migrations/20260507_forge_rls_lockdown.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 20260507_forge_rls_lockdown.sql
-- WO-1: enable RLS on 10 forge.* tables flagged by Supabase advisor.
-- 9 tables are unused (zero app references) and get RLS-only (service role bypasses).
-- forge.issue_attachments is actively read by the dashboard's authenticated client and
-- gets a permissive `authenticated_all` policy. Tenant isolation deferred to future RBAC WO.

BEGIN;

-- 9 unused / service-role-only tables ----------------------------------------
ALTER TABLE forge.tag_keywords         ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.file_tag_mappings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.tag_agent_mappings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.trigger_errors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.run_ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.gap_taxonomy         ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.stage_artifacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.stack_state          ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge.video_diff_runs      ENABLE ROW LEVEL SECURITY;

-- forge.issue_attachments: actively read by dashboard via anon-cookie auth ----
ALTER TABLE forge.issue_attachments    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "authenticated_all" ON forge.issue_attachments
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
```

- [ ] **Step 2: Verify the file was written and is syntactically valid**

Run: `cat supabase/migrations/20260507_forge_rls_lockdown.sql | head -30`
Expected: see the SQL above.

Optional sanity: `psql --dry-run` is not available here; rely on Task 3 to validate against a real DB.

---

## Task 3: Test Migration A on a Supabase branch DB

**Files:** none (DB operations via MCP)

- [ ] **Step 1: Create a Supabase branch**

Use `mcp__supabase__create_branch` with name `wo-1-rls-test`. Capture the returned branch ID and `project_ref`.

Expected: a new branch project ref. Note it for subsequent steps.

- [ ] **Step 2: Apply the RLS migration to the branch**

Use `mcp__supabase__apply_migration` with:
- `project_id`: branch project ref from Step 1
- `name`: `20260507_forge_rls_lockdown`
- `query`: full contents of `supabase/migrations/20260507_forge_rls_lockdown.sql`

Expected: success, no errors.

- [ ] **Step 3: Verify RLS post-state on branch**

Use `mcp__supabase__execute_sql` against the branch:
```sql
SELECT n.nspname, c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'forge'
  AND c.relname IN (
    'issue_attachments','tag_keywords','file_tag_mappings','tag_agent_mappings',
    'trigger_errors','run_ratings','gap_taxonomy','stage_artifacts',
    'stack_state','video_diff_runs'
  )
ORDER BY c.relname;
```
Expected: 10 rows, all `relrowsecurity = true`.

- [ ] **Step 4: Verify the policy exists**

```sql
SELECT polname, polroles::regrole[], polcmd
FROM pg_policy
WHERE polrelid = 'forge.issue_attachments'::regclass;
```
Expected: 1 row, `polname = authenticated_all`, role `authenticated`, `polcmd = *` (ALL).

- [ ] **Step 5: Verify idempotency by re-applying the migration**

Re-run `mcp__supabase__apply_migration` with the same name+query.
Expected: success (idempotent — `ALTER TABLE ... ENABLE RLS` is no-op when already enabled, and the `DO $$ EXCEPTION duplicate_object` block swallows the policy re-create error).

- [ ] **Step 6: Delete the branch**

Use `mcp__supabase__delete_branch` with the branch ID from Step 1.
Expected: success.

---

## Task 4: Commit Migration A

**Files:**
- Add: `supabase/migrations/20260507_forge_rls_lockdown.sql`

- [ ] **Step 1: Stage and commit**

```bash
git add supabase/migrations/20260507_forge_rls_lockdown.sql
git commit -m "$(cat <<'EOF'
feat(forge): WO-1 — RLS lockdown on 10 advisor-flagged tables

9 unused tables get RLS with no policies (service role bypasses).
forge.issue_attachments gets a permissive authenticated_all policy
since the dashboard reads it via anon-cookie auth client.

Validated on a temporary Supabase branch DB.
EOF
)"
```

Expected: commit succeeds.

---

## Task 5: Write Migration B — BIGINT widen

**Files:**
- Create: `supabase/migrations/20260507_forge_run_events_seq_bigint.sql`

- [ ] **Step 1: Verify no app code treats `seq` as a 32-bit int**

Run:
```bash
grep -rn "seq.*Int32\|Int32.*seq\|>> 0\|seq.*\\| 0" forge-orchestrator/src dashboard/src 2>/dev/null | grep -v node_modules
```
Expected: empty (no bitwise ops, no Int32 coercion). If non-empty, surface the matches before proceeding.

- [ ] **Step 2: Write the migration file**

```sql
-- 20260507_forge_run_events_seq_bigint.sql
-- WO-1: widen forge.run_events.seq from INT4 (max 2.1e9) to BIGINT (max ~9.2e18).
-- Date.now() in 2026 returns ~1.78e12, three orders past INT4 max.
-- Pre-fix: 808 lifetime runs produced 0 run_events rows; every insert silently
-- failed with "integer out of range" (error swallowed by .catch(()=>{})).

BEGIN;

ALTER TABLE forge.run_events ALTER COLUMN seq TYPE BIGINT;

COMMIT;
```

- [ ] **Step 3: Verify the file**

Run: `cat supabase/migrations/20260507_forge_run_events_seq_bigint.sql`
Expected: see the SQL above.

---

## Task 6: Test Migration B on a Supabase branch DB

**Files:** none

- [ ] **Step 1: Create a fresh branch**

Use `mcp__supabase__create_branch` with name `wo-1-bigint-test`. Capture project ref.

- [ ] **Step 2: Apply the BIGINT migration**

Use `mcp__supabase__apply_migration` with:
- `project_id`: branch project ref
- `name`: `20260507_forge_run_events_seq_bigint`
- `query`: contents of `supabase/migrations/20260507_forge_run_events_seq_bigint.sql`

Expected: success.

- [ ] **Step 3: Verify column type changed**

Use `mcp__supabase__execute_sql`:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'forge' AND table_name = 'run_events' AND column_name = 'seq';
```
Expected: `seq | bigint`.

- [ ] **Step 4: Insert a row with seq > INT4 max to prove the fix**

Need an existing `runs.id` for the FK. First fetch one:
```sql
SELECT id, company_id, agent_id FROM forge.runs LIMIT 1;
```
Then insert (replacing UUIDs from above):
```sql
INSERT INTO forge.run_events (company_id, run_id, agent_id, seq, event_type, stream)
VALUES (
  '<company_id>'::uuid,
  '<run_id>'::uuid,
  '<agent_id>'::uuid,
  2147483648,
  'wo1_bigint_test',
  'stdout'
)
RETURNING id, seq;
```
Expected: row inserted, `seq = 2147483648` returned. Cleanup: `DELETE FROM forge.run_events WHERE event_type = 'wo1_bigint_test';`

- [ ] **Step 5: Delete the branch**

Use `mcp__supabase__delete_branch` with the branch ID.

---

## Task 7: Commit Migration B

**Files:**
- Add: `supabase/migrations/20260507_forge_run_events_seq_bigint.sql`

- [ ] **Step 1: Stage and commit**

```bash
git add supabase/migrations/20260507_forge_run_events_seq_bigint.sql
git commit -m "$(cat <<'EOF'
feat(forge): WO-1 — widen forge.run_events.seq INT4 to BIGINT

Date.now() in 2026 (~1.78e12) overflows INT4 (max 2.1e9), causing
every run_events insert to silently fail and yielding 0 rows across
808 lifetime runs. Validated on a Supabase branch DB with an
overflow-value insert.
EOF
)"
```

---

## Task 8: Push branch and open PR

**Files:** none

- [ ] **Step 1: Push the feature branch**

```bash
git push -u origin feature/wo-1-preflight-cleanup
```
Expected: push succeeds.

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "WO-1: pre-flight cleanup (RLS + BIGINT + Telegram)" --body "$(cat <<'EOF'
## Summary
- RLS on 10 advisor-flagged tables in `forge.*` (9 service-role-only, 1 with permissive `authenticated_all` policy on `forge.issue_attachments`).
- `forge.run_events.seq` widened from INT4 to BIGINT to fix the silent-insert overflow.
- Telegram webhook activation: 4 secrets (added by Steve in Supabase dashboard) + redeploy.

Spec: [`docs/superpowers/specs/2026-05-07-wo-1-preflight-cleanup-design.md`](docs/superpowers/specs/2026-05-07-wo-1-preflight-cleanup-design.md)
Parent WO: [`docs/superpowers/work-orders/wo-1-pre-flight-cleanup.md`](docs/superpowers/work-orders/wo-1-pre-flight-cleanup.md)

## RLS exemptions
None — all 10 advisor-flagged tables have RLS enabled in this PR.

## Test plan
- [ ] Migrations applied to a Supabase branch DB and verified before merge.
- [ ] After merge: apply both migrations to production via `mcp__supabase__apply_migration`.
- [ ] Smoke `/`, `/issues`, `/issues/[id]`, `/inbox`, `/agents`, `/approvals` on prod URL — no 500s.
- [ ] BIGINT proof: insert `seq = 2147483648` into `forge.run_events` succeeds.
- [ ] Telegram: send test message to bot → row appears in `task_queue` within 5 sec.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned. Tag Steve for review.

- [ ] **Step 3: Wait for CI and Steve's approval**

Verify CI checks pass: `gh pr checks <PR-number>`
Wait for Steve's approval before proceeding to Task 9.

---

## Task 9: Apply migrations to production

**Files:** none

- [ ] **Step 1: Apply Migration A to production**

Use `mcp__supabase__apply_migration` with:
- `project_id`: `ncwxeeqvujgyiggkviqq` (production)
- `name`: `20260507_forge_rls_lockdown`
- `query`: contents of `supabase/migrations/20260507_forge_rls_lockdown.sql`

Expected: success.

- [ ] **Step 2: Verify post-state on production**

```sql
SELECT n.nspname, c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'forge'
  AND c.relname IN (
    'issue_attachments','tag_keywords','file_tag_mappings','tag_agent_mappings',
    'trigger_errors','run_ratings','gap_taxonomy','stage_artifacts',
    'stack_state','video_diff_runs'
  )
ORDER BY c.relname;
```
Expected: all 10 with `relrowsecurity = true`.

- [ ] **Step 3: Apply Migration B to production**

Use `mcp__supabase__apply_migration` with:
- `project_id`: `ncwxeeqvujgyiggkviqq`
- `name`: `20260507_forge_run_events_seq_bigint`
- `query`: contents of `supabase/migrations/20260507_forge_run_events_seq_bigint.sql`

Expected: success.

- [ ] **Step 4: Verify column type on production**

```sql
SELECT data_type FROM information_schema.columns
WHERE table_schema = 'forge' AND table_name = 'run_events' AND column_name = 'seq';
```
Expected: `bigint`.

---

## Task 10: Smoke test the dashboard against production

**Files:** none

- [ ] **Step 1: Open the production dashboard**

Navigate to `https://mcmforge.com/`. Confirm page loads without 500s.

- [ ] **Step 2: Smoke each affected route**

Verify each loads cleanly:
- `https://mcmforge.com/issues` — list view; attachment counts render in cards
- `https://mcmforge.com/issues/<some-id>` — pick any issue with attachments; verify the attachments list renders
- `https://mcmforge.com/inbox`
- `https://mcmforge.com/agents`
- `https://mcmforge.com/approvals`

Expected: all 200, attachments visible on at least one issue detail page.

- [ ] **Step 3: If anything 500s, roll back immediately**

For RLS rollback:
```sql
ALTER TABLE forge.issue_attachments DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON forge.issue_attachments;
```
Apply via `mcp__supabase__execute_sql` against production. Then surface the failure to Steve.

For BIGINT rollback (only safe if no row has `seq > 2147483647`):
```sql
ALTER TABLE forge.run_events ALTER COLUMN seq TYPE INT4;
```

---

## Task 11: Merge the PR

**Files:** none

- [ ] **Step 1: Confirm CI green and smoke tests passed**

Run: `gh pr checks <PR-number>`
Expected: all green.

- [ ] **Step 2: Merge**

```bash
gh pr merge <PR-number> --merge --delete-branch
```
Expected: merged, branch deleted.

- [ ] **Step 3: Switch back to main and pull**

```bash
git checkout main && git pull origin main
```

---

## Task 12: Capture Telegram values from the Mac Mini

**Files:** none (read-only on Mini)

- [ ] **Step 1: SSH to the Mini**

```bash
ssh dirtsyncmini@100.125.184.57 "grep '^TELEGRAM' /Users/dirtsyncmini/llama-3-agents/Apps/projects/MCMForge/dispatcher/.env"
```
(If the path on the Mini differs, find via `ssh dirtsyncmini@100.125.184.57 "find / -name '.env' -path '*dispatcher*' 2>/dev/null | head -3"`.)

Expected output (with real values, do not commit them):
```
TELEGRAM_BOT_TOKEN=<value>
TELEGRAM_CHAT_ID=<value>
```

- [ ] **Step 2: Capture SUPABASE_SERVICE_ROLE_KEY source**

The webhook also needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. These are typically auto-injected by Supabase Functions runtime. Confirm by checking Supabase docs or by leaving them unset on first deploy. If the deployed function errors on startup with "missing env", source them from `forge-orchestrator/.env` on the Mini:

```bash
ssh dirtsyncmini@100.125.184.57 "grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' /Users/dirtsyncmini/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator/.env"
```

- [ ] **Step 3: Hand the values to Steve**

Surface the four values (TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_IDS=<TELEGRAM_CHAT_ID value>, SUPABASE_URL if needed, SUPABASE_SERVICE_ROLE_KEY if needed) to Steve in chat. Do NOT write them to disk or commit them.

---

## Task 13: Steve adds secrets in Supabase dashboard (manual)

**Files:** none

- [ ] **Step 1: Direct Steve to the dashboard**

Tell Steve: open https://supabase.com/dashboard/project/ncwxeeqvujgyiggkviqq/functions and click on the `telegram-webhook` function → Secrets → add:
- `TELEGRAM_BOT_TOKEN` = (value from Task 12)
- `TELEGRAM_ALLOWED_CHAT_IDS` = (TELEGRAM_CHAT_ID value from Task 12, single ID is fine — comma-separated for multiple)
- `SUPABASE_URL` = (value from Task 12, only if not already auto-injected)
- `SUPABASE_SERVICE_ROLE_KEY` = (value from Task 12, only if not already auto-injected)

- [ ] **Step 2: Wait for Steve's confirmation**

Block until Steve says the secrets are saved. Do not proceed without confirmation.

---

## Task 14: Redeploy and verify the edge function

**Files:** none

- [ ] **Step 1: Verify Supabase CLI is logged in**

```bash
supabase projects list 2>&1 | head -5
```
Expected: list of projects including `ncwxeeqvujgyiggkviqq`. If "not logged in", run `supabase login` and retry.

- [ ] **Step 2: Redeploy the function**

```bash
supabase functions deploy telegram-webhook --project-ref ncwxeeqvujgyiggkviqq
```
Expected: "Deployed Function telegram-webhook" success message.

- [ ] **Step 3: Tail function logs to confirm clean startup**

```bash
supabase functions logs telegram-webhook --project-ref ncwxeeqvujgyiggkviqq --tail 2>&1 | head -20
```
Expected: no startup errors. (Alternatively use `mcp__supabase__get_logs` with `service: edge-function`.)

---

## Task 15: End-to-end Telegram test

**Files:** none

- [ ] **Step 1: Capture pre-state row count**

Use `mcp__supabase__execute_sql`:
```sql
SELECT COUNT(*) AS pre_count, MAX(created_at) AS latest FROM task_queue;
```
Save `pre_count`.

- [ ] **Step 2: Send a test message to the Telegram bot**

Tell Steve: open the Telegram bot conversation and send any test message (e.g. "WO-1 test").

- [ ] **Step 3: Within 5 seconds, query for the new row**

```sql
SELECT id, created_at, * FROM task_queue ORDER BY created_at DESC LIMIT 1;
```
Expected: the most recent row's `created_at` is within 5 seconds of the message send time, and the message content (or its derived fields) reflect Steve's test text.

- [ ] **Step 4: If no row appears, debug**

Check logs:
```bash
supabase functions logs telegram-webhook --project-ref ncwxeeqvujgyiggkviqq --tail 2>&1 | head -40
```
Common failure modes:
- 401: bot token wrong
- 403: chat ID not in `TELEGRAM_ALLOWED_CHAT_IDS`
- DB error: SUPABASE_URL/SERVICE_ROLE_KEY missing or wrong

---

## Task 16: Final DOD verification

**Files:** none

- [ ] **Step 1: Run the DOD checklist**

Confirm each item from the spec §8:

```sql
-- All 10 tables have RLS enabled
SELECT c.relname, c.relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'forge'
  AND c.relname IN ('issue_attachments','tag_keywords','file_tag_mappings',
    'tag_agent_mappings','trigger_errors','run_ratings','gap_taxonomy',
    'stage_artifacts','stack_state','video_diff_runs');
-- Expect: 10 rows, all relrowsecurity=true

-- issue_attachments has the policy
SELECT polname FROM pg_policy WHERE polrelid = 'forge.issue_attachments'::regclass;
-- Expect: 1 row, authenticated_all

-- run_events.seq is BIGINT
SELECT data_type FROM information_schema.columns
WHERE table_schema='forge' AND table_name='run_events' AND column_name='seq';
-- Expect: bigint
```

- [ ] **Step 2: Confirm Mini orchestrator unaffected**

```bash
ssh dirtsyncmini@100.125.184.57 "pm2 list | grep forge-orchestrator"
```
Expected: status `online`. If `errored` or `stopped`, investigate logs (`pm2 logs forge-orchestrator --lines 50`).

- [ ] **Step 3: Surface completion to Steve**

Post a one-line status: "WO-1 complete. RLS on 10 tables, BIGINT migration shipped, Telegram webhook live. PR #<n> merged. Mini orchestrator unaffected."
