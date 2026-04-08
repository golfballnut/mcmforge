---
name: gold-star-testing
description: How to run Gold Star XCUITests, parse failures, fix based on assertions, and use test-driven inner loop
---

# Gold Star Testing Skill

Load this skill when building features that have test acceptance criteria.

## Available Test Suites

| Suite | File | Tests | What It Covers |
|-------|------|-------|----------------|
| GoldStarNavTests | S1-S5 | 19 | Trail bar, turn card, speed badge, ETA, controls |
| GoldStarVisualTests | S6 | 8 | No login, no dialogs, no debug, map loads |
| GoldStarMapHomeTests | MH1-MH5 | 15 | Where To bar, speed badge, controls, trails |
| GoldStarRouteSelectionTests | RS1-RS5 | 16 | Route preview, Go button, duration/distance |
| GoldStarArrivalTests | S7 | 2 | Arrival sequence, clean exit |
| GoldStarDifficultyTests | S8 | 3 | Trail difficulty color verification |

## Running Tests

### Run specific test slice (from issue acceptance criteria):
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/GoldStarNavTests/testS2_TurnCard_Present -only-testing:DirtSyncUITests/GoldStarNavTests/testS2_TurnCard_DistanceNotZero 2>&1 | tail -60'
```

### Run regression gate (ALWAYS run):
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/GoldStarVisualTests 2>&1 | tail -40'
```

### Run ALL Gold Star tests:
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/GoldStarNavTests -only-testing:DirtSyncUITests/GoldStarVisualTests -only-testing:DirtSyncUITests/GoldStarMapHomeTests 2>&1 | tail -60'
```

## Parsing Test Failures

For EACH failed test in the output:

1. **Copy the exact assertion message** — e.g., `XCTAssertTrue failed - S3.1 — Speed badge must be visible during navigation`
2. **Map it to a fix** — the test name tells you the spec (S3.1 = speed badge), the message tells you what's wrong
3. **Log it in a table:**

| Test | Assertion | Root Cause | Fix |
|------|-----------|------------|-----|
| testS3_SpeedBadge_Present | S3.1 — must be visible during nav | Hidden by overlay z-order | MapOverlayStack.swift: move speedBadge above navOverlay |

**DO NOT GUESS.** The test message IS the spec. Fix exactly what failed.

## Test-Driven Inner Loop

```
1. Code the fix
2. Run feature tests (from acceptance criteria)
3. Parse failures into fix table
4. Fix exactly those failures
5. Run regression gate (GoldStarVisualTests)
6. ALL pass = ship. ANY fail = back to step 1.
```

## Writing New Tests

When adding a feature, write the test FIRST:
```swift
func testNewFeature_ElementExists() {
    GoldStarTestHelper.launch(app, navigate: true)
    guard GoldStarTestHelper.waitForNavigation(app) else {
        XCTFail("Navigation did not start")
        return
    }
    
    let element = app.descendants(matching: .any)["myElementId"]
    GoldStarTestHelper.screenshot(self, name: "new-feature")
    XCTAssertTrue(element.exists, "Element must be visible during navigation")
}
```

Key patterns:
- Use `GoldStarTestHelper.launch()` for consistent app launch
- Use `GoldStarTestHelper.waitForNavigation()` for nav-dependent tests
- Use `GoldStarTestHelper.screenshot()` for evidence capture
- Use `app.descendants(matching: .any)["identifier"]` for accessibility lookup
- Add `.accessibilityIdentifier("myId")` to SwiftUI views for testability

## Trail Difficulty Colors (Reference)

| Difficulty | Color | Hex |
|-----------|-------|-----|
| Easy | Green | #34C759 |
| Moderate | Blue | #007AFF |
| Hard | Black | #000000 |
| Expert | Black/Red | #000000 + #FF3B30 |
| Single Track | Gold | #FFD700 |
