# Paperclip Archive — Restore Runbook

**Snapshot date**: 2026-05-05 04:57 UTC (paperclipai @ 2026.416.0, instance `dirtsync-lab`)
**Source**: Paperclip's hourly auto-backup, copied to a stable archive location.
**Why retained**: ETL audit / disaster-recovery only. Paperclip is intentionally retired in M1.5 (FORGE-346). Do **not** restore as a runtime — restore only to inspect data.

## Snapshot details

| | |
|---|---|
| Mini path | `/Users/dirtsyncmini/MCMForge/backups/paperclip-dirtsync-lab-2026-05-05.sql.gz` |
| Drive path | _(manual upload pending — see "Upload to Drive" below)_ |
| Compressed size | 6,067,873 bytes (6.1 MB) |
| Uncompressed size | ~10 MB, 105,835 lines |
| sha256 | `002d4cd21764de763bf433aed587a719de55797a4adb812e82097f032e1ebd21` |
| DIR-* references inside | 3087 (smoke evidence DirtSync data is captured) |
| Source file (auto-backup) | `~/.paperclip/instances/dirtsync-lab/instances/default/data/backups/paperclip-20260505-045748.sql.gz` |
| Embedded postgres version | 18.3 (`@embedded-postgres/darwin-arm64`) |
| Original port | 54330 (loopback only) |

## Upload to Drive

Manual step (no agent, no auth dance — Steve does this once):

```bash
# From the Mini, scp the file off-machine, then drag into Drive web UI:
scp dirtsyncmini@100.125.184.57:/Users/dirtsyncmini/MCMForge/backups/paperclip-dirtsync-lab-2026-05-05.sql.gz ~/Downloads/

# Drive destination (recommended): forge/backups/paperclip-dirtsync-lab-2026-05-05.sql.gz
# Set Drive sharing to Steve-only (no link).
```

Update this runbook with the Drive URL after upload.

## How to restore (cold, scratch instance)

Restore into a fresh embedded postgres on a different port — do **not** restore over the live `forge` schema.

```bash
# 1. Spin up a scratch embedded postgres on port 54331 (different from live 54330)
mkdir -p /tmp/paperclip-restore/db
initdb --pgdata=/tmp/paperclip-restore/db --auth-local=trust
echo "port = 54331" >> /tmp/paperclip-restore/db/postgresql.conf
pg_ctl -D /tmp/paperclip-restore/db -l /tmp/paperclip-restore/postgres.log start

# 2. Create the paperclip role + database (the dump assumes both exist)
createuser -h localhost -p 54331 paperclip
createdb -h localhost -p 54331 -O paperclip paperclip

# 3. Replay the dump
gunzip -c /Users/dirtsyncmini/MCMForge/backups/paperclip-dirtsync-lab-2026-05-05.sql.gz \
  | psql -h localhost -p 54331 -U paperclip -d paperclip

# 4. Inspect (read-only — do not write here)
psql -h localhost -p 54331 -U paperclip -d paperclip -c "\dt public.*"
psql -h localhost -p 54331 -U paperclip -d paperclip -c "SELECT count(*) FROM public.issues WHERE identifier LIKE 'DIR-%';"

# 5. Tear down when done
pg_ctl -D /tmp/paperclip-restore/db stop
rm -rf /tmp/paperclip-restore
```

## What's in this snapshot

Schema mirrors Paperclip v2026.416.0 — see PRD §M1 ETL mapping table for the column-by-column shape we ported into `forge.*`. Tables we expect (not all may have rows):

- `companies` — DirtSync (UUID `2fbacee3-…`, distinct from forge `99338dee-…`)
- `agents` — 8 DirtSync specialists
- `issues` — 46 DIR-* tickets
- `issue_comments` — ~452 comments
- `issue_attachments` — count TBD
- `goals` — 2
- `projects` — 1
- `approvals` — 9
- Operational tables (NOT ported): `heartbeat_runs` (12,887), `heartbeat_run_events` (13,358), `agent_wakeup_requests` (13,643), `execution_workspaces` / `workspace_operations`, `plugin_*`, `user/account/session/*`, `documents`, `activity_log`, `cost_events`

## When to delete this snapshot

Retain ≥ 90 days post-M1.5 close (Paperclip permanent pause). Earliest delete: 2026-08-04. After that, delete the file from Mini + Drive together; update this runbook to mark `STATE: DELETED <date>` at the top.

## Related

- PRD: `docs/prd-mcm-forge-restructure-2026-05.md` §M1.2 + §M1.5 + §"Out of scope"
- Tasklist: `docs/tasks-mcm-forge-restructure-2026-05.md` FORGE-343 (M1.2), FORGE-346 (M1.5)
- Memory: `feedback_paperclip_workspace_block_missing_on_first_wake.md` (why we're leaving Paperclip)
