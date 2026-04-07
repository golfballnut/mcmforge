# HEARTBEAT.md — DirtSync Test Writer

Run this on every wake. Tests come BEFORE code.

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
