# Skill: Plan Then Code

## Goal
For complex tasks, create an implementation plan first, get it reviewed, then execute. This prevents the "scope creep PR with 8 merge conflicts" problem.

## When to Use
- Tasks touching 3+ files
- Architectural changes (new routes, new database tables, new API endpoints)
- New features (not just bug fixes)
- When previous attempts at the task failed
- When the task description is vague

## When NOT to Use
- Simple one-file bug fixes (use visual-bug-fix instead)
- Research/analysis tasks (no code involved)
- Configuration changes (env vars, settings)

## Model
Claude — can plan AND code, follows instructions precisely, less likely to scope-creep

## Related Skills
- codebase-aware (MUST load before planning)
- code-review (use to review the PR after execution)
- visual-bug-fix (use instead for simple visual fixes)
