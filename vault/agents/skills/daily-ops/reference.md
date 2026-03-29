# daily-ops: Reference & Gotchas

## Common Failure Modes
- **Duplicate PRs:** Always check open PRs before creating a new one. Use `gh pr list` first.
- **Research re-run:** Check `task_queue` for recent research tasks before queueing another. 24h cooldown.
- **Bake-offs on code:** Wastes tokens. Claude handles code tasks. Don't assign code to Gemini or Codex.
- **Stale auto-approve:** Auto-reject at 24h prevents dead approvals blocking the queue.

## Task Priority Cheat Sheet
| Priority | Type | Action |
|---|---|---|
| P0 | Broken production | Fix immediately |
| P1 | Merge-ready PR | Propose merge |
| P2 | Approved spec | Implement |
| P3 | Data quality issue | Fix or propose |
| P4 | Feature proposal | Research + propose |
| P5 | Competitive intel | Schedule scan |

## Never Do
- Reopen a task Steve explicitly rejected
- Create tasks that duplicate an open PR
- Research the same topic researched in the last 24h
- Skip the TDD gate "just this once"

## Related Skills
- `shipping-checklist` — full shipping SOP
- `feature-proposal` — proposal SOP
- `tdd-workflow` — testing SOP
