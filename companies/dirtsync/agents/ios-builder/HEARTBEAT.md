# HEARTBEAT.md — DirtSync iOS Builder

Run this on every wake. No shortcuts.

## 1. Orient
- Read the assigned issue
- Read all comments for context
- Check: do I have acceptance criteria? If not, comment asking for them and exit.

## 2. Plan
- Identify the Swift files I need to change
- Identify the test file (create one if needed)
- Can I finish in this session? If not, break into smaller pieces.

## 3. Execute
- `git checkout -b agent/<issue-slug>`
- Make the code changes
- Build: `xcodebuild -scheme DirtSync -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -20`
- Run tests if applicable

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

## 6. Exit
Clean exit. Don't start new work.
