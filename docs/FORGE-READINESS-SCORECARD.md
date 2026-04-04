# MCM Forge Readiness Scorecard

**Target: A+ across the board before first real agent run.**
**Last audited: 2026-04-04**

---

## CORE ENGINE

| # | Feature | Grade | Notes | Fix |
|---|---------|-------|-------|-----|
| 1 | Heartbeat lifecycle (wake/work/sleep) | B | Dry-run validated, no live test | Live test with real CLI |
| 2 | Claude CLI adapter | B+ | E2E validated once, auth expired | Re-auth + re-test |
| 3 | Gemini CLI adapter | C | Code exists, zero runtime testing | Test on Mini |
| 4 | Codex CLI adapter | C | Code exists, zero runtime testing | Test on Mini |
| 5 | Run executor (poll/claim/spawn) | B+ | Validated, 3 column bugs fixed | Stress test |
| 6 | Session resume/rotate | C | Basic implementation, untested | Test session persistence |
| 7 | Cron routine scheduler | B | Built, column bugs fixed | Live test with one routine |
| 8 | Issue assignment wakeup | B | Dry-run validated | Live test |
| 9 | @-mention wakeups | D | Parser built, NOT wired to run | Wire mention → wakeup in comment handler |
| 10 | Orphan reaper | B | Built, untested edge cases | Verify with stuck run |
| 11 | Git worktree isolation | C | Built, untested | Test worktree create/cleanup |
| 12 | Cost tracking | B | Records costs, no budget enforcement | Add auto-pause at budget limit |
| 13 | Concurrent run limiting | B | MAX_CONCURRENT_RUNS=3, per-adapter not enforced | Add per-adapter slot tracking |

## AGENT QUALITY

| # | Feature | Grade | Notes | Fix |
|---|---------|-------|-------|-----|
| 14 | AGENTS.md per agent (MCM Forge) | A | 4/4 done | — |
| 15 | AGENTS.md per agent (DirtSync) | F | 39 agents, zero instructions | Create AGENTS.md for each on migration |
| 16 | HEARTBEAT.md protocol | A | 4/4 done | — |
| 17 | SOUL.md personality | A | 4/4 done | — |
| 18 | TOOLS.md reference | A | 4/4 done | — |
| 19 | Prompt injects ALL 4 files | F | Only AGENTS.md via --append-system-prompt-file | Inject HEARTBEAT+SOUL+TOOLS into prompt template |
| 20 | Skills wired to agents | F | skills: [] on all agents | Create forge coordination skill, wire it |
| 21 | Agent home directory ($AGENT_HOME) | F | Not implemented | Create per-agent dirs on Mini |
| 22 | PARA memory system | F | Not implemented | Build memory skill or dir structure |
| 23 | Agent API (callback endpoints) | F | Agents can't call back to Forge | Build /api/agent/* routes |
| 24 | Agent env vars injected | B | FORGE_RUN_ID etc set | Add FORGE_API_URL, agent API key |

## DASHBOARD

| # | Feature | Grade | Notes | Fix |
|---|---------|-------|-------|-----|
| 25 | Company scoping | B | Built, sidebar project bug | Fix sidebar PROJECTS filter |
| 26 | Agent list + live badges | A | Working with real data | — |
| 27 | Agent detail (6 tabs) | B+ | Built, mostly functional | Test all tabs with data |
| 28 | Issue list | B | Display works, filter/sort not functional | Wire filter/sort/group |
| 29 | Issue detail + comments | B+ | Actions wired | Test comment posting |
| 30 | Run log live streaming | B | Realtime hooks exist | Test with live run |
| 31 | Routine management + toggle | B+ | Toggle wired | Test toggle live |
| 32 | Cost dashboard | B | Displays data, no charts | Add Recharts visualizations |
| 33 | Inbox | B | Shows runs, links issues | Test with real data |
| 34 | Org chart | B | Tree from reports_to | Test with MCM Forge hierarchy |
| 35 | Skills page | B | Extracts from agents | Test with wired skills |
| 36 | Settings | C | Display only, toggles don't save | Wire settings to Supabase |
| 37 | Creation forms | B+ | 5 forms, Server Actions | Test each form end-to-end |
| 38 | Approval queue | C | Display only | Wire approve/reject to real workflow |
| 39 | Login page | A | Dark theme, working auth | — |

## ORGANIZATIONAL

| # | Feature | Grade | Notes | Fix |
|---|---------|-------|-------|-----|
| 40 | Goals defined (MCM Forge) | F | ZERO goals | Create vision + strategy + task goals |
| 41 | Goals defined (DirtSync) | F | ZERO goals | Create from Paperclip |
| 42 | Projects properly configured | C | 2 projects, minimal config | Add repo_url, workspace_dir, branches |
| 43 | Agent-to-agent delegation | D | Not wired | Wire @-mention → wakeup + subtask creation |
| 44 | Onboarding skill/process | D | Manual file creation | Build automated onboarding |
| 45 | Agent budget enforcement | D | Budget field exists, not enforced | Auto-pause at limit |

## DEPLOYMENT

| # | Feature | Grade | Notes | Fix |
|---|---------|-------|-------|-----|
| 46 | Orchestrator on Mini (pm2) | A | Running, auto-restart | — |
| 47 | Dashboard on Vercel | A | Auto-deploy from main | — |
| 48 | Claude CLI auth on Mini | F | OAuth expired | Re-auth |
| 49 | Gemini CLI auth on Mini | ? | Not tested | Test `gemini --version` |
| 50 | Codex CLI auth on Mini | ? | Not tested | Test `codex --version` |
| 51 | All agents paused safely | A | 43 agents paused | — |
| 52 | Routines paused safely | A | 23 routines paused | — |

---

## SCORE SUMMARY

| Category | A+ | A | B+ | B | C | D | F | Total |
|----------|----|----|----|----|---|---|---|-------|
| Core Engine | 0 | 0 | 2 | 5 | 3 | 1 | 0 | 13 |
| Agent Quality | 0 | 4 | 0 | 1 | 0 | 0 | 5 | 11 |
| Dashboard | 0 | 2 | 4 | 6 | 2 | 0 | 0 | 15 |
| Organizational | 0 | 0 | 0 | 0 | 1 | 3 | 2 | 6 |
| Deployment | 0 | 3 | 0 | 0 | 0 | 0 | 2 | 7 |
| **TOTAL** | **0** | **9** | **6** | **12** | **6** | **4** | **9** | **52** |

**Overall: 9 F's to fix before launch.**

## PRIORITY ORDER (fix F's first)

1. ~~#19 Prompt injects all 4 files~~ → inject HEARTBEAT+SOUL+TOOLS
2. ~~#40 Goals (MCM Forge)~~ → create vision/strategy/task hierarchy
3. ~~#20 Skills wired~~ → create forge coordination skill
4. ~~#23 Agent API~~ → build callback endpoints
5. ~~#21 Agent home dirs~~ → create on Mini
6. ~~#22 PARA memory~~ → build memory structure
7. ~~#48 Claude auth~~ → re-auth on Mini (Steve)
8. ~~#15 DirtSync AGENTS.md~~ → can wait until DirtSync agents activated
9. ~~#41 DirtSync goals~~ → can wait

---

*Run this audit after every deploy. Target: 0 F's, 0 D's, then push all C's to B+.*
