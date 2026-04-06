---
name: company-go-live
description: >
  Final validation checklist before activating a company's agents on MCM Forge.
  Verifies CLI auth, budget guards, dry runs, and runs the first real issue.
  Triggers on: go live, activate company, start agents, launch company, company ready.
---

# Company Go-Live

This is the FINAL gate before agents start running autonomously. Every check must pass.
One unchecked item = agents burning budget on broken infrastructure.

## Prerequisites

- Company onboarded (`/company-onboarding` completed)
- CEO onboarded (`/agent-onboarding` completed for CEO)
- At least 1 additional agent hired (CEO needs someone to delegate to)
- All agent 4-file packages reviewed by Steve

## Pre-Flight Checklist

Run every check. Mark PASS or FAIL. ALL must pass.

### Infrastructure

| # | Check | Command | Expected | Status |
|---|-------|---------|----------|--------|
| 1 | Orchestrator running | `ssh mini 'pm2 status forge-orchestrator'` | online | |
| 2 | Orchestrator .env has company | Check SUPABASE_URL, SUPABASE_SERVICE_KEY in .env | Set | |
| 3 | Dashboard loads company | Visit mcmforge.com, switch to company | Shows 0 issues, agents listed | |

### CLI Authentication (Mac Mini)

| # | Check | Command | Expected | Status |
|---|-------|---------|----------|--------|
| 4 | Claude CLI auth | `ssh mini 'claude --version && claude auth status'` | Authenticated | |
| 5 | Gemini CLI auth | `ssh mini 'gemini --version && gemini auth status'` | Authenticated | |
| 6 | Codex CLI auth | `ssh mini 'codex --version && codex auth status'` | Authenticated | |

**Only check the CLIs your agents actually use.** If all agents use Claude, skip Gemini/Codex.

**If auth fails:** Steve must use Screen Sharing (VNC to Mini) to run auth login in Terminal.app. Claude CLI OAuth requires a local browser — cannot be done via SSH.

### Agent Configuration

| # | Check | How to verify | Expected | Status |
|---|-------|---------------|----------|--------|
| 7 | CEO has 4 files | `ls companies/<slug>/agents/ceo/` | AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md | |
| 8 | All agents have 4 files | `find companies/<slug>/agents/ -name AGENTS.md` | One per agent in DB | |
| 9 | Agent DB records match files | Compare `forge.agents` rows to filesystem dirs | 1:1 match | |
| 10 | Org hierarchy valid | Every agent has `reports_to` set (except CEO) | No orphans | |
| 11 | No duplicate file assignments | Review TOOLS.md across agents | No 2 agents on same file | |

### Budget Guards

| # | Check | Query | Expected | Status |
|---|-------|-------|----------|--------|
| 12 | Company budget set | `SELECT budget_monthly_cents FROM forge.companies WHERE id = '<id>'` | > 0 | |
| 13 | Agent budgets set | `SELECT name, budget_monthly_cents FROM forge.agents WHERE company_id = '<id>'` | All > 0 | |
| 14 | No runaway risk | Max agent budget < company budget | True | |

### Data Integrity

| # | Check | Query | Expected | Status |
|---|-------|-------|----------|--------|
| 15 | Company goal exists | `SELECT * FROM forge.goals WHERE company_id = '<id>' AND level = 'company'` | 1+ active | |
| 16 | Project exists | `SELECT * FROM forge.projects WHERE company_id = '<id>'` | 1+ active | |
| 17 | Issue counter correct | `SELECT issue_prefix, issue_counter FROM forge.companies WHERE id = '<id>'` | Prefix set, counter correct | |
| 18 | Vision doc exists | `cat companies/<slug>/vision/NORTH-STAR.md` | Non-empty, all sections | |

### Dry Run

| # | Check | How | Expected | Status |
|---|-------|-----|----------|--------|
| 19 | Orchestrator picks up agent | Set agent to `idle`, create test issue | Run appears in `forge.runs` | |
| 20 | Correct prompt injected | Check run logs for 4-file content | All 4 files present | |
| 21 | Agent produces output | Check run stdout_excerpt | Meaningful work product | |
| 22 | Cost within budget | Check `cost_usd` on the run | < $2 for first run | |
| 23 | Clean exit | Check `exit_code` and `error` | exit_code=0, no error | |

## Go-Live Sequence

Only after ALL 23 checks pass:

### 1. Set CEO to Idle

```sql
UPDATE forge.agents SET status = 'idle'
WHERE company_id = '<company-id>' AND role = 'ceo';
```

### 2. Create the First Real Issue

```sql
INSERT INTO forge.issues (
  id, company_id, project_id, identifier, title, description,
  status, priority, assignee_agent_id, origin_kind
) VALUES (
  gen_random_uuid(),
  '<company-id>',
  '<project-id>',
  '<PREFIX>-1',
  '<first real task title>',
  '<clear description with acceptance criteria>',
  'todo',
  'medium',
  '<ceo-agent-id>',
  'manual'
);

-- Increment counter
UPDATE forge.companies
SET issue_counter = issue_counter + 1
WHERE id = '<company-id>';
```

**The first issue should be SMALL and SAFE:**
- A documentation task, a simple bug fix, or a config change
- NOT a major feature or architectural change
- Something you can verify in under 5 minutes

### 3. Monitor the First Run

Watch the dashboard:
- Does the CEO wake up?
- Does it triage correctly?
- Does it delegate to the right agent?
- Does the delegated agent produce good work?
- Does a PR get created?
- Does the build pass?

### 4. Steve's Field Test

Steve verifies the output. This is the FINAL gate.
- If PASS -> company is live. Enable routines, add more issues.
- If FAIL -> diagnose, fix agent instructions, retry from dry run.

## Completion Report

```
Company Go-Live: <Company Name>
- Pre-flight: 23/23 checks PASS
- CEO: active, first heartbeat completed
- First issue: <PREFIX>-1 — <title>
- First run: <status>, cost $<amount>
- Steve's verdict: PASS/FAIL
- Status: LIVE / NEEDS RETRY
```

## Rollback

If things go wrong after go-live:
1. Pause all agents: `UPDATE forge.agents SET status = 'paused' WHERE company_id = '<id>'`
2. Pause all routines: `UPDATE forge.routines SET status = 'paused' WHERE company_id = '<id>'`
3. Diagnose from the dashboard (runs, logs, costs)
4. Fix agent instructions
5. Retry from dry run

## CONSEQUENCES

- Skipping CLI auth check = agents fail immediately on spawn = wasted orchestrator cycles
- Skipping budget check = unlimited spend risk
- Big first issue = complex failure with no baseline = impossible to debug
- Skipping Steve's field test = agents running autonomously on unverified output
