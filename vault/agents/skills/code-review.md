# Skill: Code Review

## Purpose
Review a PR for quality, correctness, scope creep, and potential regressions before Steve is asked to approve and merge. This is the quality gate in the agent pipeline.

## When to Use
- Before approving any agent-generated PR
- As an automated quality gate after PR creation
- When Steve asks "is this PR good?"
- When a PR has been flagged for manual review

## Pre-Task Context Loading
1. Load [[agents/skills/codebase-aware.md]] context for the target repo
2. Load the original task description (what was the agent asked to do?)
3. Load company profile from vault (to understand codebase conventions)
4. Check for related open PRs that might conflict

## Required Capabilities
- **Code reading** -- must be able to read and understand diffs
- **Pattern recognition** -- must spot inconsistencies with existing codebase style
- **Security awareness** -- must flag exposed secrets, SQL injection, XSS, etc.

## Execution Steps

### Step 1: Read the PR Diff
- Read every changed file completely (not just the diff -- understand the full context)
- Understand what each change does and why
- Note: do not just skim the diff. Read the surrounding code too.

### Step 2: Check Scope
- Compare the PR changes against the original task description
- **Flag scope creep:** Does it change things that weren't requested?
- **Flag missing changes:** Does it NOT change things that were requested?
- Rule of thumb: if the task said "add health check endpoint" and the PR touches 15 files, that's scope creep

### Step 3: Check Correctness
- Will the changes actually work? Trace the logic.
- Are there any bugs? (off-by-one, null checks, race conditions, wrong variable)
- Are imports correct? Are types correct?
- Does the code handle error cases?
- Are there any hardcoded values that should be configurable?

### Step 4: Check for Regressions
- Could these changes break existing functionality?
- Are there side effects? (e.g., changing a shared utility affects all callers)
- Do CSS changes affect other pages/components?
- Do database schema changes break existing queries?
- Are there merge conflicts with other open PRs?

### Step 5: Check Style
- Does the code match existing codebase conventions?
- Naming conventions (camelCase, PascalCase, kebab-case)
- Import ordering
- Comment style
- Error handling patterns
- TypeScript strictness (any types, missing null checks)

### Step 6: Check Security
- [ ] No secrets/API keys/passwords in the code
- [ ] No SQL injection vulnerabilities (parameterized queries)
- [ ] No XSS vulnerabilities (properly escaped output)
- [ ] No exposed internal endpoints without authentication
- [ ] RLS policies on any new database tables
- [ ] Environment variables used for sensitive values

### Step 7: Verdict

One of three outcomes:

**APPROVE** -- changes are correct, focused, and safe to merge
```
VERDICT: APPROVE
- Changes match the task requirements
- Code is correct and follows conventions
- No security issues found
- No regressions expected
```

**REQUEST CHANGES** -- changes are mostly good but need specific fixes
```
VERDICT: REQUEST CHANGES
Issues:
1. [Specific issue with file/line reference]
2. [Specific issue]

Suggested fixes:
1. [How to fix issue 1]
2. [How to fix issue 2]
```

**REJECT** -- changes are fundamentally wrong or dangerous
```
VERDICT: REJECT
Reason: [Why this PR should not be merged]
Recommendation: [What should be done instead]
```

## Review Checklist (Quick Reference)

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Scope matches task | | |
| Code is correct | | |
| No regressions | | |
| Follows conventions | | |
| No security issues | | |
| No hardcoded secrets | | |
| PR description is clear | | |
| Changes are minimal | | |

## Model Recommendation
- **Best: Claude** -- thorough, systematic, good at spotting subtle issues, follows checklists well
- **Also good: Gemini** -- good at high-level architecture review, catches scope creep
- **Not ideal: Codex** -- too fast/shallow for thorough review, better at writing code than reviewing it

## Common Review Findings (from past PRs)

### Scope Creep (most common issue)
- Gemini 3.1 Pro health check PR touched every dashboard page instead of just adding one endpoint
- Fix: tighter scoping in prompts + scope check in review

### Merge Conflicts
- Multiple agents working on same repo simultaneously creates conflicts
- Fix: check for open PRs before starting new tasks, coordinate through dispatcher

### Wrong Repo
- PR 186 went to DirtSync instead of MCMForge
- Fix: verify repo mapping before creating PR, validate in review

### Raw Markdown in Output
- Research emails showed raw markdown instead of rendered HTML
- Fix: check output format matches the delivery channel

## Related Skills
- Depends on: [[agents/skills/codebase-aware.md]]
- Reviews output of: [[agents/skills/visual-bug-fix.md]], [[agents/skills/plan-then-code.md]]
- Related decisions: [[decisions/2026-02-24-skills-architecture.md]]
