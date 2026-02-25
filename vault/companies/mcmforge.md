# MCM Forge

> AI operations platform managing 5 companies from a single command center.
> This is the definitive reference for how MCM Forge works.

---

## Overview

| Field | Value |
|-------|-------|
| **Repo** | `golfballnut/mcmforge` |
| **Dashboard** | [mcmforge.com](https://mcmforge.com) (Vercel auto-deploy from `main`) |
| **Brain DB** | Supabase project `ncwxeeqvujgyiggkviqq` |
| **Agent Auth** | agent@mcmforge.com |
| **Email From** | ops@mcmforge.com (Resend, domain verified) |
| **Email To** | steve@linkschoice.com |
| **Status** | Active -- core infrastructure for all companies |

MCM Forge is Steve McMillian's AI operations platform. It orchestrates autonomous AI agents (Claude, Gemini, Codex) to perform code tasks, research, content creation, and ops checks across five companies: DirtSync, Links Choice, Golf Ball Nut, Hot Golf Brands, and MCM Forge itself. Steve sends tasks via Telegram or the dashboard. The dispatcher on a Mac Mini picks them up, routes them to the correct company repo and CLI, executes the work, creates PRs (for code tasks) or artifacts (for service tasks), and sends approval emails or research reports back to Steve.

---

## Tech Stack

### Dashboard (Next.js)
- **Framework:** Next.js 16.1.6, React 19.2.3
- **Styling:** Tailwind CSS v4
- **Fonts:** Geist Sans + Geist Mono (Google Fonts)
- **Auth:** Supabase SSR middleware -- redirects unauthenticated users to `/login`
- **Database Client:** `@supabase/ssr` for server components, `@supabase/supabase-js` for client components
- **Deployed on:** Vercel (auto-deploy from `main` branch)
- **Revalidation:** Server components use `revalidate = 30` (30-second ISR)

### Dispatcher (TypeScript)
- **Runtime:** Node.js via `tsx` (TypeScript execution)
- **Dependencies:** `@supabase/supabase-js`, `dotenv`, `tsx`
- **Runs on:** Mac Mini via PM2 (process #6 `mcmforge-dispatcher`)
- **Poll interval:** 300,000ms (5 minutes)
- **Max task duration:** 30 minutes (kills process via SIGTERM)
- **Cost caps:** $2 default, $5 ceiling per task

### Night-Ops (TypeScript)
- **Runtime:** Node.js via `tsx`
- **Runs on:** Mac Mini via PM2 with hourly cron
- **Health checks:** PM2 process status, stuck tasks, blocked tasks, open PRs
- **Daily brief:** Sent at 6 AM ET (11 UTC) via Resend email
- **Alerting:** Telegram notifications for any PM2 process down, stuck tasks, or blocked tasks

### Edge Functions (Deno)
- **Runtime:** Supabase Edge Functions (Deno)
- **Two functions deployed:** `telegram-webhook`, `approve-task`

### Database
- **Provider:** Supabase (PostgreSQL)
- **RLS:** Enabled on all tables
- **Vector support:** `agent_memory` table has `embedding` column (pgvector)

### Email
- **Provider:** Resend
- **Sender:** `MCM Forge <ops@mcmforge.com>` (domain verified)
- **Templates:** Dark-themed HTML emails with orange/blue accents, responsive layout

### Chat
- **Telegram bot** for task intake
- **Allowed chat IDs** configured via env var `TELEGRAM_ALLOWED_CHAT_IDS`

### AI CLIs
| CLI | Version | Flags | Best For |
|-----|---------|-------|----------|
| Claude Code | 2.1.39 | `--print --dangerously-skip-permissions` | Code tasks, complex reasoning |
| Gemini CLI | 0.29.7 | `-m gemini-3.1-pro-preview -y -p` | Research, parallel tasks |
| Codex CLI | 0.99.0 | `exec --dangerously-bypass-approvals-and-sandbox` | Fast code execution |

---

## Architecture

### Task Flow (End-to-End)

```
Steve sends message via Telegram or Dashboard
  |
  v
[Telegram Bot Webhook]  or  [Dashboard NewTaskForm]
  |                              |
  v                              v
Supabase Edge Function    Next.js Server Action
(telegram-webhook)        (createTask in actions.ts)
  |                              |
  +-------> task_queue <---------+
            (status: todo)
                |
                v
  [Dispatcher polls every 5 min]
  - Checks kill switch (system_config.dispatcher_status)
  - Queries task_queue WHERE status='todo' AND assigned_to='agent-executor'
  - Orders by priority (critical=1, high=2, medium=3, low=4), then created_at
  - Claims task (status -> in_progress)
                |
                v
  [Task Router]
  - code    -> executeCodeTask()   -> git branch + CLI + PR workflow
  - research -> executeServiceTask() -> CLI in scratch/repo dir + artifact storage
  - content  -> executeServiceTask() -> CLI + markdown artifact
  - ops      -> executeServiceTask() -> CLI + status report
  - chat     -> executeServiceTask() -> CLI + conversational response
                |
                v
  [CLI Spawner]
  - Resolves company slug -> repo directory via REPO_DIR_MAP
  - Spawns CLI binary (claude/gemini/codex) with appropriate flags
  - Captures stdout + stderr
  - Enforces 30-minute timeout (SIGTERM)
  - Extracts PR URL, PR number, Vercel preview URL from output
  - Cleans CLI boilerplate (box drawing chars, "Thinking...", etc.)
                |
                v
  [Post-Execution]
  - Code tasks: status -> "review", creates approval_queue entry with token
  - Service tasks: status -> "done", uploads artifact to Supabase Storage
  - Logs to communication_log
                |
                v
  [Notifications]
  - Telegram: completion message with PR/preview/artifact links
  - Email (code tasks): approval email with Approve & Reject buttons (one-tap)
  - Email (service tasks): full research/content report rendered as HTML
                |
                v
  [Approval Flow] (code tasks only)
  - Steve clicks Approve in email -> approve-task edge function
  - Edge function merges PR via GitHub API (squash merge)
  - Updates approval_queue status -> "approved"
  - Updates task_queue status -> "done"
  - OR: Steve clicks Reject -> task status -> "blocked"
```

### Company Routing

The dispatcher maps company slugs to local repo directory names:

```typescript
const REPO_DIR_MAP: Record<string, string> = {
  dirtsync: "DirtSync",
  mcmforge: "MCMForge",
};
```

For slugs not in the map, the dispatcher falls back to using the slug itself as the directory name. Repos are cloned under `REPO_BASE_DIR` (`/Users/dirtsyncmini` on Mac Mini).

Service tasks (research, content, ops, chat) use a `_scratch` directory unless a company repo exists, in which case they execute in the repo context.

### Kill Switch

The dispatcher checks `system_config` table for key `dispatcher_status` before every poll. If value is `"paused"`, it skips the poll cycle. The dashboard has a KillSwitch component on the main page that toggles this value via a server action.

---

## Dashboard Pages

The dashboard has 8 pages plus a login screen, all with a persistent sidebar navigation:

| Route | Page | Description |
|-------|------|-------------|
| `/` | Command Center | KPI cards (companies, approvals, in-progress, agents), task pipeline visualization, pending approvals list, recent tasks |
| `/companies` | Companies | Card grid of all 5 registered companies with domain, GitHub repo, Supabase project, deploy target |
| `/tasks` | Task Queue | Full task list with status/priority badges, New Task form (title, description, company, priority, type, CLI), summary stats |
| `/approvals` | Approvals | Pending approvals with Approve/Reject buttons, decision history with notes |
| `/agents` | Agent Roster | Agent cards showing type, CLI, machine, heartbeat, tasks completed, success rate |
| `/metrics` | Skill Metrics | Execution performance: total runs, success rate, avg time, total cost, recent executions table |
| `/research` | Research | New findings with urgency badges, recommendations, proposed actions, reviewed findings |
| `/briefs` | Daily Briefs | Today's COO brief with task list and metrics, past briefs archive |
| `/login` | Login | Email/password auth via Supabase, dark themed |

### Key Components

- **`Sidebar.tsx`** -- Responsive sidebar with mobile hamburger menu, navigation links with icons, user info + sign out
- **`KillSwitch.tsx`** -- Toggle button that pauses/resumes the dispatcher (green pulse when active, red when paused)
- **`NewTaskForm.tsx`** -- Expandable form to create tasks from the dashboard with company, priority, type, and CLI selectors

### Auth Flow

1. Middleware (`middleware.ts`) intercepts all requests
2. Creates Supabase server client with cookie-based auth
3. Unauthenticated users redirected to `/login`
4. Authenticated users on `/login` redirected to `/`
5. Layout renders Sidebar + main content only when user is authenticated

---

## Edge Functions

### telegram-webhook (v5)

**Purpose:** Multi-company task intake from Telegram messages.

**Message Format:**
```
[dirtsync] Fix map toolbar responsive layout #code #high #claude
Additional description on following lines.
```

**Parsing:**
- `[company]` tag -- routes to correct company (defaults to `mcmforge`)
- `#code|#research|#content|#ops|#chat` -- task type (defaults to `code`)
- `#critical|#high|#medium|#low` -- priority (defaults to `medium`)
- `#claude|#gemini|#codex` -- CLI target (defaults to `claude`)
- First line = title (tags and hashtags stripped)
- Remaining lines = description
- Photo attachments uploaded to Supabase Storage and linked as screenshot URL

**Security:** Only chat IDs in `TELEGRAM_ALLOWED_CHAT_IDS` env var are accepted.

### approve-task

**Purpose:** One-tap PR approval from email links.

**Flow:**
1. Receives GET request with `?token=UUID&action=approve|reject`
2. Looks up `approval_queue` by `approval_token`
3. Validates token exists and status is `pending`
4. On approve: merges PR via GitHub API (squash merge), updates approval + task status
5. On reject: sets task to `blocked`, updates approval status
6. Returns styled HTML response page

**GitHub integration:** Uses `GITHUB_TOKEN` env var to call `PUT /repos/{repo}/pulls/{number}/merge`.

---

## Dispatcher Features

### Multi-Company Routing
- `REPO_DIR_MAP` maps company slugs to local directory names
- Falls back to slug as directory name if not in map
- Validates repo directory exists before executing code tasks

### 3-CLI Support
Each CLI has its own argument format:
- **Claude:** `--print --dangerously-skip-permissions {prompt}`
- **Gemini:** `-m gemini-3.1-pro-preview -y -p {prompt}`
- **Codex:** `exec --dangerously-bypass-approvals-and-sandbox {prompt}`

### Task Type Router
- **Code tasks:** Build prompt with CLAUDE.md instructions, branch/PR requirements. Status flow: `todo -> in_progress -> review -> done` (after approval).
- **Service tasks (research/content/ops/chat):** Build prompt with output format instructions. Status flow: `todo -> in_progress -> done`. Output stored as markdown artifact in Supabase Storage.

### Prompt Engineering
- Code prompts include: task title, description, skill reference, and requirements (follow CLAUDE.md, create branch, run tests, create PR)
- Research prompts require: executive summary, key findings, data sources, recommendations, confidence level
- Content prompts require: proper markdown structure
- Ops prompts require: OK/WARNING/CRITICAL status, individual checks, recommended actions
- Chat prompts: conversational, concise responses

### Output Processing
- Extracts PR URLs from output via regex: `https://github.com/.*/pull/(\d+)`
- Extracts Vercel preview URLs: `https://*.vercel.app*`
- Cleans CLI boilerplate: box-drawing characters, "Thinking...", "Loaded cached credentials", etc.
- Finds content start by looking for first markdown header or substantial line (>80 chars)
- Summary = last 500 chars of cleaned output

### Markdown to HTML Renderer
The dispatcher includes a `markdownToHtml()` function that converts CLI markdown output to styled HTML for email reports. Handles headers (h1-h3), bold, italic, bullet points, numbered lists, and paragraph breaks.

### Notification System
- **Telegram:** Completion messages with task-type icons and links to PR/preview/artifact
- **Email (code tasks):** Dark-themed approval email with Approve & Merge / Reject buttons, task summary, PR + preview links
- **Email (service tasks):** Full research/content report rendered as formatted HTML email
- **Communication log:** All completions logged to `communication_log` table

### Kill Switch
Checks `system_config.dispatcher_status` before every poll cycle. If `"paused"`, logs a message and skips. Fail-open design: if the check errors, dispatcher keeps running.

---

## Night-Ops Features

### Hourly Health Checks
1. **PM2 Health:** Runs `pm2 jlist`, counts online vs errored processes
2. **Task Health:** Queries for stuck tasks (in_progress > 45 min), blocked tasks, active tasks, pending approvals
3. **Open PRs:** Runs `gh pr list` against DirtSync repo (needs expansion to all repos)

### Alert Conditions
- Any PM2 process not online
- Any task stuck in_progress for 45+ minutes
- Any task in blocked status

### Daily Brief (6 AM ET)
Compiles and emails:
- System status (PM2, active tasks, open PRs)
- Completed tasks in last 24 hours with PR links
- Pending approvals needing attention
- Alerts if any
- Stores brief in `daily_briefs` table

### Communication Logging
Every health check result logged to `communication_log` from `night-ops` agent.

---

## Mac Mini Infrastructure

| Property | Value |
|----------|-------|
| **SSH** | `ssh dirtsyncmini@100.125.184.57` (key: claude-warroom@mcmforge) |
| **PATH fix** | `export PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:/opt/homebrew/bin:$PATH` |
| **PM2** | Manages all processes; dispatcher is process #6 `mcmforge-dispatcher` |
| **Repo base** | `/Users/dirtsyncmini` (all company repos cloned here) |
| **Scratch dir** | `/Users/dirtsyncmini/_scratch` (for service task execution) |
| **SCP** | Works for file transfer |
| **CLIs installed** | Claude Code 2.1.39, Gemini CLI 0.29.7, Codex CLI 0.99.0 |

---

## Database Schema (Supabase)

All tables have RLS enabled. Brain DB project: `ncwxeeqvujgyiggkviqq`.

### Core Tables

#### task_queue (30 rows)
Central task management. Every task from Telegram or Dashboard lands here.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| company_id | uuid | FK -> company_registry |
| title | text | Required |
| description | text | Optional |
| skill_name | text | Optional skill reference |
| status | text | `todo`, `in_progress`, `review`, `approved`, `rejected`, `done`, `blocked` |
| priority | text | `critical`, `high`, `medium`, `low` |
| board | text | `agent`, `steve`, `coo`, `ashley`, `employee` |
| assigned_to | text | Usually `agent-executor` |
| cli_target | text | `claude`, `codex`, `gemini` |
| task_type | text | `code`, `research`, `content`, `ops`, `chat` |
| cost_cap | numeric | Default $2.00 |
| branch_name | text | Git branch for code tasks |
| pr_number | integer | GitHub PR number |
| pr_url | text | Full PR URL |
| preview_url | text | Vercel preview URL |
| result_summary | text | Last 500 chars of cleaned output |
| artifact_url | text | Supabase Storage URL for service task output |
| created_by | text | `telegram`, `steve`, `coo` |
| created_at | timestamptz | Auto |
| started_at | timestamptz | Set when claimed |
| completed_at | timestamptz | Set on completion |

#### company_registry (5 rows)
All managed companies.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | Display name |
| slug | text | Unique slug for routing |
| description | text | |
| github_repo | text | e.g. `golfballnut/DirtSync` |
| supabase_project_id | text | |
| domain | text | e.g. `dirtsync.app` |
| deploy_target | text | Default `vercel` |
| status | text | `planning`, `active`, `paused`, `archived` |

#### approval_queue (10 rows)
PR approval and other approval workflows.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| task_id | uuid | FK -> task_queue |
| company_id | uuid | FK -> company_registry |
| approval_type | text | `pr_merge`, `deploy`, `email_send`, `spending`, `new_company`, `strategy`, `task_completion` |
| title | text | |
| description | text | |
| preview_url | text | Vercel preview URL |
| screenshot_urls | text[] | |
| estimated_cost | numeric | |
| status | text | `pending`, `approved`, `rejected` |
| decided_by | text | |
| decided_at | timestamptz | |
| decision_notes | text | |
| approval_token | text | Unique, used in email links |
| pr_url | text | |
| pr_number | integer | |

#### agent_roster (4 rows)
Registered AI agents.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | Unique agent name |
| agent_type | text | `coo`, `builder`, `researcher`, `ops`, `qa` |
| cli_target | text | `claude`, `codex`, `gemini` |
| machine | text | Default `mac_mini_1` |
| status | text | `active`, `idle`, `offline`, `error` |
| current_task_id | uuid | |
| last_heartbeat | timestamptz | |
| tasks_completed | integer | |
| success_rate | numeric | |

### Supporting Tables

#### system_config (4 rows)
Key-value configuration. Used for kill switch (`dispatcher_status: active|paused`).

#### communication_log
Inter-agent and system communication records.

| Column | Type | Notes |
|--------|------|-------|
| from_agent | text | e.g. `dispatcher`, `night-ops` |
| to_agent | text | e.g. `steve` |
| channel | text | `war_room`, `email`, `telegram`, `internal`, `dashboard` |
| message | text | |
| company_id | uuid | FK -> company_registry |
| task_id | uuid | FK -> task_queue |

#### daily_briefs
COO daily briefings sent to Steve.

| Column | Type | Notes |
|--------|------|-------|
| brief_date | date | |
| recipient | text | Default `steve` |
| summary | text | |
| tasks | jsonb | Array of task objects |
| metrics | jsonb | PM2, task, PR metrics |
| status | text | `draft`, `sent`, `read` |
| email_sent_at | timestamptz | |

#### skill_metrics (0 rows)
Execution performance tracking for agent skills.

| Column | Type | Notes |
|--------|------|-------|
| skill_name | text | |
| company_id | uuid | FK |
| task_id | uuid | FK |
| cli_target | text | |
| model_used | text | |
| execution_time_ms | integer | |
| token_count | integer | |
| estimated_cost_cents | numeric | |
| success | boolean | |
| error_message | text | |
| code_quality_score | smallint | 0-100 |
| test_pass_rate | smallint | 0-100 |

#### agent_memory (0 rows)
Vector-enabled memory store for agent context. Has `embedding` column (pgvector).

| Column | Type | Notes |
|--------|------|-------|
| content | text | Full memory content |
| summary | text | Short summary |
| embedding | vector | For semantic search |
| category | text | Default `general` |
| tags | text[] | |
| importance | smallint | 1-10 |
| access_count | integer | |
| expires_at | timestamptz | Optional TTL |
| is_archived | boolean | |

#### agent_learnings (0 rows)
Post-mortem records from task executions.

| Column | Type | Notes |
|--------|------|-------|
| task_id | uuid | FK |
| outcome | text | `success`, `failure`, `partial`, `rejected` |
| what_happened | text | |
| root_cause | text | |
| fix_applied | text | |
| prevention_rule | text | |
| skill_name | text | |
| severity | text | `low`, `medium`, `high`, `critical` |
| was_applied_to_skill | boolean | |

#### research_findings (0 rows)
Intelligence gathered by research agents.

| Column | Type | Notes |
|--------|------|-------|
| topic | text | |
| source_url | text | |
| source_name | text | |
| finding | text | |
| recommendation | text | |
| urgency | text | `low`, `medium`, `high`, `critical` |
| proposed_action | text | |
| status | text | `new`, `reviewed`, `acted_on`, `dismissed` |
| reviewed_by | text | |

---

## File Structure

```
MCMForge/
  dashboard/
    src/
      app/
        page.tsx              # Command Center (home)
        layout.tsx            # Root layout with auth + sidebar
        actions.ts            # Server actions: toggleDispatcher, createTask
        globals.css           # Tailwind globals
        login/page.tsx        # Login page
        companies/page.tsx    # Company registry view
        tasks/page.tsx        # Task queue with New Task form
        approvals/
          page.tsx            # Approval management
          actions.ts          # approve/reject server actions
        agents/page.tsx       # Agent roster
        metrics/page.tsx      # Skill execution metrics
        research/page.tsx     # Research findings
        briefs/page.tsx       # Daily briefs
      components/
        Sidebar.tsx           # Navigation sidebar (responsive)
        KillSwitch.tsx        # Dispatcher pause/resume toggle
        NewTaskForm.tsx       # Task creation form
      lib/supabase/
        client.ts             # Browser Supabase client
        server.ts             # Server-side Supabase client
      middleware.ts           # Auth middleware (redirect to /login)
    package.json              # Next.js 16.1.6, React 19.2.3
  dispatcher/
    dispatcher.ts             # Main dispatcher (v2) -- polls, routes, executes, notifies
    night-ops.ts              # Hourly health checks + daily brief
    package.json              # tsx, @supabase/supabase-js, dotenv
    setup-env.sh              # Creates .env on Mac Mini
  supabase/
    functions/
      telegram-webhook/
        index.ts              # Telegram bot webhook (v5)
      approve-task/
        index.ts              # Email approval endpoint
  vault/
    INDEX.md                  # Master vault index (load first)
    companies/
      mcmforge.md             # This file
      linkschoice.md          # Links Choice profile
      dirtsync.md             # (planned)
      golfballnut.md          # Golf Ball Nut profile
      hotgolfbrands.md        # (planned)
    agents/
      skills/                 # Skill definitions (planned)
      bakeoff/                # Model comparison results (planned)
    competitors/              # Competitive intelligence (planned)
    decisions/                # ADR-style decision records (planned)
    intelligence/             # Accumulated research (planned)
  docs/
    PRD.json                  # Product requirements
    handoffs/                 # Session handoff notes
```

---

## Known Issues

1. **Night-ops is only a health checker** -- needs upgrade to full COO morning brief with action items, tech intel, competitive gaps, and money moves
2. **No vault/memory system wired to agents yet** -- vault files exist but agents don't load them before task execution. `agent_memory` table exists but has 0 rows.
3. **Gemini 3.1 Pro intermittent 429s** -- model capacity issue on Google's side, expected to stabilize
4. **DirtSync PRs 179-182 are stale** -- factory test PRs that need cleanup
5. **Night-ops only checks DirtSync PRs** -- `gh pr list` is hardcoded to `golfballnut/DirtSync`, needs multi-repo support
6. **REPO_DIR_MAP only has 2 entries** -- `dirtsync` and `mcmforge`. Other companies (linkschoice, golfballnut, hotgolfbrands) need entries if they get code tasks
7. **Telegram webhook hardcodes DirtSync for some flows** -- needs full company routing (fixed in v5 for task creation, but night-ops PR check still hardcoded)
8. **Dashboard approvals page approve action doesn't merge PRs** -- only updates DB status. The edge function `approve-task` does the actual GitHub merge, but the dashboard server action `approveItem` only sets status.
9. **skill_metrics has 0 rows** -- metrics tracking not yet wired into dispatcher execution flow
10. **agent_learnings has 0 rows** -- post-mortem system not yet implemented

---

## Companies Managed

- [[companies/dirtsync.md]] -- Trail navigation app (DirtSync)
- [[companies/linkschoice.md]] -- Recycled golf balls (Links Choice)
- [[companies/golfballnut.md]] -- Recycled golf ball ecommerce (Golf Ball Nut)
- [[companies/hotgolfbrands.md]] -- Bulk mesh bags (Hot Golf Brands)

---

## Skills System (Planned)

Reusable skill definitions that agents load before executing tasks:

- [[agents/skills/visual-bug-fix.md]] -- Screenshot analysis, UI bug identification and fix
- [[agents/skills/competitive-scan.md]] -- Crawl competitor site, diff against ours, produce gap report
- [[agents/skills/code-review.md]] -- Review PR quality before merge (security, performance, style)
- [[agents/skills/plan-then-code.md]] -- Plan implementation first (architecture, files, tests), then execute
- [[agents/skills/codebase-aware.md]] -- Load architecture context (file map, patterns, conventions) before coding

### Skill Dependency Graph
```
codebase-aware --> plan-then-code --> code-review --> PR merge decision
visual-bug-fix (standalone)
competitive-scan (standalone)
```

---

## Environment Variables

### Dispatcher (.env on Mac Mini)
| Variable | Description |
|----------|-------------|
| `MCMFORGE_SUPABASE_URL` | `https://ncwxeeqvujgyiggkviqq.supabase.co` |
| `MCMFORGE_SUPABASE_KEY` | Supabase anon key |
| `AGENT_EMAIL` | `agent@mcmforge.com` |
| `AGENT_PASSWORD` | Agent auth password |
| `POLL_INTERVAL_MS` | `300000` (5 min) |
| `REPO_BASE_DIR` | `/Users/dirtsyncmini` |
| `DEFAULT_COST_CAP` | `2` |
| `MAX_COST_CAP` | `5` |
| `MAX_DURATION_MINUTES` | `30` |
| `STEVE_EMAIL` | `steve@linkschoice.com` |
| `RESEND_API_KEY` | Resend API key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Steve's Telegram chat ID |

### Dashboard (Vercel env)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

### Edge Functions (Supabase secrets)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Auto-provided |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided |
| `TELEGRAM_BOT_TOKEN` | For sending confirmations |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Comma-separated allowed chat IDs |
| `GITHUB_TOKEN` | For PR merging in approve-task |

---

## Task Status Flow

```
todo --> in_progress --> review --> approved --> done  (code tasks, happy path)
                    \-> done                          (service tasks, automatic)
                    \-> blocked                       (failure or rejection)
```

Valid statuses: `todo`, `in_progress`, `review`, `approved`, `rejected`, `done`, `blocked`

---

*Last updated: 2026-02-24 by COO*
