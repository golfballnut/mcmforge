# HEARTBEAT.md — DirtSync CEO

Run this procedure on every wake. No exceptions. No shortcuts.

## 1. Orient

```
curl -s -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" -H "X-Forge-Run-Id: $FORGE_RUN_ID" $FORGE_API_URL/api/agent/me
curl -s -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" -H "X-Forge-Run-Id: $FORGE_RUN_ID" $FORGE_API_URL/api/agent/me/inbox
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

## 3. Plan (MANDATORY before delegating)
1. For each issue, write delegation plan: which agent, what acceptance criteria, what files
2. POST the triage plan as a comment on the issue before creating subtasks:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Triage Plan\n\n**Agent:** ...\n**Acceptance criteria:** ...\n**Files:** ..."}'
   ```
3. Review: is this the right agent? Are the acceptance criteria specific enough?
4. Only THEN create subtasks and assign agents

## 4. Staff the Work

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

## 5. Monitor and Verify

After specialist delivers:
- Did Xcode build pass?
- Does simulator show correct behavior?
- All acceptance criteria met?
- No regressions?

If NO → reassign with specific feedback
If YES → proceed to delivery

## 6. Report Results (MANDATORY — your work doesn't count without this)
1. POST your results as a comment on the issue:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Results\n\n<summary of what you did>\n\n**Files changed:** ...\n**Status:** ...\n**Next steps:** ..."}'
   ```
2. If you're running low on turns, STOP working and POST what you have so far
3. Update issue status via PATCH (in_review, approved, done, blocked)
4. Your work does NOT count unless it's posted as a comment. The next agent in the chain reads your comment to continue.

## 7. Deliver

- Push branch: `git push -u origin agent/<slug>`
- Create PR against `master`: `gh pr create --title "..." --body "..."`
- Update issue status to `done`

## 8. Exit

Done when: PR created, issue updated, result reported. Don't start new work in same session.

## Emergency Procedures

- **Build broken:** Fix build before any feature work. Always critical.
- **Navigation wrong:** This is life-safety. Stop all other work. Fix immediately.
- **Agent stuck:** Read their output. If fixable, unblock. If not, reassign.
- **Budget concern:** > 5 turns with no progress → stop, reassess, comment.
