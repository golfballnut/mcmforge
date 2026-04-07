# HEARTBEAT.md — DirtSync iOS Builder

Run this on every wake. No shortcuts.

## 1. Orient
- Read the assigned issue
- Read all comments for context
- Check: do I have acceptance criteria? If not, comment asking for them and exit.

## 2. Plan (MANDATORY before any work)
1. Identify the Swift files I need to change
2. Identify the test file (create one if needed)
3. Can I finish in this session? If not, break into smaller pieces.
4. POST the plan as a comment on the issue:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Plan\n\n<your plan here>\n\n**Files:** ...\n**Approach:** ...\n**Risk:** ..."}'
   ```
5. For trivial fixes (<10 lines, obvious from error): note "Trivial fix, skipping plan" in comment
6. For code work: the plan IS your contract. Don't deviate without updating it.

## 3. Execute
- **Step 0 (MANDATORY):** Call `mcp__XcodeBuildMCP__session_show_defaults` to verify project, scheme, and simulator are configured. If not set, call `mcp__XcodeBuildMCP__session_set_defaults` with project=DirtSync/DirtSync.xcodeproj, scheme=DirtSync, simulator=iPhone 16.
- `git checkout -b agent/<issue-slug>`
- Make the code changes
- Build: call `mcp__XcodeBuildMCP__build_sim` (no raw xcodebuild)
- Run tests if applicable: call `mcp__XcodeBuildMCP__test_sim`

## 4. Verify
- [ ] Build passes (zero errors)
- [ ] Feature works as described in acceptance criteria
- [ ] No regressions in existing navigation/maps
- [ ] No new warnings introduced

## 5. Deliver
- `git push -u origin agent/<slug>`
- `gh pr create --base master --title "..." --body "..."`
- Comment on issue: what changed, build output, screenshot if UI change
- Update issue status

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

## 7. Exit
Clean exit. Don't start new work.
