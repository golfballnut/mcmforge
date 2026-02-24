# Session 10 Handoff — 2026-02-23

**Branch:** `main` (a016e62)
**Status:** Dispatcher LIVE on Mac Mini, first real bug fix merged to DirtSync production

---

## What Was Done

### 1. PR #4 Merged
- Factory v2 dispatcher, kill switch, multi-task routing — all on main

### 2. Agent Auth Created
- `agent@mcmforge.com` in Supabase Auth
- UUID: `d97d1ec0-60d5-47c2-b827-8d5d9dfb8a58`
- RLS policies: agent can SELECT task_queue, UPDATE task_queue, INSERT approval_queue, SELECT/UPDATE system_config
- Password rotated after accidental leak in setup script (GitGuardian resolved)

### 3. Dispatcher Auth Fix
- Added `signInWithPassword` on startup so `auth.uid()` is set for RLS
- New env vars: `AGENT_EMAIL`, `AGENT_PASSWORD`

### 4. Mac Mini Deployment
- Repo cloned to `~/MCMForge/dispatcher/`
- `.env` configured with all credentials
- `pm2 start` — process #6 `mcmforge-dispatcher`, saved for auto-restart
- Dispatcher authenticates, connects, polls every 5 min

### 5. E2E Test Passed
- Research task inserted → dispatcher picked up → Claude ran → artifact stored in Supabase Storage → 12 seconds

### 6. First Real Code Fix (DirtSync)
- Bug: Map toolbar jumbled at narrow viewports
- Task inserted → dispatcher picked up → Claude fixed responsive CSS in 4.1 min
- PR #183 created on golfballnut/DirtSync → Vercel preview verified → Steve approved → merged
- Second task (POI search fix) queued and running

### 7. Dashboard Task Creation UI
- New Task form on mcmforge.com/tasks
- Fields: title, description, company, priority, type (code/research/content/ops/chat), CLI (claude/gemini/codex)
- Auto-assigns to `agent-executor`, status `todo`
- Server action in `dashboard/src/app/actions.ts`

---

## Architecture (Live)

```
Steve (CEO)
  ↕ mcmforge.com dashboard (New Task form)
  ↕ War Room (Claude sessions)
Brain DB (ncwxeeqvujgyiggkviqq)
  ↓ task_queue (status=todo, assigned_to=agent-executor)
Mac Mini (100.125.184.57)
  ├─ pm2 process #6: mcmforge-dispatcher
  ├─ Authenticates as agent@mcmforge.com
  ├─ Polls every 5 min
  ├─ Code tasks → claude --print --dangerously-skip-permissions → branch → PR
  ├─ Research/service tasks → claude → artifact → Supabase Storage
  └─ DirtSync repo at ~/DirtSync (CLAUDE.md, skills, hooks, gates all present)
```

---

## Known Issues

1. **Dispatcher doesn't capture PR URL** — Claude creates the PR but the dispatcher doesn't parse the URL from output to store in `task_queue.pr_url`
2. **No email notifications yet** — Resend integration exists in code but no approval email flow
3. **No Telegram intake** — Tasks must be created via dashboard or SQL
4. **Self-review problem** — `golfballnut` account creates PRs, can't self-approve. Need separate review bot or admin-merge workflow
5. **Task queue has old kanban tasks** — They're not status=todo so dispatcher ignores them, but should be cleaned up

---

## Session 11 Priorities

### P1: Email Approval Flow
- After Claude opens a PR, capture the Vercel preview URL
- Send Steve an email via Resend with: task summary, before/after screenshots, Vercel preview link, Approve/Reject buttons
- Approve click → merge PR via webhook/edge function
- Reject click → task back to queue with feedback

### P2: Dispatcher PR URL Capture
- Parse Claude's stdout for `gh pr create` output or GitHub PR URLs
- Store in `task_queue.pr_url` and `pr_number`

### P3: Telegram Intake
- Telegram bot webhook → Supabase Edge Function
- Parses message (text + optional image) → creates task in task_queue
- Steve sends "POI search broken" + screenshot → task auto-created

### P4: Skill Auditor
- Ops task that runs on schedule
- Scans `.claude/skills/*/SKILL.md` in each company repo
- Checks YAML frontmatter conformance per Anthropic spec (name, description required)
- Files fix tasks for non-conforming skills

### P5: Approval Flow on Dashboard
- Approvals page should show pending PRs with preview links
- One-click approve/reject from mcmforge.com

---

## Key Files

| File | Purpose |
|------|---------|
| `dispatcher/dispatcher.ts` | Main dispatcher (v2, with agent auth) |
| `dispatcher/.env.example` | Env template (password placeholder only) |
| `dispatcher/setup-env.sh` | Mac Mini setup script (password stripped) |
| `dashboard/src/app/actions.ts` | Server actions (kill switch + task creation) |
| `dashboard/src/components/NewTaskForm.tsx` | Task creation form |
| `dashboard/src/components/KillSwitch.tsx` | Kill switch toggle |
| `dashboard/src/app/tasks/page.tsx` | Tasks page with form |
| `supabase/migrations/20260223_session9_factory_v2.sql` | Schema migration |

---

## Credentials & Access

- **Brain Supabase:** ncwxeeqvujgyiggkviqq (us-east-1)
- **Agent UUID:** d97d1ec0-60d5-47c2-b827-8d5d9dfb8a58
- **Mac Mini:** dirtsyncmini@100.125.184.57 (via Tailscale)
- **Dashboard:** mcmforge.com (Vercel auto-deploy from main)
- **DirtSync repo:** golfballnut/DirtSync (gh auth active on Mac Mini)
