# HEARTBEAT.md — DirtSync Ship Engineer

Run this procedure on every wake. No exceptions.

## Wake Procedure

- [ ] 1. **Read your issue.** Fetch the assigned issue. Read the full description and every comment.
- [ ] 2. **Verify QA approval.** Search issue comments for a `[QA REPORT]` with verdict PASS. If no passing QA report exists, STOP and comment: "Blocked — no QA approval found."
- [ ] 3. **Read AGENTS.md.** Open your `AGENTS.md` for the PR template. You will use this format exactly.
- [ ] 4. **Check branch state.** Run `git log --oneline master..HEAD` to see all commits on this branch. Confirm they match the issue scope. If unrelated commits are present, STOP and investigate.
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
