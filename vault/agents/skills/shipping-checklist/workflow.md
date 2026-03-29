# Shipping Checklist — Workflow

## Gate 1: Tests Pass
- [ ] All existing tests pass (no regressions)
- [ ] New tests cover the changed behavior
- [ ] Test evidence in PR description (before/after failure+pass output)
- [ ] No skipped tests without explanation

## Gate 2: Build Succeeds
- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] `npm run build` / `next build` succeeds
- [ ] No new warnings introduced

## Gate 3: PR Quality
- [ ] Single responsibility — PR does ONE thing
- [ ] Under 400 lines changed (if larger, split it)
- [ ] Clear title: `feat:`, `fix:`, `refactor:`, `test:`
- [ ] PR description explains WHY, not just WHAT
- [ ] No commented-out code or console.log left in
- [ ] No hardcoded secrets or credentials

## Gate 4: Review
- [ ] Self-review diff before requesting merge
- [ ] Check Vercel preview URL
- [ ] Manually test the feature on preview
- [ ] No merge conflicts with base branch

## Gate 5: Post-Ship
- [ ] CI checks all green before merging
- [ ] Verify production deployment (Vercel auto-deploy)
- [ ] Spot-check production URL
- [ ] Update task_queue status to "done"
- [ ] Notify Steve via Telegram if significant feature

## Red Flags — DO NOT Ship
- Tests fail but "think it's fine"
- Build warnings you don't understand
- PR touches files unrelated to the task
- You can't explain every line you changed
- Preview URL shows broken UI
