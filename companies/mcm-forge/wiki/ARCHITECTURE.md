# MCM Forge Architecture

## Dashboard
- **Stack:** Next.js on Vercel (mcmforge.com)
- **Pages:** 24 routes, dark theme (#0d1117 bg, #00d4aa accent)
- **Deploy:** Auto-deploys from `main`, PRs get preview URLs
- **Auth:** Supabase Auth, company-scoped via cookie

## Orchestrator
- **Stack:** Node.js on Mac Mini via PM2
- **5 Loops:**
  - `run-executor` — 5s poll, spawns CLI sessions for queued runs
  - `heartbeat` — 30s poll, wakes agents on schedule
  - `routine` — 60s poll, triggers cron-scheduled tasks
  - `mention-watcher` — 30s poll, detects @-mentions in issue comments
  - `orphan-reaper` — 60s poll, cancels stuck/orphaned runs
- **Process:** PM2 managed, auto-restart on crash

## Agent API
- **URL:** localhost:3200
- **7 REST Endpoints:**
  - `POST /api/agent/delegate` — create issue + assign to another agent
  - `POST /api/agent/comment` — add comment to an issue
  - `POST /api/agent/status` — update agent status
  - `GET  /api/agent/inbox` — fetch assigned issues
  - `POST /api/agent/complete` — mark issue done
  - `POST /api/agent/request-approval` — escalate to human
  - `GET  /api/agent/context` — fetch wiki + memory
- **Auth:** X-Forge-Agent-Id header required on all requests

## Database
- **Provider:** Supabase
- **Project:** ncwxeeqvujgyiggkviqq
- **Schema:** forge
- **14 Tables:** companies, projects, agents, issues, issue_comments, runs, run_events, cost_events, routines, routine_runs, wakeup_requests, approvals, goals, execution_workspaces
- **Access:** PostgREST exposes `public,graphql_public,forge`

## CLIs (Mac Mini)
- **Claude** (Max/Opus) — COO agent, strategic work
- **Codex** (Pro/GPT-5.3) — Builder agent, implementation
- **Gemini** (Ultra/Gemini 3) — QA/Reviewer agent, code review + testing
- All run in tmux sessions managed by orchestrator

## Deploy Pipeline
1. Agent creates PR on `agent/<slug>` branch
2. Vercel builds preview URL automatically
3. Human (or QA agent) reviews
4. Merge to `main` triggers production deploy
