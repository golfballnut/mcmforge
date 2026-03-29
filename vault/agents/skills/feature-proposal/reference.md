# feature-proposal: Reference & Gotchas

## Bad Proposal Patterns (DO NOT)
- **Vague:** "improve performance" — instead: "reduce trail list load from 2.1s to <500ms by paginating to 20 results"
- **Huge:** "rebuild the routing system" — instead: split into 3-5 discrete proposals
- **Already done:** check vault + open PRs FIRST, every time
- **No competitive context:** why does this matter vs OnX? Always answer this.
- **No data:** "users want this" without trail counts, feedback, or competitive evidence = weak proposal

## Good Proposal Signals
- Specific enough to create a task_queue entry from the proposal directly
- Competitive gap is named: "OnX has X, we don't"
- Effort estimate is realistic (1 day ≠ "Small" for multi-file changes)
- Acceptance criteria are testable — could be turned into Playwright/Vitest tests

## Priority Guide
- **HIGH:** closes gap with OnX/AllTrails at parity features · unblocks revenue · fixes broken UX
- **MEDIUM:** improves user experience · improves data quality · reduces agent failure rate
- **LOW:** polish · nice-to-have · theoretical improvements

## Related Skills
- `competitive-scan` — research before proposing
- `plan-then-code` — plan after proposal is approved
- `shipping-checklist` — ship after building
