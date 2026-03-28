# MCM Forge v2 — Design Spec

> **For agentic workers:** This spec covers the full MCM Forge v2 system. It is decomposed into 4 plans, each independently implementable.

**Goal:** Transform MCM Forge from a flat task dispatcher into a full autonomous company operating system with persistent agent teams, org charts, multi-step workflows, interactive dashboard, and self-improvement — more powerful than Paperclip, purpose-built for Steve's 5 companies.

---

## Naming Convention (MCM Forge Language)

| Concept | MCM Forge Name | Description |
|---------|---------------|-------------|
| Quarterly goals | **Missions** | 90-day strategic objectives per company |
| Weekly measurables | **Vitals** | Scorecard metrics tracked weekly (features shipped, cost, success rate) |
| Daily sync | **War Room** | Automated daily standup — COO reviews agent status, surfaces blockers |
| Weekly strategic review | **Forge Sync** | Weekly interactive review — Steve reviews vitals, approves/redirects |
| Tasks/issues | **Orders** | Work items in the task_queue |
| Hiring an agent | **Forge** | Commission a new agent with identity, skills, budget |
| Org chart | **Chain of Command** | Hierarchical agent structure per company |
| Workflow pipeline | **Assembly Line** | Multi-step workflow template (plan → build → test → review → ship → promote) |
| Self-improvement agent | **The Scout** | Agent that watches external repos and proposes upgrades daily |

---

## System Architecture

### Infrastructure (All Existing — No New Purchases)

| Layer | Tool | Role |
|-------|------|------|
| Brain | Supabase (ncwxeeqvujgyiggkviqq) | All state: agents, orders, workflows, vitals, approvals, budgets |
| Dashboard | Vercel (mcmforge.com) | Interactive UI — see everything, control everything |
| Factory | Mac Mini (M2, PM2) | Agent execution — Claude/Gemini/Codex CLI processes |
| Code | GitHub | Repos, PRs, Issues (synced with orders) |
| Schedule | Google Calendar (gws CLI) | Calendar Bridge polls hourly, creates orders from events |
| Docs | Google Drive | Specs, brand guides, research artifacts |
| Data | Google Sheets | Structured data (POI, pricing, prospects) |
| Email | Resend | Escalation, approvals, briefs (DRAFT ONLY) |
| Chat | Telegram | Quick task intake, approval notifications |

### New Dashboard Dependencies (npm install)

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | ^5.90 | Auto-refresh, cache invalidation, optimistic updates |
| `@radix-ui/react-*` | latest | Accessible UI primitives (dialog, popover, dropdown, tabs) |
| `@dnd-kit/core` + `@dnd-kit/sortable` | latest | Kanban drag-and-drop |
| `lucide-react` | latest | Icon library (consistent with Paperclip patterns) |

---

## Plan 1: The Foundation

### New Supabase Tables

**`forge_agents`** — Persistent agent identities (replaces flat agent_roster)
- `id` UUID PK
- `name` TEXT (e.g., "Atlas" — the iOS Engineer)
- `role` TEXT (ceo, coo, cto, cmo, engineer, qa, analyst, content, scout)
- `title` TEXT (e.g., "iOS Engineer", "Video Creator")
- `company_id` UUID FK → company_registry
- `reports_to` UUID FK → forge_agents (nullable for CEO)
- `model` TEXT (e.g., "opus-4", "sonnet-4", "gemini-2.5-flash")
- `adapter` TEXT (claude, gemini, codex)
- `skills` TEXT[] (array of skill names this agent has)
- `identity_prompt` TEXT (the agent's persona/heartbeat instructions)
- `budget_monthly_cents` INTEGER (default 5000 = $50)
- `spent_monthly_cents` INTEGER (default 0, reset monthly)
- `status` TEXT (active, paused, budget_exceeded, terminated)
- `heartbeat_cron` TEXT (nullable — e.g., "0 */4 * * *" for every 4 hours)
- `last_heartbeat_at` TIMESTAMPTZ
- `current_order_id` UUID FK → task_queue (nullable)
- `tasks_completed` INTEGER (default 0)
- `tasks_failed` INTEGER (default 0)
- `created_at` TIMESTAMPTZ
- `forged_by` UUID FK → forge_agents (which agent created this one)

**`missions`** — Quarterly goals per company
- `id` UUID PK
- `company_id` UUID FK → company_registry
- `title` TEXT (e.g., "Ship 26 DirtSync features by April 30")
- `description` TEXT
- `quarter` TEXT (e.g., "2026-Q2")
- `status` TEXT (active, completed, abandoned)
- `progress_pct` INTEGER (0-100)
- `owner_agent_id` UUID FK → forge_agents
- `due_date` DATE
- `created_at` TIMESTAMPTZ

**`vitals`** — Weekly scorecard entries
- `id` UUID PK
- `company_id` UUID FK → company_registry
- `week_start` DATE
- `metric_name` TEXT (e.g., "features_shipped", "pr_merge_rate", "cost_per_feature")
- `metric_value` NUMERIC
- `target_value` NUMERIC (nullable)
- `trend` TEXT (up, down, flat)
- `created_at` TIMESTAMPTZ

**`assembly_lines`** — Workflow templates
- `id` UUID PK
- `company_id` UUID FK → company_registry
- `name` TEXT (e.g., "Feature Ship Pipeline", "Content Promotion Pipeline")
- `trigger_type` TEXT (calendar, manual, on_merge, on_approval)
- `steps` JSONB (array of step definitions — see below)
- `is_active` BOOLEAN
- `created_at` TIMESTAMPTZ

Steps JSONB structure:
```json
[
  {"step": 1, "name": "Plan", "agent_role": "cto", "skill": "plan-then-code", "auto_advance": false},
  {"step": 2, "name": "COO Review", "agent_role": "coo", "skill": "plan-reviewer", "auto_advance": false},
  {"step": 3, "name": "Build", "agent_role": "engineer", "skill": "tdd-workflow", "auto_advance": true},
  {"step": 4, "name": "QA", "agent_role": "qa", "skill": "code-review", "auto_advance": true},
  {"step": 5, "name": "Ship", "agent_role": "coo", "skill": "shipping-checklist", "auto_advance": false},
  {"step": 6, "name": "Promote", "agent_role": "content", "skill": "social-post", "auto_advance": true}
]
```

**`assembly_runs`** — Active workflow instances
- `id` UUID PK
- `assembly_line_id` UUID FK → assembly_lines
- `source_order_id` UUID FK → task_queue (the triggering order)
- `current_step` INTEGER
- `status` TEXT (running, paused, completed, failed)
- `step_history` JSONB (array of completed step results)
- `started_at` TIMESTAMPTZ
- `completed_at` TIMESTAMPTZ

**`agent_heartbeats`** — Execution log per agent per run
- `id` UUID PK
- `agent_id` UUID FK → forge_agents
- `order_id` UUID FK → task_queue
- `assembly_run_id` UUID FK → assembly_runs (nullable)
- `step_number` INTEGER (nullable)
- `started_at` TIMESTAMPTZ
- `ended_at` TIMESTAMPTZ
- `tokens_input` INTEGER
- `tokens_output` INTEGER
- `cost_cents` INTEGER
- `status` TEXT (running, succeeded, failed)
- `output_summary` TEXT
- `transcript_url` TEXT (nullable — link to full log in storage)

### Calendar Bridge

A new dispatcher module (`dispatcher/calendar-bridge.ts`) that:
1. Polls Google Calendar every hour for DirtSync events (and other companies)
2. Filters events that look like feature tasks (exclude "Daily Data Check", birthdays, etc.)
3. For each qualifying event not already in task_queue:
   - Creates a task_queue row with title, description from event, due date from event start
   - Sets `task_type` based on keywords (code features → "code", content → "content")
   - Assigns to the company's CTO agent (who will create the plan)
   - Triggers the Feature Ship assembly line
4. Updates calendar event with link to task/PR when work completes

### Dispatcher v8 Changes

The existing dispatcher.ts gets these upgrades:
1. **Agent-aware routing**: Instead of picking any available CLI, look up the assigned `forge_agent` and use their `adapter` + `model` + `identity_prompt`
2. **Assembly line support**: When a task completes, check if it's part of an assembly_run. If so, advance to next step (create next sub-task, assign to next agent)
3. **Budget enforcement**: Before executing, check `spent_monthly_cents < budget_monthly_cents`. If exceeded, pause agent and escalate.
4. **Heartbeat logging**: Record every execution in `agent_heartbeats` with tokens, cost, duration
5. **Atomic checkout**: Use `SELECT ... FOR UPDATE SKIP LOCKED` when picking tasks to prevent double-claiming

---

## Plan 2: The Dashboard

### New Pages

1. **`/agents/[id]`** — Agent Detail (click-through from agent cards)
   - Tabs: Overview | Recent Orders | Configuration | Budget
   - Overview: status, current order, skills, heartbeat schedule, vitals
   - Recent Orders: last 20 executions with status, duration, cost
   - Configuration: editable identity_prompt, skills[], model, budget
   - Budget: monthly spend chart, utilization bar, tokens used

2. **`/vitals`** — Company Vitals Dashboard (replaces metrics)
   - Date range picker (7d, 30d, 90d)
   - Vitals cards: features shipped, success rate, cost per feature, active agents
   - Trend charts (hand-rolled CSS flexbox bars like Paperclip)
   - Spend by agent breakdown
   - Spend by company breakdown

3. **`/chain`** — Org Chart Visualization
   - Interactive tree diagram showing agent hierarchy
   - Click agent node → navigate to agent detail
   - Status dots on each node (green/amber/red)
   - "Forge New Agent" button at each level

4. **`/inbox`** — Unified Inbox (replaces approvals + briefs + research)
   - Tabs: All | Needs Action | Orders | Approvals | Intel
   - Pending approvals with inline approve/reject
   - Failed runs with error details
   - New research findings
   - Unread badge count in sidebar nav + browser tab title

### Upgraded Pages

5. **`/`** (Home/War Room) — Add clickable KPIs, trend arrows, time range selector
6. **`/tasks`** — Add Kanban view toggle, filtering by status/agent/company, bulk actions
7. **`/agents`** — Agent cards become clickable, link to `/agents/[id]`

### New Components

- `AgentDetailTabs.tsx` — Tabbed agent detail view
- `VitalsChart.tsx` — Hand-rolled CSS bar charts (no chart library)
- `OrgChartTree.tsx` — Hierarchical tree with SVG connectors
- `InboxFeed.tsx` — Unified inbox with category tabs
- `KanbanBoard.tsx` — Drag-and-drop Kanban with dnd-kit
- `ForgeAgentDialog.tsx` — Modal for creating new agents
- `BudgetBar.tsx` — Utilization bar component
- `DateRangePicker.tsx` — 7d/30d/90d selector

### Real-Time Upgrades

- Install `@tanstack/react-query` for client-side data fetching with auto-refetch
- Expand Supabase Realtime subscriptions from War Room to all pages
- Add `useRealtimeQuery` hook wrapping React Query + Supabase subscription

---

## Plan 3: The Forge (Agent Hiring + Workflows)

### Cascade Agent Creation

When Steve (or COO) creates the first CEO agent for a company:
1. CEO agent gets a special `identity_prompt` that includes instructions for building the team
2. CEO's first heartbeat: reads company context, creates a hiring plan
3. CEO creates "Forge CTO" and "Forge CMO" orders in task_queue
4. COO (or Steve) approves the hiring requests
5. Dispatcher creates the new agents in forge_agents with the CEO as `forged_by`
6. New agents' first heartbeat: read their identity, check for orders, start working

### Forge Agent API

New server action (`dashboard/src/app/actions/forge.ts`):
- `forgeAgent(data)` — Creates new agent in forge_agents, sets up identity_prompt
- `terminateAgent(id)` — Sets status to terminated, reassigns any open orders
- `pauseAgent(id)` / `resumeAgent(id)` — Toggle agent status
- `updateAgentConfig(id, data)` — Update skills, model, budget, identity_prompt

### Assembly Line Execution

The dispatcher manages assembly line flow:
1. Order created with `assembly_line_id` set
2. `assembly_runs` row created with `current_step = 1`
3. First step's agent gets the order assigned
4. On completion, dispatcher checks `auto_advance`:
   - If true: automatically create next sub-order and assign to next agent
   - If false: create approval request, wait for Steve/COO
5. When all steps complete, assembly_run status → completed

---

## Plan 4: The Scout

### Forge Scout Agent

A dedicated agent (`role: scout`) that runs daily at 3 AM:
1. Checks GitHub releases/commits for watched repos:
   - `paperclipai/paperclip` — orchestration patterns
   - `anthropics/claude-code` — CLI updates
   - `nicepkg/superpowers` — new skills
   - `jlowin/agency-agents` — agent patterns
2. Compares changes against MCM Forge capabilities
3. Creates structured proposals as orders:
   - What changed in the external repo
   - How it could benefit MCM Forge
   - Estimated effort
   - Priority recommendation
4. Routes proposals to COO for approve/reject

---

## DirtSync Org Chart (First Deploy)

| Agent Name | Role | Title | Model | Adapter | Reports To | Skills |
|------------|------|-------|-------|---------|------------|--------|
| Steve | board | CEO | - | - | - | - |
| Forge (COO) | coo | Chief Operating Officer | opus-4 | claude | Steve | daily-ops, plan-reviewer, revenue-analyst, shipping-checklist |
| Architect | cto | Chief Technology Officer | opus-4 | claude | Forge | plan-then-code, codebase-aware, feature-proposal, code-review |
| Signal | cmo | Chief Marketing Officer | gemini-2.5-flash | gemini | Forge | social-intel, youtube-niche-monitor, app-store-monitor, competitive-scan |
| Swift | engineer | iOS Engineer | sonnet-4 | claude | Architect | tdd-workflow, visual-bug-fix, codebase-aware |
| Edge | engineer | Backend Engineer | sonnet-4 | claude | Architect | tdd-workflow, plan-then-code, codebase-aware |
| Sentinel | qa | QA Engineer | sonnet-4 | claude | Architect | code-review, shipping-checklist, visual-bug-fix |
| Lens | content | Video Creator | gemini-2.5-flash | gemini | Signal | - |
| Pulse | content | Social Media Manager | gemini-2.5-flash | gemini | Signal | social-intel |
| Trailkeeper | analyst | Trail Data Engineer | sonnet-4 | claude | Forge | poi-research, trail-closure-monitor |
| Radar | scout | Forge Scout | sonnet-4 | claude | Forge | github-repo-scout, skill-gotchas-flywheel |

---

## Feature Ship Assembly Line (DirtSync Default)

```
Step 1: Plan (CTO Architect) → plan-then-code
Step 2: COO Review (COO Forge) → plan-reviewer [manual gate]
Step 3: Build (iOS Engineer Swift OR Backend Engineer Edge) → tdd-workflow
Step 4: QA (QA Engineer Sentinel) → code-review + visual-bug-fix
Step 5: Ship (COO Forge) → shipping-checklist [manual gate → Steve approves]
Step 6: Promote (Social Media Manager Pulse) → social post draft [manual gate]
```

---

## Success Criteria

1. Calendar events auto-flow into task_queue within 1 hour
2. Agents execute orders using their specific identity, skills, and model
3. Workflows advance automatically through steps (with manual gates where configured)
4. Dashboard shows real-time agent status, cost, and workflow progress
5. Steve can approve/reject from phone (dashboard + Telegram)
6. Scout agent proposes at least one improvement per week
7. Per-agent budgets prevent runaway spend
8. DirtSync ships its first calendar-driven feature end-to-end through the assembly line
