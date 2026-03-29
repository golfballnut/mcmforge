# Code Review — Workflow

## Pre-Task
1. Load codebase-aware context for the target repo
2. Load original task description (what was the agent asked to do?)
3. Check for open PRs that might conflict

## Step 1: Read the Diff
- Read every changed file completely — not just the diff, the full context
- Understand what each change does and why

## Step 2: Check Scope
- Compare changes against the original task description
- **Flag scope creep:** changed things not in the task
- **Flag missing changes:** didn't change things that were required
- Rule: if task said "add health check" and PR touches 15 files → scope creep

## Step 3: Check Correctness
- Trace the logic — will it actually work?
- Check for: off-by-one, null checks, race conditions, wrong variable
- Imports correct? Types correct? Error cases handled?

## Step 4: Check Regressions
- Could these changes break existing functionality?
- Side effects on shared utilities? CSS affecting other pages?
- Merge conflicts with other open PRs?

## Step 5: Check Security
- No secrets/API keys hardcoded
- Parameterized queries (no SQL injection)
- RLS policies on new database tables
- No unauthenticated internal endpoints

## Step 6: Deliver Verdict
```
VERDICT: APPROVE | REQUEST CHANGES | REJECT
[Specific findings with file/line references]
[Suggested fixes if REQUEST CHANGES]
```
