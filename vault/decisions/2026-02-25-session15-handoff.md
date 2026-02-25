# Session 15 Handoff — 2026-02-25

Branch: main (commit 68487ca + local changes in dispatcher/night-ops.ts)
Status: Dispatcher + night-ops STOPPED. Bake-off logic deployed but runaway bug fixed. Needs commit + restart.

---

## What Was Done This Session

### Bake-off + Smart Routing (night-ops.ts)
- Added CLI routing strategy to COO brain:
  - **High priority** → bake-off (same task sent to Claude + Gemini 3.1 Pro + Codex 5.3, scored on speed/PR/output)
  - **Medium/low** → smart routing (code→Claude, research→Gemini, ops→Codex)
- Added `bakeoff_group` UUID column to `task_queue` (migration applied)
- Added `createBakeoffTasks()` — creates linked tasks across all 3 CLIs
- Added `reviewBakeoffGroup()` — scores results when all CLIs finish, logs winner
- CLI routing table: `CLI_ROUTING` map + `getSmartCli()` helper
- Verified Codex config on Mac Mini: `gpt-5.3-codex` model, Gemini: `gemini-3.1-pro-preview`

### Runaway Loop Bug (FIXED)
- **Root cause**: `queueOvernightOps()` duplicate check only looked at `todo`/`in_progress` tasks. Completed tasks were invisible, so every hourly cycle re-created the same batch.
- **Fix**: Changed to query ALL tasks from last 24 hours regardless of status (`done`, `review`, `blocked`, `rejected` all count)
- **Impact before fix**: ~48 tasks executed overnight, ~$24-48 burned, 13 duplicate PRs, same 3 tasks repeated 8x each
- Fix deployed to Mac Mini but **not committed to git yet**

### Bake-off Results (from overnight run)
- **Claude wins every code bake-off** — fastest (0.7-2.6 min), always produces PRs, detailed summaries
- **Gemini**: fails ~50% on code tasks (exit code 1), good at research (0.7-17 min)
- **Codex**: fast (0.2 min) but often doesn't produce PRs, gets confused by dirty worktree
- Research routing to Gemini works well — OnX analysis and HMT validation both completed

### Trail Styling PR Assessment
- **PR #189** is the best candidate (first Claude attempt, pre-bakeoff)
- Spec compliance: 10/11 items correct
- **One bug**: dash pattern is `[6, 4]` instead of spec's `[7, 5]`
- **Junk files**: 645 lines of outlaw connectivity scripts committed that don't belong
- 13 duplicate PRs open (#189-#202) — need to close 12, keep and fix 1

---

## Current State

### Mac Mini (STOPPED)
- `mcmforge-dispatcher` — **stopped** (pm2 id 6)
- `mcmforge-night-ops` — **stopped** (pm2 id 7)
- Other 6 processes still online (dirtsync agents, github-runner)
- Fixed night-ops.ts deployed but processes intentionally stopped pending review

### DirtSync PRs (13 open — duplicates)
| PR | Branch | CLI | Status |
|----|--------|-----|--------|
| #189 | agent/outlaw-badges-legend | Claude | Best candidate — needs dash fix + junk removal |
| #190-#202 | various agent/* branches | Mixed | Duplicates — close all |

### Task Queue
- All tasks from overnight are in `done`/`review` status
- No `todo` or `in_progress` tasks remaining
- Bake-off results logged in `communication_log`

### Resend API Key
- Present in Mac Mini .env, working — emails sent all night
- Morning brief will work on next restart (was broken before Session 14 restart)

---

## Next Session TODO (Priority Order)

### 1. Commit + Push Session 15 Changes
- `dispatcher/night-ops.ts` has local changes (bake-off + dedup fix)
- Needs `git add dispatcher/night-ops.ts && git commit && git push`

### 2. Clean Up DirtSync PRs
- Close PRs #190-#202 (duplicates)
- Fix PR #189: change dash `[6, 4]` → `[7, 5]`, remove connectivity scripts
- Or create one clean PR from scratch

### 3. Restart Dispatcher + Night-Ops
- Both stopped, fix deployed, safe to restart
- Verify dedup fix works (COO should NOT re-create tasks that exist in last 24h)
- Monitor first 2-3 cycles to confirm no runaway

### 4. Bake-off Learnings → Routing Update
- Claude dominates code tasks — consider making Claude the only code CLI
- Gemini good for research — keep as default research router
- Codex struggles with dirty worktrees — needs clean branch checkout before spawn, or skip for code tasks
- Consider: bake-off only for NEW task types, not repeated ones

### 5. Trail Styling Review
- Steve needs to visually review the Vercel preview (requires Vercel login)
- Preview URL: `https://web-git-agent-outlaw-badges-legend-steve-mcmillians-projects.vercel.app/map`
- Check: difficulty colors, dashed outlaws, split pill badges, map legend

### 6. Outstanding from Session 14
- 1,650 trails need difficulty ratings
- 38 micro-fragments still visible
- Crowdsource UI (schema ready, endpoints needed)
- Offline maps architecture decision
- Map tile generation (tippecanoe recommended)

---

## Steve's Direction (Session 15)
- Wanted bake-off + smart routing across Claude, Gemini 3.1 Pro, Codex 5.3 (option C: both)
- Shut down dispatcher + night-ops after seeing runaway loop
- Wants clean trail styling PR reviewed before merge
- Morning brief emails working — was getting overnight emails

---

## Key Files Changed
- `dispatcher/night-ops.ts` — bake-off logic, smart routing, dedup fix (+160 lines)
- `vault/decisions/2026-02-25-session15-handoff.md` — this file

## DB Changes
- `task_queue.bakeoff_group` column added (UUID, nullable, indexed)
