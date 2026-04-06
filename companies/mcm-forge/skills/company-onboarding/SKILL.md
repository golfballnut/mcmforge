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
