# HEARTBEAT.md — Explore UX Expert

## You inherit the Feature Builder HEARTBEAT
→ `../feature-builder/HEARTBEAT.md`

## ⛔ REPRODUCE-FIRST RULE (non-negotiable — ship gate)

**You may not claim a bug is fixed until you can prove the bug existed in your test environment BEFORE your fix.**

1. **Write a failing test (red).** Post the failing output to the issue.
2. **Only then** write the fix.
3. **Re-run — must pass (green).** Post the passing output.
4. **A test that passes before you touched the code proves NOTHING.** If you can't reproduce, report "cannot reproduce" and mark blocked.

**Claim-tracking rule:** Never list prior commits (from before your run started) as your deliverables. Describe only what YOUR commits added.

**Idle-loop rule:** Once shipped to a PR, exit immediately. No "nothing to do" polling loops.

## Your Specialist Overrides

### 1. Scope Check

You ONLY touch:
- `DirtSync/DirtSyncApp/Views/MapCoordinator+TrailLayers.swift`
- `DirtSync/DirtSyncApp/Views/MapCoordinator+Annotations.swift`
- `DirtSync/DirtSyncApp/Views/MapCoordinator+RouteLabels.swift`
- `DirtSync/DirtSyncApp/Models/TrailStyleConfiguration.swift`
- `DirtSync/DirtSyncApp/Components/MapControlsPanel.swift`
- `DirtSync/DirtSyncApp/Views/MapOverlayStack.swift`
- `DirtSync/DirtSyncApp/Views/TrailDetailSheet.swift` (create)
- `DirtSync/DirtSyncApp/Views/BrowseSystemsSheet.swift` (create)
- `DirtSync/DirtSyncUITests/GoldStarMapHomeTests.swift` (add new tests)

**If fix requires changing basemap, style URL, or turn card:** escalate.

### 2. TDD Mandatory

For each bug:
1. Write failing XCUITest
2. Post failure output: "Test `testE4_TrailColorsMatchSpec` fails — sampled color is #A1B2C3, expected #34C759"
3. Write fix
4. Confirm test passes
5. Run full `GoldStarMapHomeTests` regression

### 3. Static vs Interactive Testing

Most explore bugs can be caught STATIC (screenshot + element existence). But for:
- Trail tap (E6) — need XCUITest `.tap()` on coordinate
- Browse sheet (E7) — need `.tap()` + sheet presentation assertion
- Color verification (E4) — need pixel sampling helper

If `GoldStarTestHelper.swift` lacks a pixel-sampling helper, add one:
```swift
static func sampleColor(at point: CGPoint) -> UIColor { ... }
```

### 4. Test Slice

```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarMapHomeTests \
  2>&1 | tail -80'
```

### 5. Real-World Validation

Explore mode is where Steve's field test 2/10 came from. After tests pass, take a screenshot WITHOUT `--uitesting-navigate` flag to verify explore-only state:
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
ssh dirtsyncmini@100.125.184.57 "xcrun simctl location $SIM set 37.6628,-81.3140"
ssh dirtsyncmini@100.125.184.57 "xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting"  # NO --uitesting-navigate
ssh dirtsyncmini@100.125.184.57 "sleep 12 && xcrun simctl io $SIM screenshot ~/explore-screenshot.png"
```
Upload this to QA Iterations Drive folder so Steve can compare to his field test.

## Delegation Rules

**Escalate when:**
- Bug is actually in basemap rendering (map is black under trails)
- Bug requires GeoJSON schema changes (data issue, not rendering)
- Bug requires new accessibility identifier on nav HUD element
- Bug requires Supabase schema changes for POIs

**Do NOT escalate when:**
- Color mapping is wrong — fix TrailStyleConfiguration
- Label not showing — fix SymbolLayer config
- Sheet missing — create it
- Debug marker leaking — add the guard
