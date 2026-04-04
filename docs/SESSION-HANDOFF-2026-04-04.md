# MCM Forge Session Handoff — 2026-04-04

## What Was Built Today (11 PRs: #25-#35)

### Phase 1: Orchestrator Core
- 14 Supabase tables in `forge` schema (companies, agents, issues, runs, routines, etc.)
- `forge-orchestrator/` — 22 TypeScript source files
- Adapters: Claude, Gemini, Codex CLI
- Loops: run-executor (5s), heartbeat-scheduler (30s), routine-scheduler (60s), orphan-reaper, mention-watcher (30s)
- Services: wakeup, cost-ledger, issue-lifecycle, mention-parser, session-manager, git worktree
- Dry-run mode: `FORGE_DRY_RUN=true` tests pipeline without CLI
- Budget enforcement: auto-pause agents exceeding monthly limit

### Phase 2: Dashboard (Paperclip Mirror)
- 24 Next.js routes, dark theme (#0d1117 bg, #00d4aa accent)
- Dual-nav sidebar: icon rail (company switcher) + main sidebar (nav, projects, agents, company section)
- Company scoping: cookie + React context, defaults to mcm-forge
- All pages filter by active company
- 5 creation forms (issues, agents, routines, goals, projects)
- All CRUD actions wired (Server Actions)
- Realtime hooks for live updates
- Agent API: /api/agent/me, /api/agent/issues, checkout, create, update

### Agent Onboarding
- 4 agents × 4 files (AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md)
- Forge coordination skill (companies/mcm-forge/skills/forge/SKILL.md)
- Multi-CLI strategy: Gemini builds (15 turns), Codex tests (10 turns), Claude reviews (3 turns)

### Data
- Migrated from Paperclip: 39 DirtSync agents, 89 issues, 23 routines
- MCM Forge team: Forge Builder (Gemini), Forge QA (Codex), Forge COO (Claude Opus), Forge Reviewer (Claude Opus)
- 6 goals in hierarchy (vision → strategy → task)
- All agents paused, all routines paused

## Current State

### Deployed
- Dashboard: mcmforge.com (Vercel, auto-deploy from main)
- Orchestrator: pm2 on Mac Mini (dirtsyncmini@100.125.184.57), PID changes on restart
- Auth: steve@linkschoice.com / MCMForge2026!

### Scorecard: 15A, 32B, 2C, 0D, 3F
- See `docs/FORGE-READINESS-SCORECARD.md` for full 52-item audit
- 3 remaining F's are all CLI auth on Mini (Steve action)

### BLOCKER: Claude CLI Auth on Mac Mini
- Account: dirtsyncapp@gmail.com (Max subscription)
- Status: logged in but OAuth token EXPIRED
- `claude auth login` requires interactive terminal — tried SSH, expect, tmux, screen, named pipes
- **Working method found but code delivery failed** — tmux `send-keys` sends text but `claude auth login` doesn't read from stdin, it waits for OAuth callback
- **Solution:** Steve needs to run `claude auth login` directly on Mini terminal (Screen Sharing or physical access) where the browser can complete the OAuth flow locally
- Gemini CLI: v0.36.0 installed, auth unknown (Google also cracking down on automated CLI use)
- Codex CLI: v0.99.0 installed, auth unknown

### Key Files
| File | Purpose |
|------|---------|
| `docs/FORGE-READINESS-SCORECARD.md` | 52-item audit checklist |
| `docs/mcm-forge-orchestrator-plan.md` | 1654-line master plan |
| `docs/BUILD-MCM-FORGE-ORCHESTRATOR.md` | Build prompt for new sessions |
| `forge-orchestrator/.env` | On Mini only (has service role key) |
| `companies/mcm-forge/agents/*/` | 4 files per agent (AGENTS, HEARTBEAT, SOUL, TOOLS) |
| `companies/mcm-forge/skills/forge/SKILL.md` | Agent coordination skill |

### CLI Paths on Mini
- Claude: `/Users/dirtsyncmini/.local/bin/claude`
- Gemini: `/opt/homebrew/bin/gemini`
- Codex: `/opt/homebrew/bin/codex`
- Node: `/opt/homebrew/bin/node` (v25.8.2)
- pm2: `/opt/homebrew/bin/pm2`

### Supabase
- Project: ncwxeeqvujgyiggkviqq
- Schema: `forge` (exposed via PostgREST)
- Service role key: in `forge-orchestrator/.env` on Mini
- Management API token: in `.mcp.json`
- 5 companies: DirtSync, MCM Forge, Links Choice, Golf Ball Nut, Hot Golf Brands
- MCM Forge company ID: `170ebe36-d689-4f15-91f1-7474df6c98cd`
- DirtSync company ID: `99338dee-5fdc-4cbf-a344-5c08ec112a2b`

## Next Steps (in order)

1. **Auth CLIs on Mini** — Screen Share to Mini, run `claude auth login` in Terminal.app
2. **Test Gemini/Codex auth** — `gemini auth status`, `codex auth status` on Mini
3. **Set Forge Builder to idle** — `UPDATE forge.agents SET status = 'idle' WHERE name = 'Forge Builder'`
4. **FORGE-1 auto-executes** — orchestrator picks it up, Gemini builds the favicon
5. **Verify run succeeds** — check `forge.runs` for status=succeeded
6. **Scale up** — enable more agents one at a time
7. **Push remaining C's to B+** — session testing, onboarding automation
