# M1.3 — Pre-flight collision audit for Paperclip → forge ETL

**Date**: 2026-05-05
**Author**: Factory Upgrader (paired-coder, Steve+Claude)
**Verdict**: **CLEAR — proceed to M1.4 ETL with no design changes.**

This audit is gate #2 (after M1.2 snapshot) before the M1.4 ETL migration runs. PRD §M1.3: "Empty result OK; non-empty triggers M1.4 design tweak."

## Identifier collisions on `forge.issues.identifier`

Source: Paperclip `dirtsync-lab` instance (snapshot `paperclip-dirtsync-lab-2026-05-05.sql.gz`).

| What | Count | Detail |
|---|---|---|
| Paperclip DIR-* tickets to ETL | ~46 | `DIR-1` through `DIR-46` (per PRD) |
| Existing forge.issues with identifier `DIR-%` (non-DIRA) | **1** | `DIR-VAL-2` — the M0 PASSED exhibit |
| Identifier collision risk | **0** | `DIR-VAL-2` ≠ any of `DIR-1..46` |

**Conclusion**: No DIR-* identifier collisions. ETL can `INSERT` without a unique-key conflict.

## Existing DirtSync footprint in `forge` schema

For situational awareness during ETL design (not a collision blocker):

| forge table (DirtSync, `99338dee-…`) | Row count |
|---|---|
| `issues` | 273 (272 archived/cancelled DIRA-* + DIR-VAL-2) |
| `issue_comments` | 1,083 |
| `runs` | 560 (mostly historical orchestrator runs) |
| `goals` | 20 |
| `projects` | 1 |

The 273 existing rows are historical / archived; they will not interfere with the 46 new DIR-* tickets being inserted.

## Company UUID remap

| Source (Paperclip) | Destination (forge) |
|---|---|
| `2fbacee3-14cf-4526-b577-96d062ef71f2` | `99338dee-5fdc-4cbf-a344-5c08ec112a2b` |

Confirmed in dump payloads (run_events env vars carry the Paperclip company_id explicitly). ETL must rewrite every `company_id` reference during INSERT.

## Schema-shape diffs (Paperclip → forge)

**Forge has these tables; Paperclip has them too with compatible shape**:
- `companies`, `agents`, `issues`, `issue_comments`, `issue_attachments`, `goals`, `projects`, `approvals`

**Paperclip-only tables (DROP per PRD §"Drop entirely")**:
- `heartbeat_runs` (12,887 rows on source)
- `heartbeat_run_events` (13,358)
- `agent_wakeup_requests` (13,643)
- `execution_workspaces` / `workspace_operations` (446)
- `plugin_*` family
- `user`, `account`, `session`, `agent_api_keys`, `board_api_keys`
- `documents`
- `activity_log`
- `cost_events` (Paperclip per-event; forge tracks differently)

**Status enum mapping** (verified in dump payload tail) — Paperclip uses `backlog`, `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled`. Forge uses `backlog`, `todo`, `in_progress`, `review`, `blocked`, `done`, `cancelled`, `archived`, `completed`. The only delta is **`in_review` → `review`** — single-key rewrite in the ETL `CASE` clause. PRD §M1 ETL mapping table already captures this.

## Adapter mapping

| Source column | Destination column | Notes |
|---|---|---|
| `agents.adapter_type` | `forge.agents.adapter_type` | passthrough; Paperclip uses `claude_local`, forge uses `claude` — single rewrite |
| `agents.adapter_config` jsonb | `forge.agents.adapter_config` jsonb | passthrough |

## Dump format note (for ETL migration script author)

Paperclip dumps use `INSERT INTO ... VALUES ($paperclip$value$paperclip$, ...)` with a non-default dollar-quote tag. This is standard postgres syntax — `psql` replays them fine without preprocessing. The migration script in M1.4 should:

1. Restore the dump into a **scratch port-54331 instance** per `docs/runbooks/paperclip-archive.md`
2. Read rows from scratch instance via `psql --copy ...`
3. Transform (company_id remap, status enum normalize, adapter_type rename, drop heartbeat tables) in-process
4. INSERT INTO `forge.*` via Supabase service role

Do **not** point the ETL script at the live Paperclip 54330 instance — read from the snapshot copy instead, so M1.5 (pause Paperclip) doesn't race against ETL completion.

## FK conflicts

None. The forge schema does not back-reference any Paperclip-only column. Forge FKs (`issue_comments.issue_id`, `runs.agent_id`, etc.) are all internal to forge — ETL re-inserts with new forge UUIDs preserve referential integrity by chaining the inserts in dependency order: companies → projects → agents → goals → issues → issue_comments → issue_attachments → approvals.

## Approval to proceed to M1.4

| Gate | Status |
|---|---|
| No identifier collisions | ✅ |
| Schema shape verified compatible | ✅ |
| Status enum delta documented (`in_review`→`review`) | ✅ |
| Adapter rename documented (`claude_local`→`claude`) | ✅ |
| Snapshot exists at stable Mini path | ✅ (FORGE-343) |
| Dump format restorable via psql | ✅ |
| FK chain order documented | ✅ |

**Verdict**: M1.4 ETL migration cleared to proceed. No design tweak required.

## Related

- PRD: `docs/prd-mcm-forge-restructure-2026-05.md` §M1 ETL mapping table
- Tasklist: `docs/tasks-mcm-forge-restructure-2026-05.md` FORGE-344 (M1.3) → FORGE-345 (M1.4)
- Snapshot runbook: `docs/runbooks/paperclip-archive.md`
