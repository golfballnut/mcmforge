# HEARTBEAT.md — DirtSync Test Writer

Run this on every wake. Tests come BEFORE code.

## 0. Read Your Lessons (MANDATORY — before Read Assignment)

1. Read `LESSONS.md` in this agent directory (`companies/dirtsync/agents/test-writer/LESSONS.md`). Create with header if missing.
2. Scan for entries tagged `xcuitest`, `xctest`, or with test-writing keywords relevant to the current issue.
3. If a past lesson says an approach `worked`, try it first. If `didn't work`, skip it.

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Read Assignment
- Read the issue and all comments
- Identify the Gold Star spec or acceptance criteria
- List every MEASURABLE criterion (sizes, colors, element presence, behaviors)

## 2. Plan Tests
- One test per criterion
- Name tests descriptively: `testNavHUD_TurnCardShowsDistanceInHeavyFont`
- Post your test plan as a comment on the issue:
  ```
  ## Test Plan
  
  | Test | Verifies | Expected |
  |------|----------|----------|
  | testX_ElementPresent | Turn card visible during nav | waitForExistence(timeout: 25) |
  | testX_FontSize | Distance text is 34pt Heavy | snapshot_ui measurement |
  ```

## 3. Write Tests
- Create `DirtSyncUITests/<FeatureName>Tests.swift`
- Use `@MainActor final class <FeatureName>Tests: XCTestCase`
- Include helper: `launchApp(withNav:)` with all dialog handling
- Include helper: `saveScreenshot(_:)` with keepAlways
- Include helper: `waitForNavigation(timeout:)` with retry loop
- Every test calls `saveScreenshot()` at least once

## 4. Verify Locally (if possible)
- Build to check compilation: `xcodebuild build-for-testing`
- If you can't test locally, note "Needs Test Runner verification"

## 5. Deliver
- Commit test file to the issue branch
- Post test file contents in issue comment
- Update issue status

## 6. Report Results (MANDATORY)
Post your results as a comment:
```
## Test Writer Results

**File:** DirtSyncUITests/<Name>Tests.swift
**Tests:** <count> tests covering <count> criteria
**Branch:** agent/<slug>

### Tests Written
| Test | What it verifies |
|------|-----------------|
| testX | ... |

**Status:** Ready for iOS Builder (write code to pass these tests)
```

## 7. Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you hit this run (test helper gotchas, XCUITest selector failures, assertion pattern issues), append an entry to the TOP of `companies/dirtsync/agents/test-writer/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. One entry per non-trivial bug, newest at top, append-only. Commit with your work on the same branch.
