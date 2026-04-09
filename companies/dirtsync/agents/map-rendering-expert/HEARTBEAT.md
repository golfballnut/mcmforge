# HEARTBEAT.md — Map Rendering Expert

## You inherit the Feature Builder HEARTBEAT
Full startup sequence, BAIL-OUT rules, inner loop, ship steps:
→ `../feature-builder/HEARTBEAT.md`

**Your LESSONS.md is your own:** `companies/dirtsync/agents/map-rendering-expert/LESSONS.md`. When Feature Builder's Step 0 says "read LESSONS.md", it means YOUR file, not the Feature Builder's. Same for the final step — append to YOUR LESSONS.md. See `vault/agents/skills/lessons-learned-loop.md`.

## ⛔ REPRODUCE-FIRST RULE (non-negotiable — ship gate)

**You may not claim a bug is fixed until you can prove the bug existed in your test environment BEFORE your fix.**

Concretely:
1. **Write a test that FAILS on the current code (red).** Post the failing output to the issue as a comment.
2. **Only then** write the fix.
3. **Run the same test — it must now pass (green).** Post the passing output.
4. **A test that passes before you touched the code proves NOTHING.** If you can't reproduce the bug, you can't fix it. Report "cannot reproduce" and mark blocked — that is a legitimate outcome.

**Specifically for this bug class (visual/rendering):**
- A test in the simulator that passes on the current build is NOT proof that the bug is fixed. The simulator is a different environment than real device on LTE.
- If the only evidence of the bug is a Steve screenshot from real device, you MUST post a plan for how you will validate your fix BEFORE coding. Options: (a) force offline mode in the simulator to match device failure state, (b) script the bundled-style-only code path and verify pixels, or (c) report "requires real device test — cannot validate in simulator" and mark blocked for Steve to verify on phone.

**Claim-tracking rule:** Never list prior commits (made before your run started) as "your deliverables" in summaries or comments. Only describe what your run's commits added. If you inherited prior work, describe it as "inherited" or "pre-existing".

**Idle-loop rule:** Once your work is shipped to a PR, exit immediately. Do not keep polling for "new work" or posting "nothing to do" comments. One comment at the end with the final status is the correct behavior. Every extra idle comment costs tokens and tells Steve you're not useful.

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
