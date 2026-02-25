# Skill: Shipping Checklist

## Purpose
Standard Operating Procedure for shipping code from PR to production. Every code task must follow this process to ensure we ship reliable, tested, deployable features.

## When to Use
- After creating a PR
- When reviewing someone else's PR
- Before approving a merge

## Pre-Ship Checklist

### 1. Tests Pass
- [ ] All existing tests pass (no regressions)
- [ ] New tests cover the changed behavior
- [ ] Test evidence in PR description (before/after)
- [ ] No skipped tests without explanation

### 2. Build Succeeds
- [ ] `tsc --noEmit` passes (no type errors)
- [ ] `npm run build` / `next build` succeeds
- [ ] No new warnings introduced

### 3. PR Quality
- [ ] Single responsibility — PR does ONE thing
- [ ] Under 400 lines changed (if larger, split it)
- [ ] Clear PR title: `feat:`, `fix:`, `refactor:`, `test:`
- [ ] PR description explains WHY, not just WHAT
- [ ] No commented-out code
- [ ] No console.log debugging left in
- [ ] No hardcoded secrets or credentials

### 4. Review
- [ ] Self-review diff before requesting review
- [ ] Check Vercel preview URL (for web projects)
- [ ] Test the feature manually on preview
- [ ] No merge conflicts with base branch

### 5. Ship
- [ ] CI checks all green
- [ ] Preview URL works correctly
- [ ] Merge to main/master
- [ ] Verify production deployment (Vercel auto-deploy)
- [ ] Spot-check production URL

## Post-Ship
- [ ] Close related issues/tasks
- [ ] Update task_queue status to "done"
- [ ] Notify Steve via Telegram if significant feature

## Red Flags — DO NOT Ship
- Tests fail but you "think it's fine"
- Build has warnings you don't understand
- PR touches files unrelated to the task
- You can't explain every line you changed
- Preview URL shows broken UI

## Related Skills
- [[agents/skills/tdd-workflow.md]] — test-first development
- [[agents/skills/code-review.md]] — review standards
- [[agents/skills/plan-then-code.md]] — prevent scope creep
