# feature-proposal: Workflow

## Step 1: Pre-Research (Don't Skip)
1. Check `vault/decisions/` — is this already proposed, approved, or rejected?
2. Check open PRs (`gh pr list`) — is someone already building this?
3. Check competitor apps — how do OnX/Gaia/AllTrails handle this? Can we do better?
4. Check data — does trail/user data support the need?
5. Check tech feasibility — can we build this with our current stack?

## Step 2: Write the Proposal

Use this template:
```markdown
## Feature Proposal: [Name]

### Problem
What specific user problem does this solve? Include data if available.

### Competitive Context
How do competitors handle this? What's our gap?

### Proposed Solution
- User-facing behavior (what the user sees/does)
- Technical approach (which files, APIs, services)
- Effort estimate: Small (<2h, 1 PR) / Medium (1 day, 2-3 PRs) / Large (multi-day, 5+ PRs)

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

## Step 3: Save the Proposal
- Save to `vault/decisions/YYYY-MM-DD-{feature-name}.md`
- Status: `Proposed by [agent]` — pending Steve's approval

## Quality Gates
- **Specific:** "add trail difficulty filter pills below search bar" not "improve the map"
- **Scoped:** achievable in 1-3 PRs — not a 6-month roadmap item
- **Data-backed:** reference trail counts, competitive gaps, user feedback
- **Actionable:** can be turned into a `task_queue` entry immediately
