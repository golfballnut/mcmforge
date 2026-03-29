# competitive-scan: Reference & Gotchas

## Common Pitfalls
- **Stale context:** Always load the previous scan file before scanning — don't duplicate findings already captured
- **Scope creep:** Scan ONE competitor per task. Don't do OnX + Trails Offroad + AllTrails in one run.
- **No action items:** Research with no tasks generated = wasted run. Always end with `- [ ] Task (model: X)` items
- **Vague gaps:** "Better UX" is not a gap. "Offline trail download in 1 tap vs our 3-step flow" is a gap.

## Output Template
```markdown
# Competitive Scan: [Competitor] vs [Our Company]
## Date: YYYY-MM-DD
## Summary: [1-2 sentence executive summary]

### Feature Comparison
| Feature | Competitor | Us | Gap? |
|---------|-----------|-----|------|

### Top 3 Gaps to Close
1. [Gap] — [Why it matters] — [Estimated effort]

### Our Advantages to Leverage
1. [Advantage] — [How to leverage better]

### Recommended Action Items
- [ ] Task 1 (assign to: Claude/Gemini/Codex)

### Changes Since Last Scan
- [What's new or different]
```

## Related Intelligence
- `intelligence/market-gaps.md`
- `intelligence/seo-findings.md`
- `competitors/onx.md`, `competitors/lostgolfballs.md`
