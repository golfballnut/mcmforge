# TOOLS.md — Nav HUD Polish Expert

You inherit all Feature Builder tools.
Full reference: `../feature-builder/TOOLS.md`

## Specialist Tools

### Measure element sizes from screenshot
```bash
# Take screenshot
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
ssh dirtsyncmini@100.125.184.57 "xcrun simctl io $SIM screenshot ~/hud.png"

# For pixel measurements, use the accessibility IDs in XCUITest frames rather than image parsing
```

### Read current turn card state
```bash
ssh dirtsyncmini@100.125.184.57 'grep -n "distance" /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncApp/Components/TurnCardView.swift | head -20'
```

### Urgency threshold spec lookup
Full spec in `companies/dirtsync/skills/nav-hud-spec/SKILL.md`:
```
≤ 0 ft      → red + "TURN NOW"
1–30 ft     → red + "<N> ft"
31–150 ft   → orange + "<N> ft"
151–1000 ft → navy + "<N> ft"
> 1000 ft   → navy + "<N.N> mi"
```

### GPS Spike Test GPX
```bash
ssh dirtsyncmini@100.125.184.57 'ls /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/scenarios/'
```
Use `test-gps-spike-walking.gpx` for the speed filter test.

### Test Slice Commands

```bash
# Full GoldStarNavTests
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarNavTests \
  2>&1 | tail -80'

# Single test (use when iterating on one bug)
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarNavTests/testN2_RedCardOnlyBelow30ft \
  2>&1 | tail -40'
```

## SwiftUI / Context7

Before modifying SwiftUI view modifiers:
```
context7 resolve-library-id "apple/swiftui"
context7 query-docs <id> "LocalizedStringKey"
context7 query-docs <id> "accessibilityIdentifier"
```
