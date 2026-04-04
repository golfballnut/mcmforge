---
name: routine-audit
description: >
  Deep audit of Paperclip routine agents — grades AGENTS.md, HEARTBEAT.md, execution output,
  infrastructure health, and team value. Checks for known Paperclip bugs (invisible issues #2251,
  missing promptTemplate #206). Run after setting up new routines or when routines burn cycles.
  Triggers on: audit routines, routine health, are routines working, grade agents,
  routine quality, check routine output, dial in routines, routine scorecard.
allowed-tools: Read, Bash(curl *), Bash(python3 *), Bash(wc *), Bash(cat *), Grep, Glob
context: fork
model: sonnet
---

## Goal
Audit every Paperclip routine agent for DirtSync (DIRA) on 5 axes. Catch both
agent-level problems (bad docs) AND platform-level problems (known Paperclip bugs).
Produce a scorecard Steve can scan in 30 seconds with a prioritized fix list.

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. Every routine agent has a letter grade (A/B/C/D/F) on all 5 axes
2. Infrastructure health section confirms or denies known Paperclip bugs
3. A prioritized fix list exists (platform bugs first, then agent docs)
4. Scorecard displayed to Steve

## Pre-Made Decisions

| Decision | Answer |
|----------|--------|
| Which system | Paperclip only — local at `localhost:3100` |
| Company ID | `b724f8bb-9567-47a1-8ec6-fd8e23c70093` (DIRA) |
| API prefix | `/api/` (without it you get SPA HTML) |
| Routine agents | role=`general`, maxTurns <= 15, heartbeat >= 600000 |
| Skip | Engineers (role=engineer), CEO/COO (role=ceo), QA (role=qa) |
| Instructions path | `~/.paperclip/instances/default/companies/{companyId}/agents/{id}/instructions/` |

## How to Fetch Data

```bash
# All agents (filter to routine agents in code)
curl -s http://localhost:3100/api/companies/b724f8bb-9567-47a1-8ec6-fd8e23c70093/agents

# All routines with triggers, last run, linked issues
curl -s http://localhost:3100/api/companies/b724f8bb-9567-47a1-8ec6-fd8e23c70093/routines

# Single agent detail (check adapterConfig.promptTemplate)
curl -s http://localhost:3100/api/agents/{agentId}

# Issues for company (check if routine execution issues are visible)
curl -s "http://localhost:3100/api/companies/b724f8bb-9567-47a1-8ec6-fd8e23c70093/issues"
```

## Grading Rubric — 5 Axes

### 1. AGENTS.md Quality (does it know HOW?)
| Grade | Criteria |
|-------|----------|
| **A** | 20+ lines. Specific MCP tools, file paths, Supabase project IDs, thresholds, escalation targets |
| **B** | 15+ lines. Has most specifics but missing 1-2 elements |
| **C** | 10-14 lines. Knows what to check but not how — no tools, no paths, no queries |
| **D** | < 10 lines. Generic boilerplate |
| **F** | Default Paperclip template ("Keep the work moving...") or empty |

### 2. HEARTBEAT.md (does it know what to do when it wakes?)
Community pattern from Paperclip RFC #206: AGENTS.md = identity, HEARTBEAT.md = per-wake checklist.
| Grade | Criteria |
|-------|----------|
| **A** | Has HEARTBEAT.md with: inbox check (including routine executions), execute step, comment results, exit protocol |
| **B** | Has HEARTBEAT.md but missing some steps (e.g., no inbox query, no exit protocol) |
| **C** | AGENTS.md contains heartbeat-like steps but no separate HEARTBEAT.md |
| **D** | No heartbeat protocol at all — agent wakes and guesses what to do |
| **F** | Default prompt only — will exit with "nothing to do" every time |

### 3. Execution Output (has it produced anything?)
| Grade | Criteria |
|-------|----------|
| **A** | Multiple successful runs with actionable output in issue comments |
| **B** | At least one successful run with output |
| **C** | Fired but coalesced/stalled — issue created but still "todo" |
| **D** | Scheduled but never fired yet |
| **F** | Failed execution |

### 4. Infrastructure Health (is the platform working for this agent?)
| Grade | Criteria |
|-------|----------|
| **A** | No known platform bugs affecting this agent |
| **B** | Minor issue (e.g., duplicate triggers) |
| **C** | Affected by known bug but has workaround in place |
| **D** | Affected by known bug with NO workaround |
| **F** | Multiple platform bugs blocking this agent |

### 5. Team Value (does anyone consume this?)
| Grade | Criteria |
|-------|----------|
| **A** | Output triggers other agent work or informs decisions |
| **B** | Useful reference but not actively consumed |
| **C** | Output exists but no downstream use |
| **D** | No output to evaluate yet |
| **F** | Produces noise that wastes review time |

## Known Paperclip Bugs to Check

These are verified open issues. Check each one during the audit.

| Bug | Issue | Impact | How to Check |
|-----|-------|--------|--------------|
| **Routine issues invisible to agents** | #2251 | Agent can't see its own execution issues in inbox | Create a test routine issue, check if agent's inbox-lite returns it |
| **Routine issues hidden from UI** | #1423 | Issues don't show in company issues list | Check `/api/companies/{id}/issues` for `originKind: routine_execution` |
| **promptTemplate undocumented** | #206 | Default prompt too vague, agents exit immediately | Check each agent's `adapterConfig.promptTemplate` — if missing, agent will say "nothing to do" |
| **Sequential timer processing** | #2491 | 30 agents = missed ticks, delayed wakeups | Note: can't fix from our side, but impacts scheduling reliability |
| **Thundering herd on restart** | #1241 | All agents fire at once after server restart | Note: affects us when Paperclip restarts |
| **PARA memory dedup bug** | #2059 | Daily notes accumulate duplicates, bloat tokens | Check if para-memory-files skill is installed — if so, flag the bug |

## Gotchas

| Issue | Solution |
|-------|----------|
| Routes without `/api/` prefix return SPA HTML | Always use `/api/` |
| Duplicate schedule triggers on some routines | Flag as cleanup, not failure |
| Routine Manager has default AGENTS.md | Grade separately — it's the coordinator |
| "coalesced" = fired but merged into existing run | Grade C for execution, not F |
| `adapterConfig.promptTemplate` may not exist | Missing = using default vague prompt = agent exits immediately |
| HEARTBEAT.md may not exist yet | Most agents won't have it — this IS the gap |

## Output Format

```
ROUTINE AUDIT — DirtSync (DIRA) — {date}
================================================

PLATFORM HEALTH (check these FIRST — they block everything)
- [ ] Routine issue visibility (#2251): {PASS/FAIL}
- [ ] promptTemplate set on agents (#206): {n}/{total} agents have it
- [ ] HEARTBEAT.md exists: {n}/{total} agents have it
- [ ] Duplicate triggers: {list}
- [ ] Sequential timer impact (#2491): {note}

SCORECARD ({n} routines)
| Routine                    | Docs | HB.md | Exec | Infra | Value | Overall |
|----------------------------|------|-------|------|-------|-------|---------|
| ...                        |      |       |      |       |       |         |

SUMMARY: {n} A's, {n} B's, {n} C's, {n} D's, {n} F's

TOP FIXES (platform bugs first, then agent docs):
1. [PLATFORM] {bug} — {specific fix}
2. [AGENT: {name}] {what's missing}
3. ...
```

## Checklist

### Before Starting
- [ ] Paperclip server running at localhost:3100
- [ ] API responds: `curl -s http://localhost:3100/api/companies/b724f8bb.../agents | head -c 100`

### During Execution
- [ ] Platform health checks run (all 6 known bugs checked)
- [ ] Every routine agent graded on all 5 axes
- [ ] Every AGENTS.md AND HEARTBEAT.md checked (or confirmed missing)
- [ ] Every agent's adapterConfig.promptTemplate checked
- [ ] Failed/never-run routines have root cause identified

### After Running
- [ ] Scorecard displayed with platform health section FIRST
- [ ] Fix list prioritized: platform bugs > missing HEARTBEAT.md > AGENTS.md quality
- [ ] New gotchas noted for next run
