# TOOLS.md — Map Rendering Expert

You inherit all Feature Builder tools (SSH, xcodebuild, xcrun simctl, gws, git, gh, Forge API).
Full reference: `../feature-builder/TOOLS.md`

## Specialist Diagnostic Tools

### Read style URL resolution
```bash
ssh dirtsyncmini@100.125.184.57 'grep -A 30 "func styleURL" /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncApp/Services/MapStyleManager.swift'
```

### Verify MBTiles file presence + size
```bash
ssh dirtsyncmini@100.125.184.57 'find /Users/dirtsyncmini/DirtSync -name "*.mbtiles" -exec ls -lh {} \;'
```

### Check if MBTiles is in the app bundle after build
```bash
ssh dirtsyncmini@100.125.184.57 'find ~/Library/Developer/Xcode/DerivedData -name "trails.mbtiles" 2>/dev/null'
```

### Run console capture during launch (see STYLE_LOADED logs)
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
ssh dirtsyncmini@100.125.184.57 "xcrun simctl launch --console-pty $SIM app.dirtsync.DirtSync --uitesting 2>&1 | tee ~/style-log.txt | grep -E 'STYLE_LOADED|ERROR|layer:'"
```

### Test network on/off paths
```bash
# Force offline (disable simulator network)
ssh dirtsyncmini@100.125.184.57 "xcrun simctl privacy $SIM grant all app.dirtsync.DirtSync"

# There's no simctl flag for airplane mode — use network conditioner or hardcode isConnected=false in a test build
```

### MapLibre / Context7
Before writing new MapLibre code, query official docs:
```
context7 resolve-library-id "maplibre/maplibre-gl-native"
context7 query-docs <id> "didFinishLoadingStyle"
context7 query-docs <id> "MLNOfflineStorage"
context7 query-docs <id> "MLNSource addSource"
```

## Test Slice Commands

```bash
# Your primary test slice
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarMapHomeTests/testMH4_MapLoadsSuccessfully \
  -only-testing:DirtSyncUITests/GoldStarVisualTests/testS6_MapTilesLoaded \
  2>&1 | tail -60'

# Regression gate (everything that touches the map)
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarMapHomeTests \
  -only-testing:DirtSyncUITests/GoldStarVisualTests \
  2>&1 | tail -60'
```

## Pixel Sampling (for new tests)

```swift
// Swift test helper — add to GoldStarTestHelper.swift if not present
func assertMapNotAllBlack(tolerance: Double = 0.05) {
    let screenshot = XCUIScreen.main.screenshot()
    guard let cgImage = screenshot.image.cgImage else { return }
    let width = cgImage.width
    let height = cgImage.height
    // Sample center region (avoid HUD)
    let sampleRect = CGRect(x: width/4, y: height/3, width: width/2, height: height/3)
    // Count non-black pixels
    // ... (implementation in GoldStarTestHelper)
    XCTAssertGreaterThan(nonBlackRatio, tolerance, "Map center is >95% black — basemap not rendering")
}
```
