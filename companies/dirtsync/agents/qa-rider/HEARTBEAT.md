# HEARTBEAT.md — DirtSync QA Rider

Run this procedure on every wake. No exceptions.

## Wake Procedure

- [ ] 1. **Read your issue.** Fetch the assigned issue. Read the full description, acceptance criteria, and every comment.
- [ ] 2. **Find the test plan.** Search issue comments for the `[IMPLEMENTATION PLAN]` from Solutions Architect. Extract the test plan section. If no test plan exists, STOP and comment: "Blocked — no test plan found in implementation plan."
- [ ] 3. **Read AGENTS.md.** Open your `AGENTS.md` for the QA report format. You will use this format exactly.
- [ ] 4. **Pull latest code.** Run `git fetch origin && git status`. Confirm you are on the correct feature branch for this issue. If not, check it out.
- [ ] 5. **Step 0 (MANDATORY): Verify session defaults.** Call `mcp__XcodeBuildMCP__session_show_defaults`. If project, scheme, or simulator are not set, call `mcp__XcodeBuildMCP__session_set_defaults` with project=DirtSync/DirtSync.xcodeproj, scheme=DirtSync, simulator=iPhone 16.
- [ ] 5a. **Plan (MANDATORY before any work).** Write a plan: which acceptance criteria to test, which states/interactions to cover, what could go wrong. POST the plan as a comment:
  ```
  curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
    -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
    -H "Content-Type: application/json" \
    -d '{"comment": "## QA Plan\n\n**Files:** ...\n**Approach:** ...\n**Risk:** ..."}'
  ```
  For trivial fixes (<10 lines, obvious from error): note "Trivial fix, skipping plan" in comment.
- [ ] 5b. **Build in simulator.** Call `mcp__XcodeBuildMCP__build_sim` (do NOT use raw xcodebuild). If the build fails, STOP and comment on the issue: "BUILD FAILED" with the full error output. Do not proceed.
- [ ] 6. **Screenshot every state.** For each screen and state listed in the acceptance criteria:
    - Navigate to the screen in the simulator
    - Take a screenshot and save to `qa-screenshots/`
    - Name format: `<issue-id>-<screen>-<state>.png`
- [ ] 7. **Walk through interactions.** Test every tap, swipe, and transition listed in the design spec. Record pass/fail for each.
- [ ] 8. **Test edge cases.** Explicitly test: empty state, error state, offline mode, rapid taps, back navigation. Screenshot each.
- [ ] 9. **Run superpowers:verification-before-completion.** Do NOT skip this. Verify every acceptance criterion has evidence (screenshot or log). If any criterion lacks evidence, go back and capture it.
- [ ] 10. **Produce QA report.** Write the report using the AGENTS.md format. Include:
    - Build status (pass/fail, commit hash)
    - Test matrix: one row per acceptance criterion, with pass/fail and screenshot path
    - Bugs found (if any): steps to reproduce, screenshot, severity
    - Final verdict: PASS or FAIL
- [ ] 11. **Comment on issue.** Post the full QA report as an issue comment. Tag it `[QA REPORT]` at the top. Attach all screenshots.
- [ ] 12. **Update issue status.** If PASS, move to `approved`. If FAIL, move to `in_progress` and tag the builder.
- [ ] 13. **Log your work.** Record verdict, screenshot count, and bugs found in your run events.
- [ ] 14. **Report Results (MANDATORY — your work doesn't count without this).** POST your results as a comment on the issue:
  ```
  curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
    -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
    -H "Content-Type: application/json" \
    -d '{"comment": "## Results\n\n<summary of what you did>\n\n**Files changed:** ...\n**Status:** ...\n**Next steps:** ..."}'
  ```
  If you're running low on turns, STOP working and POST what you have so far. Update issue status via PATCH (in_review, approved, done, blocked). Your work does NOT count unless it's posted as a comment. The next agent in the chain reads your comment to continue.
