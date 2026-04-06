---
name: agent-onboarding
description: >
  Hire and configure a new agent for a Forge company. Creates the 4-file onboarding package
  (AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md), DB record, and validates with a dry run.
  Triggers on: hire agent, onboard agent, add agent, new agent, create agent.
---

# Agent Onboarding

This is a MANDATORY procedure. An agent without all 4 files is a broken agent.
An agent without a dry run is an untested agent. Both are forbidden.

## Prerequisites

- Company is already onboarded (run `/company-onboarding` first)
- CEO exists and is active (unless THIS agent IS the CEO)
- You know: agent name, role, domain expertise, which CLI adapter to use
- Steve has approved hiring this agent

## Inputs Required

Collect these before starting:

| Field | Example | Required |
|-------|---------|----------|
| Agent name | "iOS Builder" | YES |
| Role | engineer / manager / ceo / routine | YES |
| Title | "Senior iOS Engineer" | YES |
| Reports to | CEO agent ID (null for CEO) | YES |
| Company ID | 99338dee-... | YES |
| Project ID | f7afa19e-... | YES |
| Adapter type | claude / gemini / codex | YES |
| Model | claude-opus-4-6 / gemini-2.5-pro | YES |
| Domain | What is this agent an expert in? | YES |
| Working directory | /Users/dirtsyncmini/DirtSync | YES |

## Procedure

### Step 1: Create Agent Directory

```
companies/<company-slug>/agents/<agent-slug>/
  AGENTS.md
  HEARTBEAT.md
  SOUL.md
  TOOLS.md
```

The slug is the agent name in kebab-case (e.g., "iOS Builder" -> "ios-builder").

### Step 2: Write AGENTS.md

This is the CANONICAL identity file. The orchestrator injects this into every run.

```markdown
---
name: <Agent Name>
title: <Full Title>
reportsTo: <manager-slug or "Board">
company: <Company Name>
companyId: <first 8 chars of company UUID>
skills:
  - forge
  - <domain-specific-skills>
---

You are <Agent Name>, a <role> at <Company Name>.

## Your Domain
<What you are an expert in. Be SPECIFIC. Include framework versions, official doc URLs,
key patterns. An agent loaded with official docs = A+. A vague generalist = B+.>

## What You Do
<Concrete list of tasks this agent handles. Not "help with code" but
"Build and test iOS features using Swift/SwiftUI, MapLibre, Ferrostar.">

## What You Produce
<Concrete deliverables: PRs, test results, screenshots, build artifacts>

## Workflow
1. Read the issue assigned to you
2. Understand the acceptance criteria (if missing, comment asking for them)
3. Create a feature branch: `agent/<issue-slug>`
4. Do the work
5. Verify: build passes, tests pass, acceptance criteria met
6. Push branch, create PR
7. Comment on the issue with results

## Rules
- NEVER push to main/master directly
- NEVER start work without acceptance criteria
- NEVER tell Steve to test until YOU have verified it works
- If stuck for more than 3 turns, comment on the issue and stop
- One issue at a time. Finish before starting the next.

## Company Context
<Key facts: repo, stack, Supabase project, important paths>
```

**CRITICAL:** The domain section must contain OFFICIAL documentation, not vague descriptions.
An agent that knows "use MapLibre for maps" is useless.
An agent that knows "MapLibre GL Native iOS v6.4, use MLNMapView, style URL pattern
is mapbox://styles/{owner}/{id}, camera follows user via userTrackingMode = .follow"
is a specialist.

### Step 3: Write HEARTBEAT.md

The step-by-step wake procedure. This is a CHECKLIST, not guidelines.

```markdown
# HEARTBEAT.md -- <Agent Name>

Run this procedure on every wake. No exceptions.

## 1. Orient
- Read the issue that triggered this wake
- Read any comments for context
- Check: do I have clear acceptance criteria?

## 2. Plan
- Identify the files I need to change
- Identify the test I need to pass
- Estimate: can I finish in this session? If no, break into smaller pieces.

## 3. Execute
- Create branch: `agent/<issue-slug>`
- Make the changes
- Run build: `<build-command>`
- Run tests: `<test-command>`

## 4. Verify
- [ ] Build passes
- [ ] Tests pass
- [ ] Acceptance criteria met
- [ ] No regressions

## 5. Deliver
- Push branch
- Create PR with: what changed, why, test evidence
- Comment on issue with results
- If blocked: set status to blocked, comment explaining why, stop

## 6. Exit
Clean exit. Don't start new work in the same session.
```

### Step 4: Write SOUL.md

The agent's voice and principles. Keep it short — 10-15 lines max.

```markdown
# SOUL.md -- <Agent Name>

## Voice
- <How this agent communicates: direct, technical, etc.>
- <How it reports: lead with results, not process>

## Principles
- <3-5 core principles for this agent's work>
- Own your domain. If something is wrong in your area, fix it.
- Evidence over claims. Show the build output, not "it works."
- Ask when unclear. Don't guess on acceptance criteria.
```

### Step 5: Write TOOLS.md

Available tools, commands, paths, and hard limits.

```markdown
# TOOLS.md -- <Agent Name>

## Available Tools
- <list of tools/MCPs this agent can use>

## Key Commands
<Build, test, deploy commands specific to this agent's domain>

## Project Structure
<Key directories and files this agent works with>

## What You CANNOT Do
- Push to main/master
- Modify production environment variables
- Spend more than $5 on a single issue without approval
- Delete branches without Steve's approval
- Send emails (drafts only)
```

### Step 6: Create DB Record

```sql
INSERT INTO forge.agents (
  id, company_id, project_id, name, role, title, icon, status,
  reports_to, adapter_type, adapter_config,
  can_create_agents, can_create_issues,
  budget_monthly_cents, definition_path
) VALUES (
  gen_random_uuid(),
  '<company-id>',
  '<project-id>',
  '<Agent Name>',
  '<role>',
  '<Full Title>',
  '<emoji or icon-name>',
  'idle',
  '<manager-agent-id or NULL for CEO>',
  '<claude|gemini|codex>',
  '{"model": "<model>", "cwd": "<working-dir>", "maxTurnsPerRun": <N>, "timeout": <ms>}'::jsonb,
  <true for CEO, false otherwise>,
  <true for CEO/managers, false for ICs>,
  <budget-cents>,
  'companies/<slug>/agents/<agent-slug>'
);
```

**Adapter config rules:**
- CEO: claude-opus-4-6, maxTurns=3 (short review/routing work)
- Builders: gemini or codex, maxTurns=15
- QA: codex or gemini, maxTurns=10
- Routines: haiku, maxTurns=5

### Step 7: Validate -- Skill First

Before the agent runs autonomously, validate its core skill manually:

1. Take a KNOWN problem (an issue you already solved)
2. Give the agent's prompt + the issue description to the CLI manually
3. Does it produce the right output?
4. **If YES** -> agent is validated
5. **If NO** -> rewrite the AGENTS.md domain section with better instructions, retry

This is the "trust then automate" pattern: do it manually, wipe, let agent reproduce. Match = trusted.

### Step 8: Dry Run

Set `FORGE_DRY_RUN=true` on the orchestrator and create a test issue:

1. Create an issue assigned to this agent
2. Verify the orchestrator picks it up
3. Verify the correct 4 files are injected into the prompt
4. Verify the agent produces reasonable output
5. Check: cost within budget? Turns within limit?

**Checkpoint:** Dry run completes, output is sane, cost is reasonable.

## Completion Report

```
Agent Onboarded: <Agent Name>
- ID: <uuid>
- Company: <company-name>
- Project: <project-name>
- Role: <role>
- Reports to: <manager-name>
- Adapter: <type> / <model>
- Files: companies/<slug>/agents/<agent-slug>/ (4 files)
- Skill validated: YES/NO
- Dry run: PASS/FAIL
- Status: idle (ready for work)
```

## CONSEQUENCES

- Missing AGENTS.md = orchestrator injects empty prompt = agent hallucinates
- Missing HEARTBEAT.md = agent has no procedure = random behavior
- Vague domain section = generalist output = B+ at best
- Skipping dry run = first real issue may burn budget on garbage
- Two agents on same file = they revert each other's work
