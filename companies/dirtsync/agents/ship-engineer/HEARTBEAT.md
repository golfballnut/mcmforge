# HEARTBEAT.md — DirtSync Ship Engineer

Run this procedure on every wake. No exceptions.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory (`companies/dirtsync/agents/ship-engineer/LESSONS.md`). Create with this header if missing:

   ```
   # Lessons Learned — Ship Engineer

   Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

   ---
   ```

2. Scan for past lessons about rebase conflicts, CI failures, or PR creation issues.
3. If a past lesson with `Outcome: worked` matches, try that approach first.

See `vault/agents/skills/lessons-learned-loop.md`.

## Wake Procedure

- [ ] 1. **Read your issue.** Fetch the assigned issue. Read the full description and every comment.
- [ ] 2. **Verify QA approval.** Search issue comments for a `[QA REPORT]` with verdict PASS. If no passing QA report exists, STOP and comment: "Blocked — no QA approval found."
- [ ] 3. **Read AGENTS.md.** Open your `AGENTS.md` for the PR template. You will use this format exactly.
- [ ] 4. **Check branch state.** Run `git log --oneline master..HEAD` to see all commits on this branch. Confirm they match the issue scope. If unrelated commits are present, STOP and investigate.
- [ ] 4b. **Plan (MANDATORY before any work).** Write a plan: what branch ops, what build steps, what could go wrong. POST the plan as a comment:
  ```
  curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
    -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
    -H "Content-Type: application/json" \
    -d '{"comment": "## Ship Plan\n\n**Files:** ...\n**Approach:** ...\n**Risk:** ..."}'
  ```
  For trivial fixes (<10 lines, obvious from error): note "Trivial fix, skipping plan" in comment.
- [ ] 5. **Rebase on master.** Run `git fetch origin && git rebase origin/master`. If conflicts arise, resolve them. After rebase, verify no files were lost: `git diff origin/master --stat`.
- [ ] 6. **Final build.** Run `xcodebuild` targeting the iOS Simulator. If the build fails, STOP and comment on the issue: "POST-REBASE BUILD FAILED" with the full error. Do not proceed.
- [ ] 7. **Run superpowers:finishing-a-development-branch.** Follow every step. This is your quality gate before shipping.
- [ ] 8. **Push the branch.** Run `git push origin HEAD --force-with-lease`.
- [ ] 9. **Create the PR.** Use `gh pr create` with:
    - Title from the issue title
    - Body using the AGENTS.md PR template
    - Base branch: `master`
    - Include the QA report link and screenshot references
- [ ] 10. **Verify the PR.** Run `gh pr view` and confirm the PR exists, targets `master`, and has the correct body.
- [ ] 11. **Comment on issue.** Post the PR URL on the issue. Tag it `[SHIPPED]` at the top.
- [ ] 12. **Update issue status.** Move the issue to `in_review`.
- [ ] 13. **Log your work.** Record the PR number, URL, and commit count in your run events.
- [ ] 14. **Report Results (MANDATORY — your work doesn't count without this).** POST your results as a comment on the issue:
  ```
  curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
    -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
    -H "Content-Type: application/json" \
    -d '{"comment": "## Results\n\n<summary of what you did>\n\n**Files changed:** ...\n**Status:** ...\n**Next steps:** ..."}'
  ```
  If you're running low on turns, STOP working and POST what you have so far. Update issue status via PATCH (in_review, approved, done, blocked). Your work does NOT count unless it's posted as a comment. The next agent in the chain reads your comment to continue.

## 15. Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you hit this run (rebase conflict, post-rebase build failure, CI red, gh pr create error), append one entry to the TOP of `companies/dirtsync/agents/ship-engineer/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit with your work.
