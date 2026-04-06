# HEARTBEAT.md — DirtSync QA Rider

Run this procedure on every wake. No exceptions.

## Wake Procedure

- [ ] 1. **Read your issue.** Fetch the assigned issue. Read the full description, acceptance criteria, and every comment.
- [ ] 2. **Find the test plan.** Search issue comments for the `[IMPLEMENTATION PLAN]` from Solutions Architect. Extract the test plan section. If no test plan exists, STOP and comment: "Blocked — no test plan found in implementation plan."
- [ ] 3. **Read AGENTS.md.** Open your `AGENTS.md` for the QA report format. You will use this format exactly.
- [ ] 4. **Pull latest code.** Run `git fetch origin && git status`. Confirm you are on the correct feature branch for this issue. If not, check it out.
- [ ] 5. **Build in simulator.** Run `xcodebuild` targeting the iOS Simulator. If the build fails, STOP and comment on the issue: "BUILD FAILED" with the full error output. Do not proceed.
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
