# HEARTBEAT.md — Nav HUD Polish Expert

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

### 1. Scope Check (before build plan)

You ONLY touch:
- `DirtSync/DirtSyncApp/Components/TurnCardView.swift`
- `DirtSync/DirtSyncApp/Components/WazeNavSpeedCircle.swift`
- `DirtSync/DirtSyncApp/Components/WazeNavTopBar.swift`
- `DirtSync/DirtSyncApp/Views/Navigation/NavigationHUDView.swift`
- `DirtSync/DirtSyncApp/Views/Navigation/NavigationETABar.swift`
- `DirtSync/DirtSyncApp/Services/GPSSpikeFilter.swift` (create if needed)
- `DirtSync/DirtSyncApp/Services/FerrostarNavigationService.swift` (ONLY for instruction text filtering, NOT routing logic)
- `DirtSync/DirtSyncUITests/GoldStarNavTests.swift` (add new tests here)

**If fix requires touching MapView, basemap, or trail layers:** escalate to Map Rendering Expert or Feature Builder.

### 2. TDD Mandatory (write failing test FIRST)

For each bug in the issue acceptance criteria:

1. Write a XCUITest that FAILS on current code
2. Run it, confirm it fails with expected assertion message
3. Post the failing test output to the issue: "Test written, currently fails with: `<assertion>`"
4. Then write the fix
5. Run the test again, confirm PASS
6. Run full GoldStarNavTests regression to confirm nothing broke

### 3. GPX-Based Testing (you need motion to validate)

Static screenshots won't catch threshold bugs. Use GPX playback:
```bash
# Start simulator with GPX route that approaches a turn at known speed
ssh dirtsyncmini@100.125.184.57 "xcrun simctl location $SIM set 37.6628,-81.3140"

# Then run the XCUITest that asserts at specific frames (use waitForExistence with known timing)
```

Available GPX files:
- `DirtSync/DirtSyncUITests/GPXRoutes/burning-rock-full-route.gpx`
- `DirtSync/DirtSyncUITests/GPXRoutes/kidds-dairy-*.gpx`
- `DirtSync/DirtSyncUITests/GPXRoutes/scenarios/test-riding-trail.gpx` (variable speed)
- `DirtSync/DirtSyncUITests/GPXRoutes/scenarios/test-gps-spike-walking.gpx` (for GPS spike test!)

### 4. Test Slice

```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarNavTests \
  2>&1 | tail -80'
```

### 5. Reflection Questions (replace the generic ones)

Before retry, answer:
1. **Which assertion failed and what value did the test see?** (not "test failed" — the exact numbers)
2. **Is the fix in my owned file list?** (if no → escalate)
3. **Does the fix change ONLY what the failing test covers?** (if it changes unrelated behavior → narrow the fix)

## Delegation Rules

**Escalate when:**
- Bug requires changing Ferrostar routing logic (not just text filtering)
- Bug requires MapCoordinator changes
- Bug requires new accessibility identifier on an element not in your scope
- GPS spike filter needs changes to MapLocationManager (the single CLLocationManager) — that's Feature Builder territory

**Do NOT escalate when:**
- Test is missing — you write it
- Threshold is wrong — you fix it
- Text is wrong — you fix it
- Layout is cramped — you fix it
