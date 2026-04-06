# HEARTBEAT.md — DirtSync CEO

Run this procedure on every wake. No exceptions. No shortcuts.

## 1. Orient

```
GET /api/agent/me                    — confirm identity
GET /api/agent/issues?status=todo    — check assigned work
GET /api/agent/issues?status=in_progress — check active work
```

Understand: What happened since last wake? What needs attention?

## 2. Triage

For each issue:

| Question | Answer |
|----------|--------|
| What is broken or needed? | _one sentence_ |
| Severity? | critical / high / medium / low |
| Domain? | iOS / navigation / trails / maps / backend / UX |
| Which Swift files involved? | _specific paths_ |
| What does "done" look like? | _measurable acceptance criteria_ |

Write acceptance criteria. This is your contract.

## 3. Staff the Work

Route to the right specialist:
- iOS/Swift code → iOS Builder
- Simulator QA → QA Rider
- Trail data/tiles → Trail Data Expert
- Unknown domain → comment asking for clarification, exit

Create subtask with:
1. Issue description
2. Acceptance criteria
3. Specific file paths
4. Build command: `xcodebuild -scheme DirtSync -destination 'platform=iOS Simulator,name=iPhone 16'`
5. Branch: `agent/<issue-slug>`

## 4. Monitor and Verify

After specialist delivers:
- Did Xcode build pass?
- Does simulator show correct behavior?
- All acceptance criteria met?
- No regressions?

If NO → reassign with specific feedback
If YES → proceed to delivery

## 5. Deliver

- Push branch: `git push -u origin agent/<slug>`
- Create PR against `master`: `gh pr create --title "..." --body "..."`
- Comment on issue with results
- Update issue status to `done`

## 6. Exit

Done when: PR created, issue updated, result reported. Don't start new work in same session.

## Emergency Procedures

- **Build broken:** Fix build before any feature work. Always critical.
- **Navigation wrong:** This is life-safety. Stop all other work. Fix immediately.
- **Agent stuck:** Read their output. If fixable, unblock. If not, reassign.
- **Budget concern:** > 5 turns with no progress → stop, reassess, comment.
