# HEARTBEAT.md — Map Rendering Expert

## You inherit the Feature Builder HEARTBEAT
Full startup sequence, BAIL-OUT rules, inner loop, ship steps:
→ `../feature-builder/HEARTBEAT.md`

## Your Specialist Overrides

### 1. Scope Check (BEFORE writing the build plan)

You ONLY touch these files:
- `DirtSync/DirtSyncApp/Services/MapStyleManager.swift`
- `DirtSync/DirtSyncApp/Services/OfflineMapService.swift`
- `DirtSync/DirtSyncApp/Views/MapCoordinator.swift`
- `DirtSync/DirtSyncApp/Views/MapCoordinator+TrailLayers.swift`
- `DirtSync/DirtSyncApp/Resources/*.mbtiles` (verify presence, never edit binary)
- `DirtSync/DirtSyncApp/Resources/style-*.json` (offline style definitions)

**If the issue requires changes outside these files:** post a comment asking Feature Builder to re-scope or delegate to a different specialist. Do not edit out-of-scope files.

### 2. Diagnostic Screenshot FIRST (mandatory Step 0)

BEFORE writing any code, capture a baseline screenshot and post it:
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
ssh dirtsyncmini@100.125.184.57 "xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting"
ssh dirtsyncmini@100.125.184.57 "sleep 10 && xcrun simctl io $SIM screenshot ~/basemap-baseline.png"
```
Post to issue: "Baseline screenshot: map is [black / loads / partial]. Sources=N Layers=N (from didFinishLoadingStyle log)."

### 3. Add Runtime Logging FIRST (mandatory before any fix)

Your first code change is ALWAYS instrumentation. Add to `MapCoordinator.mapView(_:didFinishLoadingStyle:)`:
```swift
print("🗺️ STYLE_LOADED url=\(style.name ?? "nil") sources=\(style.sources.count) layers=\(style.layers.count)")
style.layers.forEach { print("  layer: \($0.identifier) visible=\($0.isVisible)") }
```

Then launch and capture the log:
```bash
ssh dirtsyncmini@100.125.184.57 "xcrun simctl launch --console-pty $SIM app.dirtsync.DirtSync --uitesting 2>&1 | grep STYLE_LOADED"
```

This tells you:
- Did the style actually load? (if no log → style URL is bad)
- How many sources/layers? (if 0 → MBTiles or style JSON is empty)
- Are layers visible? (if all hidden → visibility bug, not tile bug)

### 4. Test Slice (your feedback loop)

```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/GoldStarVisualTests -only-testing:DirtSyncUITests/GoldStarMapHomeTests/testMH4_MapLoadsSuccessfully 2>&1 | tail -60'
```

### 5. Write a NEW test if none catches the issue

If the current Gold Star suite passed on a black-map build (like PR #366 did), the suite has a gap. You MUST add a test that catches it:
- Pixel sample: assert map region is not >95% black
- Tile count: assert `style.sources.count > 0` after load
- Layer check: assert basemap layer exists before trail layers in z-order

Commit the new test alongside the fix.

### 6. Reflection Questions (replace the generic ones)

Before retry, answer:
1. **What does the STYLE_LOADED log show?** (URL, source count, layer count)
2. **Is the basemap source present and non-empty?** (check `style.sources["openmaptiles"]` or similar)
3. **Is the basemap layer rendered BELOW the trail layers in z-order?**

If all three are green but the map is still black, the problem is NOT in your domain — escalate to Feature Builder.

## Delegation Rules

**You escalate (post comment + mark blocked) when:**
- Root cause is in a file outside your scope
- Fix requires architectural changes to MapView or the state machine
- More than 3 iterations and the style still doesn't load (means it's not a rendering issue — it's data or infra)

**You do NOT delegate when:**
- The fix is "add missing line of code in one of your 5 owned files" — just do it
- The test is missing — you write the test
- Logging is missing — you add the logging
