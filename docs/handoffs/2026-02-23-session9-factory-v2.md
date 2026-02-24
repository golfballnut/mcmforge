# Session 9 Handoff — 2026-02-23

**Branch:** `feature/dispatcher` (extends existing)
**Build:** In progress
**Total output:** 3 new files, 2 modified files

---

## Decisions Made This Session

1. **Google Workspace:** Skip for now. GitHub + Supabase is sufficient.
2. **Budget cap:** $2/task default, $5 ceiling.
3. **COO always-on:** Yes, with guardrails. Test overnight on DirtSync tasks first.
4. **Superpowers:** Will install on Mac Mini projects.
5. **Not everything needs a PR:** Service tasks (research, content, ops, chat) go through Supabase + email/Telegram, not git.
6. **Agent pipeline autonomy:** Design→Plan→Execute→Test→Review runs automatically. COO only reviews final output, not every step.

---

## What Was Built

### 1. Dispatcher v2 (`dispatcher/dispatcher.ts`)
- **Task type routing:** `code`, `research`, `content`, `ops`, `chat`
- **Multi-CLI support:** Routes to `claude`, `gemini`, or `codex` based on `task.cli` field
- **Kill switch:** Checks `system_config.dispatcher_status` every poll cycle
- **Artifact storage:** Non-code task outputs uploaded to `artifacts` Supabase Storage bucket
- **Telegram notifications:** Sends completion messages with links
- **Email notifications:** Resend integration for code task approvals
- **Priority ordering:** Tasks sorted by priority then age
- **Scratch directory:** Service tasks run in `_scratch/` (or company repo if context needed)
- **Renamed env var:** `MCMFORGE_SUPABASE_KEY` (was `SERVICE_KEY` — prep for agent auth)

### 2. SQL Migration (`supabase/migrations/20260223_session9_factory_v2.sql`)
- `system_config` table (kill switch + global settings)
- `task_type` column on `task_queue` (code/research/content/ops/chat)
- `cli` column on `task_queue` (claude/gemini/codex)
- `cost_cap`, `result_summary`, `artifact_url` columns on `task_queue`
- `artifacts` storage bucket (public read, authenticated upload)
- Agent RLS policy templates (uncomment after creating agent@mcmforge.com)

### 3. Dashboard Kill Switch
- `KillSwitch.tsx` — Client component with animated status indicator
- `actions.ts` — Server action to toggle dispatcher_status in system_config
- Wired into Command Center header (top-right)
- Green pulsing dot when running, red when paused
- Hover reveals toggle action

---

## SQL Migration to Run

Run in **Brain Supabase SQL Editor** (ncwxeeqvujgyiggkviqq):
```
supabase/migrations/20260223_session9_factory_v2.sql
```

---

## Remaining Session 9 Tasks

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Upgrade dispatcher | COO | DONE |
| 2 | SQL migration | COO wrote, Steve runs | DONE (needs execution) |
| 3 | Kill switch UI | COO | DONE |
| 4 | Merge PR #4 + create agent@mcmforge.com | Steve | PENDING |
| 5 | Mac Mini setup (clone, env, pm2) | Steve + COO | BLOCKED on #4 |
| 6 | End-to-end test | Both | BLOCKED on #5 |

---

## Steve's Action Items

1. **Merge PR #4** on GitHub
2. **Run SQL migration** in Brain Supabase SQL Editor
3. **Create agent@mcmforge.com** in Supabase Auth dashboard
4. **SSH Mac Mini** — COO will provide exact commands
5. **Deploy dashboard** to Vercel (git push triggers auto-deploy)

---

## Architecture After This Session

```
Steve (CEO)
  ↕ War Room / Telegram / Email
COO (Claude)
  ↓ Creates tasks in brain DB
Brain DB (system_config + task_queue)
  ↓ Dispatcher polls every 5 min
Mac Mini
  ├─ Code tasks → claude/gemini/codex → git branch → PR → approval
  ├─ Research tasks → claude → artifact in Supabase Storage → Telegram/email
  ├─ Content tasks → claude → artifact → Telegram/email
  ├─ Ops tasks → claude → status report → Telegram
  └─ Chat tasks → claude → direct response → Telegram/email
```

---

## New Files

- `dashboard/src/app/actions.ts` — Kill switch server action
- `dashboard/src/components/KillSwitch.tsx` — Kill switch UI component
- `supabase/migrations/20260223_session9_factory_v2.sql` — Factory v2 schema

## Modified Files

- `dispatcher/dispatcher.ts` — Full rewrite to v2
- `dispatcher/.env.example` — Updated for new config vars
- `dashboard/src/app/page.tsx` — Kill switch wired in
