# Skill: Plan Then Code

## Purpose
For complex tasks, create an implementation plan first, get it reviewed, then execute. This prevents the "scope creep PR with 8 merge conflicts" problem.

## When to Use
- Tasks touching 3+ files
- Architectural changes (new routes, new database tables, new API endpoints)
- New features (not just bug fixes)
- When previous attempts at the task failed or produced scope-creep PRs
- When the task description is vague and needs interpretation
- Any task where the wrong approach would waste significant time

## When NOT to Use
- Simple one-file bug fixes (use [[agents/skills/visual-bug-fix.md]] instead)
- Research/analysis tasks (no code involved)
- Configuration changes (env vars, settings)

## Pre-Task Context Loading
1. Load company profile and architecture docs from vault
2. Load relevant file contents (read the actual code, don't guess)
3. Load related decision logs from [[decisions/]]
4. Check recent PRs (last 5 merged) for patterns and conventions
5. Load [[agents/skills/codebase-aware.md]] context

## Execution Steps

### Step 1: Understand
- Read ALL relevant code files completely (don't skim)
- Understand the current architecture, patterns, and conventions
- Identify the exact scope of what needs to change
- List any assumptions and validate them against the code
- Note: "I think this file does X" is not good enough -- read it and confirm

### Step 2: Plan
Write a step-by-step implementation plan:
```markdown
## Implementation Plan: [Task Title]

### Files to Modify
1. `path/to/file1.ts` -- [what changes and why]
2. `path/to/file2.ts` -- [what changes and why]

### Files to Create (if any)
1. `path/to/new-file.ts` -- [purpose]

### Steps (in order)
1. [Specific change with code snippet or pseudocode]
2. [Specific change]
3. [Specific change]

### What This Does NOT Change
- [Explicitly list out-of-scope items to prevent scope creep]

### Risks / Edge Cases
- [What could go wrong]
- [What to watch out for]

### Testing
- [How to verify this works]
```

### Step 3: Validate
- Does the plan match the task requirements exactly? (no more, no less)
- Does the plan conflict with any known issues or recent changes?
- Would the plan cause merge conflicts with any open PRs?
- Is the plan achievable in one focused PR? (if not, split it)

### Step 4: Execute
- Implement EXACTLY as planned -- no improvisation
- If you discover something unexpected, STOP and update the plan before continuing
- Make changes in the order specified in the plan
- No scope creep: if you notice something else that needs fixing, log it as a separate task

### Step 5: Test
- Run any available tests (unit tests, linting, type checking)
- If no automated tests exist, manually verify the changes make sense
- Check for TypeScript errors, import issues, missing dependencies

### Step 6: Create PR
- **Title format:** `feat: {brief description}` or `fix: {brief description}`
- **Description must include:**
  - The implementation plan (so the reviewer can verify you followed it)
  - What was changed and why
  - What was explicitly NOT changed (scope boundaries)
  - How to test/verify the changes

## Model Recommendation

### By Phase
| Phase | Best Model | Why |
|-------|-----------|-----|
| Planning | Gemini | Broad thinking, good at architecture, fast |
| Coding | Claude | Precise, follows plans well, good at multi-file changes |
| Quick fixes within plan | Codex | Fast, focused, minimal |

### For Full Task (single model)
- **Best: Claude** -- can plan AND code, follows instructions precisely, less likely to scope-creep
- **Also good: Gemini** -- good at planning, can code but sometimes over-engineers
- **Risky: Codex** -- fast but may skip the planning step or oversimplify

## Common Pitfalls
- Skipping Step 1 (understand) and jumping straight to coding based on assumptions
- Plan says "modify 3 files" but the PR touches 15 files (scope creep)
- Not reading existing code patterns and using a different style
- Creating a plan but then deviating from it during execution
- Over-planning simple tasks (if it's a one-file fix, just fix it)

## Example: Good Plan vs Bad Plan

### Bad Plan
> "I'll add the health check endpoint. I'll also refactor the routing, update the dashboard pages, and add error handling everywhere."

### Good Plan
> "Add GET /api/health endpoint. Create one new file: `app/api/health/route.ts`. Returns `{ status: 'ok', timestamp: Date.now() }`. No other files change."

## Related Skills
- [[agents/skills/codebase-aware.md]] -- MUST load before planning
- [[agents/skills/code-review.md]] -- use to review the PR after execution
- [[agents/skills/visual-bug-fix.md]] -- use instead for simple visual fixes
