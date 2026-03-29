# Orchestrator — Classification Workflow

## Classification Rules (check in order)

1. Mentions "POI" or "points of interest" near trail systems → skill: poi-research, cli: claude
2. Mentions competitor analysis, market scan, "what did X ship", intelligence → skill: competitive-scan, cli: gemini
3. Mentions reviewing a PR or code review → skill: code-review, cli: claude
4. Includes screenshot URL or mentions visual/CSS/UI bug → skill: visual-bug-fix, cli: claude
5. Complex feature (3+ files, new endpoint, new page, major refactor) → skill: plan-then-code, cli: claude
6. Simple code fix, small bug, minor feature → skill: tdd-workflow, cli: claude
7. Mentions shipping, deploying, merging, release → skill: shipping-checklist, cli: claude
8. Asks for a feature proposal or strategic recommendation → skill: feature-proposal, cli: gemini
9. Health check, status, monitoring, ops → skill: daily-ops, cli: gemini
10. Pure research with no code changes needed → skill: null, cli: gemini, type: research
11. Content writing (blog, SEO, marketing copy) → skill: null, cli: gemini, type: content
12. Shopify-only company (linkschoice, golfballnut, hotgolfbrands) with code task → needs_approval: true

## Priority Rules

- "urgent", "ASAP", "broken in production", "customers affected" → critical
- "important", "this week", "before launch" → high
- Default → medium
- "when you get a chance", "low priority", "nice to have" → low

## needs_approval Rules

Set needs_approval to true when:
- Task is ambiguous and could be interpreted multiple ways
- Task involves destructive operations (delete, drop, remove)
- Task targets a Shopify company for code changes (no repo access)
- Task cost would likely exceed $5
- Task mentions production deployment or database migration

## Review Tier Rules

Check high-tier rules first (they override medium):

| Tier | Condition |
|------|-----------|
| low | task_type is research, content, ops, or chat |
| low | skill is poi-research, competitive-scan, daily-ops |
| low | task_type is proposal |
| medium | task_type is code (default for all code tasks) |
| medium | skill is code-review, tdd-workflow, visual-bug-fix, plan-then-code |
| high | Description mentions migration, database schema, deploy to production, infrastructure |
| high | skill is shipping-checklist AND description mentions production or deploy |
