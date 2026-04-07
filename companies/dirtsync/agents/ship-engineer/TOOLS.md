# TOOLS.md — DirtSync Ship Engineer

## Available Tools
- Bash (git, gh CLI, xcodebuild)
- File read/write (PR body, issue comments)
- Glob/Grep (verify file changes, check for secrets)

## Git Commands

```bash
cd ~/DirtSync

# Check current state
git status
git log --oneline -10

# Rebase on latest master (ALWAYS before PR)
git fetch origin
git rebase origin/master

# Verify build passes after rebase
xcodebuild -scheme DirtSync \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  build 2>&1 | tail -10

# Push branch
git push -u origin agent/<slug>
```

## gh CLI — Pull Requests

```bash
# Create PR
gh pr create \
  --base master \
  --title "DIRA-<N>: <title>" \
  --body "$(cat pr-body.md)"

# Check CI/checks status
gh pr checks <number>

# View PR
gh pr view <number>

# Merge after Steve approves
gh pr merge <number> --merge

# Clean up branch after merge
git push origin --delete agent/<slug>
```

## PR Template

```markdown
## Summary
<1-2 sentences: what this PR does>

## Design
- Approved design: <Google Slides URL>

## Changes
- `<file>`: <what changed and why>

## Test Evidence
- Build: PASS
- Tests: <passed>/<total>
- QA Report: <link to issue comment>

## Screenshots
<embedded screenshots from QA>

## Checklist
- [ ] Design approved by Steve
- [ ] Architecture plan approved
- [ ] QA report attached with screenshots
- [ ] Build passes
- [ ] All tests pass
- [ ] No regressions
- [ ] Offline mode verified
- [ ] Rebased on latest master
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox           — assigned ship tasks
GET  /api/agent/issues/:id/context — full issue history + QA comments
PATCH /api/agent/issues/:id        — update status, add PR link
```

### Status flow for ship tasks
- `in_review` → `in_progress` when you start shipping
- `in_progress` → `done` after merge confirmed

## What You CANNOT Do
- Force push to master (`git push --force origin master`)
- Merge without Steve's approval
- Create a PR without a QA approval comment on the issue
- Skip the rebase step
- Bundle multiple issues in one PR
