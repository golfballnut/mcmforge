# daily-ops: Workflow

## Morning Cycle (6 AM ET — automated by night-ops)
1. **Health Check** — PM2 processes, task queue, trail data status
2. **Review overnight work** — completed tasks, blocked tasks, test failures
3. **PR Triage** — identify best PR to merge, close duplicates/stale PRs
4. **Generate tasks** — based on vault decisions, data quality findings, competitive gaps
5. **Send morning brief** — email to Steve with action items

## Continuous Cycle (every poll)
1. **Execute tasks** — dispatcher picks up and runs pending tasks
2. **Monitor quality** — TDD gate blocks bad code, test gate catches regressions
3. **Notify on completion** — Telegram + email for completed tasks

## Evening Cycle (automated)
1. **Approval escalation** — remind Steve of pending approvals after 4h
2. **Auto-reject stale** — reject approvals older than 24h
3. **Queue overnight research** — competitive scans, trail audits

## PR Management Rules

### One PR Per Feature
- Never open a second PR for the same feature
- If the first PR needs fixes, push to the SAME branch
- If the first PR is abandoned, close it BEFORE starting a new one

### Close Stale PRs
- PRs older than 48h with no review → comment and flag for Steve
- Duplicate of merged PR → close with "superseded by #X"
- Failed bake-off losers → close, keep winner

### Merge Flow
1. CI passes → 2. Preview URL works → 3. Steve approves (or auto-approve if low-risk)
4. Merge to main → 5. Verify production deploy → 6. Close related tasks

## Ideation Cadence
- **Weekly:** 3 feature proposals · 1 competitive deep-dive · 1 low-hanging fruit task
- **On data quality findings:** create fix task immediately or create proposal

## Quality Gates (Non-Negotiable)
Every code PR: ✅ Tests (red→green) ✅ `tsc --noEmit` passes ✅ `next build` passes
✅ PR description with test evidence ✅ Single responsibility ✅ <400 lines changed
