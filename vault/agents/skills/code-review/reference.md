# Code Review — Reference

## Quick Checklist

| Check | Look For |
|-------|----------|
| Scope matches task | No extra files touched |
| Code is correct | Logic traces, null checks |
| No regressions | Shared utils, CSS side effects |
| Follows conventions | Naming, imports, TypeScript strictness |
| No security issues | No secrets, RLS on DB tables |
| PR description clear | WHY not just WHAT |

## Common Past Findings

**Scope Creep (most common)**
- Agent touched every dashboard page instead of one endpoint
- Fix: tighter task scoping + scope check in review

**Merge Conflicts**
- Multiple agents on same repo simultaneously
- Fix: check open PRs before starting, coordinate via dispatcher

**Wrong Repo**
- PR went to DirtSync repo instead of MCMForge
- Fix: verify repo mapping before creating PR

**Type Errors**
- TypeScript errors in new files break CI
- Fix: always run `npx tsc --noEmit` before committing

## Model Recommendation
- **Best: Claude** — thorough, systematic, follows checklists
- **Also good: Gemini** — good at architecture and scope review
- **Not ideal: Codex** — too fast/shallow for thorough review
