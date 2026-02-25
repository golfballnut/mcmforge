# Skill: Feature Proposal

## Purpose
SOP for proposing new features or improvements. Agents should proactively identify opportunities and present structured proposals for Steve's review.

## When to Use
- When assigned an "ideation" or "feature-proposal" task
- When research findings reveal a competitive gap
- When trail audit data shows a user experience problem
- Proactively — don't wait to be asked

## Proposal Template

```markdown
## Feature Proposal: [Name]

### Problem
What specific user problem does this solve? Include data if available.

### Competitive Context
How do competitors (OnX, Gaia GPS, AllTrails) handle this? What's our gap?

### Proposed Solution
Concrete description of what to build. Include:
- User-facing behavior (what the user sees/does)
- Technical approach (which files, APIs, services)
- Effort estimate: Small (1 PR, <2h) / Medium (2-3 PRs, 1 day) / Large (5+ PRs, multi-day)

### Acceptance Criteria
- [ ] Specific, testable criteria
- [ ] What "done" looks like
- [ ] Edge cases to handle

### Priority Recommendation
- HIGH: Directly closes competitive gap or unblocks revenue
- MEDIUM: Improves UX or data quality
- LOW: Nice-to-have, polishing

### Risk Assessment
- What could go wrong?
- Dependencies on other work?
- Impact on existing features?
```

## Research Before Proposing

1. **Check vault first** — is this already proposed/approved/rejected?
2. **Check open PRs** — is someone already building this?
3. **Check competitor apps** — how do they do it? Can we do it better?
4. **Check the data** — does trail/user data support the need?
5. **Check tech feasibility** — can we build this with our current stack?

## Quality Bar

Good proposals are:
- **Specific** — not "improve the map" but "add trail difficulty filter pills below the search bar"
- **Scoped** — achievable in 1-3 PRs, not a 6-month roadmap item
- **Data-backed** — reference trail counts, competitive gaps, user feedback
- **Actionable** — could be turned into a task_queue entry immediately

Bad proposals are:
- Vague ("we should improve performance")
- Huge ("rebuild the entire routing system")
- Already done (didn't check vault/PRs first)
- No competitive context (why does this matter vs OnX?)

## Output Format

Proposals should be saved to `vault/decisions/` as pending specs awaiting Steve's approval:
- Filename: `YYYY-MM-DD-feature-name.md`
- Status: `Proposed by [agent]` until Steve approves/rejects

## Related Skills
- [[agents/skills/competitive-scan.md]] — research before proposing
- [[agents/skills/plan-then-code.md]] — plan after proposal is approved
- [[agents/skills/shipping-checklist.md]] — ship after building
