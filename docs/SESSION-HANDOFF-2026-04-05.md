# Session Handoff — 2026-04-05

## What Was Built

MCM Forge went from concept to working fleet in one session. Steve's custom Paperclip is live.

### Mac Mini Fleet (24/7)
| Service | Status | Details |
|---------|--------|---------|
| **Claude Code** | tmux `claude` | Max, Opus 4.6, dirtsyncapp@gmail.com |
| **Codex** | tmux `codex` | Pro, GPT-5.3 codex-1 |
| **Gemini** | tmux `gemini` | AI Ultra, Gemini 3 |
| **Forge Orchestrator** | PM2 pid 49279 | 5 loops, agent API on :3200 |

### Agents (all enabled, idle, $50/month budget each)
| Agent | CLI | Model | Role |
|-------|-----|-------|------|
| Forge COO | Claude | Opus | Triage, delegate, enforce quality gates |
| Forge Builder | Codex | GPT-5.3 | Implement features, fix bugs, create PRs |
| Forge QA | Gemini | gemini-2.5-pro | Playwright screenshots, per-criterion PASS/FAIL |
| Forge Reviewer | Gemini | gemini-2.5-pro | 5-point PR review checklist |
| Fleet Auditor | Gemini | gemini-2.5-flash | Daily 8AM health check (CLI versions, config audit, budget, disk) |

### Infrastructure Built
- **Agent API** (localhost:3200) — 7 REST endpoints: /me, /inbox, /issues, /checkout, /context, create, update
- **[SILENT] marker** — agents with empty inbox skip notifications
- **FTS5 session search** — SQLite cross-run memory, agents recall their last 3 results
- **CWD isolation** — COO in company dir (no code access), Builder/QA/Reviewer in repo root
- **Builder→QA auto-handoff** — when Builder marks issue 'in_review', orchestrator auto-creates QA subtask
- **Shared wiki** — ~/.forge/companies/mcm-forge/wiki/ (ARCHITECTURE, DECISIONS, SESSIONS, PATTERNS, BUGS, GLOSSARY)
- **Plugins** — superpowers, playwright, supabase, context7, frontend-design (all installed + enabled)
- **Supabase MCP** — configured with access token

### Pipeline Proven E2E
```
Steve created FORGE-2 "Issues need attach files" on phone
  → Orchestrator detected in 3 seconds
  → COO woke, triaged, created FORGE-3, assigned to Builder ($0.27)
  → Builder implemented file attachments, created PR #37 ($1.38)
  → Total: $1.65, ~10 minutes, zero human intervention after issue creation
```

## What's On the Branch

`feature/d-and-c-fixes` — 25+ commits ahead of main. Contains:
- Forge Orchestrator with agent API, [SILENT], FTS5, QA handoff
- All agent instruction files (COO, Builder, QA, Reviewer, Fleet Auditor, CEO)
- Shared wiki
- Company memory structure

**This branch needs a PR to main when Steve is ready.**

## Open PRs
- **#36** — Company routing fix (await cookie before refresh). Steve: verify preview URL.
- **#37** — File attachments on issues. Steve: verify preview URL.

## What's NOT Done
- **#50 Screenshot attachment on New Issue form** — PR #37 may cover this. Verify.
- **Xcode on Mini** — needs physical screen or Screen Sharing (sudo password known, Screen Sharing enabled via launchctl but macOS Sequoia requires GUI toggle in System Settings)
- **XcodeBuildMCP + iOS Simulator MCP** — blocked by Xcode install
- **Codex CLI update** — v0.99.0 installed, v0.118.0 available. Run `npm install -g @openai/codex` on Mini.

## Known Issues
- `dangerouslySkipPermissions` only works on Claude adapter. Codex/Gemini ignore it.
- Mini sudo requires interactive terminal — Claude's SSH pipe can't pass passwords.
- Company memory on Mini at ~/.forge/companies/mcm-forge/memory/ — STATUS.md, LEARNINGS.md, TEAM.md, ISSUE-001.md

## How to Test the Pipeline

1. Go to mcmforge.com on your phone
2. Create a new issue, assign to Forge COO
3. Watch the orchestrator pick it up: `ssh dirtsyncmini@100.125.184.57` then `pm2 logs forge-orchestrator --lines 20`
4. COO will triage and delegate to Builder (Codex)
5. Builder will implement, commit, push, create PR
6. If Builder marks 'in_review', QA (Gemini) auto-wakes and verifies
7. Check results in Supabase: `SELECT * FROM forge.runs ORDER BY created_at DESC LIMIT 5`

## Mini SSH Cheat Sheet
```bash
ssh dirtsyncmini@100.125.184.57
# Set PATH first:
export PATH='/opt/homebrew/bin:/opt/homebrew/opt/node@20/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/dirtsyncmini/.local/bin:$PATH'

pm2 logs forge-orchestrator --lines 20    # Watch orchestrator
pm2 list                                   # Check processes
tmux ls                                    # Check CLI sessions
curl http://127.0.0.1:3200/api/health     # Agent API health
```

## Next Session Priorities
1. Review + merge PR #36 and #37 (preview URLs)
2. Merge feature/d-and-c-fixes to main (the orchestrator + all agent files)
3. Test full pipeline with a new issue
4. Enable Xcode (physical access to Mini needed for System Settings toggle)
5. Add Playwright E2E test suite for dashboard
6. Post-deploy health check routine (screenshot mcmforge.com after merge)
