# BUILD PROMPT: MCM Forge Orchestrator

Paste this entire prompt into a new Claude Code session to start building.

---

## Mission

Build the MCM Forge Orchestrator — a Paperclip clone that manages AI coding agents. It has three components:

1. **Supabase schema** — 14 tables for agents, issues, runs, routines, costs
2. **Mac Mini orchestrator** — Node.js process that polls Supabase, spawns `claude`/`gemini`/`codex` CLIs
3. **Next.js dashboard on Vercel** — pixel-perfect copy of Paperclip's UI at mcmforge.com

## Your Resources

### Project Plan (1,654 lines — read this FIRST)
`/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/docs/mcm-forge-orchestrator-plan.md`

This contains:
- Full Supabase SQL schema (14 tables, indexes, RLS, ready to apply)
- Mac Mini orchestrator architecture (4 concurrent loops, adapter interface, process management)
- Dashboard page routes and components
- Agent definition format
- 5 build phases with deliverables
- Migration path from Paperclip

### Paperclip UI Screenshots (23 pages — your gold standard)
`/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/qa-screenshots/paperclip-reference/`

Every page of the Paperclip dashboard captured pixel-perfect:
- `paperclip-dashboard.png` — home with agent cards, stats bar
- `paperclip-issues.png` — issue board with filters, priority colors
- `paperclip-issue-detail.png` — issue detail with comments, properties
- `paperclip-agents.png` — agent list with hierarchy, status indicators
- `paperclip-agent-detail.png` — agent dashboard with charts
- `paperclip-agent-instructions.png` — AGENTS.md file editor
- `paperclip-agent-configuration.png` — adapter config form
- `paperclip-agent-runs.png` — run history with tokens, prompts
- `paperclip-agent-skills.png` — skills list
- `paperclip-agent-budget.png` — spend tracking
- `paperclip-org.png` — org chart (React Flow tree)
- `paperclip-skills.png` — skills registry
- `paperclip-routines.png` — routine list with schedules
- `paperclip-routine-detail.png` — routine config with triggers
- `paperclip-costs.png` — cost dashboard
- `paperclip-activity.png` — activity timeline
- `paperclip-goals.png` — goals hierarchy
- `paperclip-projects.png` — project cards
- `paperclip-inbox.png` — notification inbox
- `paperclip-settings.png` — general settings
- `paperclip-settings-heartbeats.png` — heartbeat config
- `paperclip-settings-experimental.png` — feature flags
- `paperclip-settings-plugins.png` — plugin manager

**Read the screenshots with the Read tool before building each page. Match the layout, colors, typography, and component patterns exactly.**

### Existing MCM Forge App
- Repo: `/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/`
- Web app: `/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/web/` (Next.js on Vercel)
- Supabase project: `ncwxeeqvujgyiggkviqq` (MCM Forge)
- Dashboard URL: mcmforge.com
- Deploy: auto-deploy from `main` branch via Vercel

### Supabase MCP
Use `mcp__supabase__execute_sql` with `project_id: "ncwxeeqvujgyiggkviqq"` for all database operations.
Use `mcp__supabase__apply_migration` for schema changes.

## How to Work

### Use Plans
1. Before each phase, enter plan mode and create a plan
2. Get approval before building
3. Update the plan as you go — check off completed items, note changes

### Use Agents
1. For each phase, spawn agent teams to parallelize work
2. Give each agent DIFFERENT files (no merge conflicts)
3. Commit between agent spawns
4. Agent teams: use `subagent_type: "general-purpose"` with `isolation: "worktree"` for safe parallel work

### Update the Master Plan
After completing each phase, update `docs/mcm-forge-orchestrator-plan.md`:
- Mark the phase as DONE with date
- Note any deviations from the plan
- Update the next phase if learnings changed the approach

## Build Phases

### Phase 1: Supabase Schema + Core Orchestrator (START HERE)
1. Read the plan's Section 3 (Supabase Schema) — apply as migration
2. Read the plan's Section 4 (Orchestrator) — build in `orchestrator/` directory
3. Core loop: poll `forge.issues` for `status=todo` + `assignee_agent_id IS NOT NULL` → claim → spawn CLI → capture output → update status
4. Start with Claude adapter only — spawn `claude --print - --output-format stream-json` 
5. Test: create an agent + issue in Supabase, verify orchestrator picks it up and runs claude

### Phase 2: Dashboard — Agents + Issues Pages
1. Read `paperclip-agents.png` and `paperclip-issues.png` screenshots
2. Build `/agents` page — list with status, model, last active, org hierarchy
3. Build `/issues` page — board view (backlog/todo/in_progress/done), filters, priority colors
4. Build `/issues/[id]` page — detail with description, comments, properties panel
5. Real-time updates via Supabase Realtime subscriptions

### Phase 3: Dashboard — Routines, Skills, Activity
1. Read remaining screenshots
2. Build `/routines` page — list with schedules, enable/disable toggle
3. Build `/skills` page — registry with markdown preview
4. Build `/activity` page — chronological feed
5. Build `/costs` page — spend per agent
6. Add routine scheduler to orchestrator (cron-based)

### Phase 4: Dashboard — Org Chart, Goals, Projects, Settings  
1. Build `/org` page — React Flow tree (use reactflow library)
2. Build `/goals` and `/projects` pages
3. Build `/settings` pages
4. Build `/inbox` page — notifications

### Phase 5: Advanced — Gemini/Codex Adapters, Worktrees, Learning
1. Add Gemini adapter: spawn `gemini -p` with appropriate flags
2. Add Codex adapter: spawn `codex -p` with appropriate flags
3. Git worktree isolation per issue
4. Agent learning: `last_run_summary` persisted and injected into next run
5. @-mention triggers between agents

## Critical Rules

1. **Read the plan before building** — it has exact SQL, code snippets, and architecture decisions
2. **Read screenshots before building UI** — match Paperclip pixel-for-pixel
3. **Dark theme** — Paperclip uses a dark theme (dark bg, cyan/teal accents). Match it.
4. **Commit after each page/feature** — never batch up too much work
5. **Don't edit the DirtSync repo** — this is MCM Forge only
6. **Test each phase** before moving to the next
7. **Update the plan** as you complete phases

## Quick Reference

| Resource | Location |
|----------|----------|
| Project plan | `docs/mcm-forge-orchestrator-plan.md` |
| UI screenshots | `qa-screenshots/paperclip-reference/*.png` |
| Web app | `web/` (Next.js) |
| Supabase project | `ncwxeeqvujgyiggkviqq` |
| Main branch | `main` |
| Dashboard URL | mcmforge.com |
| Mac Mini | `ssh dirtsyncmini@100.125.184.57` |
