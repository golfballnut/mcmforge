---
name: company-onboarding
description: >
  Onboard a new company into MCM Forge. Creates the company record, sets the north star goal,
  creates the project, writes the vision doc, and hires the CEO agent. Run this BEFORE any
  agent work begins. Triggers on: onboard company, add company, new company, setup company.
---

# Company Onboarding

This is a MANDATORY procedure. Every step must be completed and verified before moving to the next.
Skipping a step = broken company. No exceptions.

## Prerequisites

- Steve has approved adding this company to Forge
- You know: company name, description, issue prefix, repo URL, repo branch
- Supabase MCP is available (`mcp__supabase__execute_sql`)

## Procedure

### Step 1: Verify Company Exists in DB

Check if the company already has a row in `forge.companies`:

```sql
SELECT id, name, slug, issue_prefix, issue_counter, budget_monthly_cents
FROM forge.companies WHERE slug = '<company-slug>';
```

**If exists:** Verify all fields are correct. Update if needed.
**If missing:** STOP. Companies are created during Forge setup. Ask Steve.

**Checkpoint:** Company row exists with correct name, slug, issue_prefix, description.

### Step 2: Set the North Star Goal

Every company MUST have a company-level goal. This is the north star ALL work traces back to.

```sql
INSERT INTO forge.goals (id, company_id, title, description, level, status)
VALUES (
  gen_random_uuid(),
  '<company-id>',
  '<specific, measurable goal>',
  '<why this goal matters, what success looks like>',
  'company',
  'active'
);
```

**Rules for the goal:**
- SPECIFIC: "Ship DirtSync v1 for April 9 group ride at Burning Rock" not "Make the app better"
- MEASURABLE: Include a number, date, or concrete deliverable
- One company goal to start. Add team/agent goals AFTER the CEO is hired.

**Checkpoint:** `SELECT * FROM forge.goals WHERE company_id = '<id>' AND level = 'company'` returns at least 1 active goal.

### Sub-Goals

Break the company goal into measurable sub-goals. Each sub-goal becomes a goal with `parent_id` pointing to the company goal:

```sql
INSERT INTO forge.goals (id, company_id, parent_id, title, description, level, status)
VALUES (
  gen_random_uuid(),
  '<company-id>',
  '<parent-goal-id>',
  '<specific sub-goal>',
  '<what done looks like>',
  'team',
  'active'
);
```

**Sub-goals become issues.** When the CEO creates issues, they link them to sub-goals via `goal_id`. The goal-watcher loop auto-completes:
- Sub-goal → `completed` when ALL linked issues are `done`
- Parent goal → `completed` when ALL sub-goals are `completed`

This creates the chain: **Vision → Goal → Sub-goals → Issues → Code**

**Example for DirtSync:**
```
Goal: "Ship DirtSync v1 for April 9 group ride"
  ├─ Sub-goal: "Navigation works end-to-end" 
  │    ├─ Issue: Build nav HUD
  │    ├─ Issue: Trail routing with Valhalla
  │    └─ Issue: Offline route caching
  ├─ Sub-goal: "Trail maps display correctly"
  │    ├─ Issue: Tile rendering
  │    └─ Issue: Trail detail panel
  └─ Sub-goal: "Ride recording works"
       ├─ Issue: Silent track recording
       └─ Issue: Ride history screen
```

### Step 3: Create the Project

Every company needs at least one project linking to a code repository:

```sql
INSERT INTO forge.projects (id, company_id, name, description, status, repo_url, repo_branch)
VALUES (
  gen_random_uuid(),
  '<company-id>',
  '<project-name>',
  '<what this project builds>',
  'active',
  '<owner/repo>',
  '<branch>'
);
```

**Checkpoint:** `SELECT * FROM forge.projects WHERE company_id = '<id>'` returns 1+ active project.

### Step 4: Set Company Budget

```sql
UPDATE forge.companies SET budget_monthly_cents = <amount> WHERE id = '<company-id>';
```

Budget guidelines:
- Start conservative: 5000 cents ($50) for a new company
- Increase after first successful agent run
- 100% = hard stop (agents auto-pause)

**Checkpoint:** `budget_monthly_cents > 0` on the company record.

### Step 5: Write the Vision Doc

Create `companies/<slug>/vision/NORTH-STAR.md` with:

```markdown
# <Company Name> -- North Star Vision

**Author:** Steve McMillian
**Date:** <today>
**Status:** Living document

## The Soul
<one paragraph: what is this company, why does it exist>

## Core Features
<numbered list of what the product does>

## Deal-Breakers
<what MUST work or trust is gone>

## Anti-Patterns
<what to avoid>

## Technical Decisions
<stack, architecture, key choices>
```

**IMPORTANT:** This doc is what agents read to understand WHY they're working. If it's vague, agents will be vague. Be specific.

**Checkpoint:** File exists and contains all sections.

### Step 5b: Expert Research Phase

Before hiring builders, run scout agents to build domain expertise for the company's tech stack.

**Why:** Agents with generic knowledge produce B+ work. Agents loaded with official docs, reference analysis, and production gotchas produce A+ work. The research investment pays for itself on the first feature.

**Procedure:**
1. Identify the company's unique/novel tech stack (what can't be solved with Stack Overflow)
2. Deploy Design Scout (Gemini) to research:
   - Official documentation for each framework/library
   - Competitor UX patterns (screenshots, measurements, behaviors)
   - Best practices and known gotchas
3. Deploy Code Scout (Codex) to analyze:
   - Existing codebase structure (every View, Component, Service mapped)
   - Design system tokens from actual code (colors, fonts, spacing)
   - Architecture patterns in use (MVVM, singletons, etc.)
4. Scouts produce reference documents that get embedded in specialist AGENTS.md files
5. CEO reviews scout output before it's embedded

**Deliverables:**
- Codebase inventory (all files mapped with purpose)
- Design system doc (colors, fonts, spacing from actual code)
- Reference app analysis (competitor patterns with measurements)
- Framework-specific gotchas doc (Valhalla, Ferrostar, MapLibre, etc.)

**Checkpoint:** At least 2 reference docs exist before hiring any builder agents.

### Step 6: Verify Issue Counter

The issue counter determines the next issue identifier (e.g., DIRA-1, FORGE-6):

```sql
SELECT issue_prefix, issue_counter FROM forge.companies WHERE id = '<company-id>';
```

- New company: counter should be 0
- Migrated company: counter should match the highest existing issue number

**Checkpoint:** issue_prefix is set, issue_counter is correct.

### Step 7: Hire the CEO

The CEO is ALWAYS the first agent hired. Run the `/agent-onboarding` skill with:
- role: ceo
- reportsTo: null (reports to Board/Steve)
- can_create_agents: true
- can_create_issues: true
- adapter_type: claude (CEO needs deep reasoning)
- model: claude-opus-4-6

**STOP HERE.** Do not hire any other agents until:
1. CEO 4-file package is written and reviewed by Steve
2. CEO dry run completes successfully
3. Steve approves the CEO's first strategy proposal

After CEO is validated, the hiring order matters:

1. **CEO** (first — triages and delegates)
2. **Scouts** (second — research domain expertise)
3. **Designer** (third — needs scout research for reference docs)
4. **Architect** (fourth — needs codebase analysis from scouts)
5. **Builder** (fifth — needs specs from designer + plans from architect)
6. **QA** (sixth — needs working builds to test)
7. **Ship Engineer** (seventh — needs QA-approved work to ship)
8. **Presentation Builder** (eighth — delivers to Steve for approval)

**The auto-handoff chain:** Builder sets `in_review` → orchestrator auto-creates QA subtask → QA sets `approved` → orchestrator auto-creates Ship subtask. Agents don't need to manually delegate these handoffs.

## Completion Report

After all 7 steps, report to Steve:

```
Company Onboarding Complete: <Company Name>
- Company ID: <id>
- Slug: <slug>
- Issue Prefix: <prefix>
- Goal: <goal title>
- Project: <project name> (<repo>)
- Budget: $<amount>/month
- Vision: companies/<slug>/vision/NORTH-STAR.md
- CEO: PENDING (run /agent-onboarding next)
```

## CONSEQUENCES

- Skipping the goal = agents work on random things with no north star
- Skipping the vision doc = agents don't understand WHY
- Skipping the budget = unlimited spend with no guardrails
- Hiring agents before the CEO = no one to triage, delegate, or verify
- No sub-goals = no way to track progress toward the north star
- No expert research phase = agents guess instead of knowing = B+ output
- Hiring builders before scouts = builders lack domain knowledge = rework
- Not linking issues to goals = goal-watcher can't auto-complete = manual tracking
