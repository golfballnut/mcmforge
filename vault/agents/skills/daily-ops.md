# Skill: Daily Operations

## Purpose
SOP for the daily operational rhythm. Agents follow this cycle to keep the system productive and shipping code every day.

## Daily Cycle

### Morning (6 AM ET — automated by night-ops)
1. **Health Check** — PM2 processes, task queue, trail data
2. **Review overnight work** — completed tasks, blocked tasks, test failures
3. **PR Triage** — identify best PR to merge, close duplicates
4. **Generate tasks** — based on vault decisions, data quality, competitive gaps
5. **Send morning brief** — email to Steve with action items

### Continuous (every poll cycle)
1. **Execute tasks** — dispatcher picks up and runs tasks
2. **Monitor quality** — TDD gate blocks bad code, test gate catches regressions
3. **Notify on completion** — Telegram + email for completed tasks

### Evening (automated)
1. **Approval escalation** — remind Steve of pending approvals (4h)
2. **Auto-reject stale** — reject approvals older than 24h
3. **Queue overnight research** — competitive scans, trail audits

## Task Priority Rules

### Ship First
1. **Merge-ready PRs** — if CI passes and preview looks good, propose merge
2. **Bug fixes** — broken production features are #1 priority
3. **Approved specs** — implement what Steve already approved
4. **Data quality** — trail data issues that affect users

### Then Improve
5. **Feature proposals** — research and propose new features
6. **Competitive intel** — monitor OnX, AllTrails, Gaia GPS
7. **Technical debt** — refactoring, test coverage, performance

### Never
- Duplicate work that's already in an open PR
- Research that was already done in the last 24h
- Tasks that Steve explicitly rejected
- Bake-offs on code tasks (Claude always wins)

## PR Management Rules

### One PR Per Feature
- Never open a second PR for the same feature
- If the first PR needs fixes, push to the SAME branch
- If the first PR is abandoned, close it BEFORE starting a new one

### Close Stale PRs
- PRs older than 48h with no review → comment and flag for Steve
- PRs that duplicate a merged PR → close with "superseded by #X"
- PRs from failed bake-offs → close losers, keep winner

### Merge Flow
1. CI passes
2. Preview URL works
3. Steve approves (or auto-approve if low-risk and tests pass)
4. Merge to main/master
5. Verify production deploy
6. Close related tasks

## Quality Gates (Non-Negotiable)

Every code PR MUST have:
1. ✅ Tests (failing before, passing after)
2. ✅ Type check passes (`tsc --noEmit`)
3. ✅ Build passes (`next build`)
4. ✅ PR description with test evidence
5. ✅ Single responsibility (one feature per PR)
6. ✅ Under 400 lines changed

## Ideation Cadence

### Weekly
- 3 feature proposals (research + structured proposal)
- 1 competitive deep-dive (pick a competitor feature to study)
- 1 "low-hanging fruit" task (quick win, <2h)

### On Data Quality Findings
- Trail audit finds issues → create fix task immediately
- Trail audit finds opportunities → create proposal

## Related Skills
- [[agents/skills/shipping-checklist.md]] — shipping SOP
- [[agents/skills/feature-proposal.md]] — proposal SOP
- [[agents/skills/tdd-workflow.md]] — testing SOP
