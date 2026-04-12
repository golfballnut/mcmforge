# TOOLS.md — DirtSync QA Rider

## Available Tools
- XcodeBuildMCP (preferred — build, simulator, screenshots, UI snapshot)
- File read/write (issue context, QA reports, screenshots)
- Bash (xcodebuild, simctl, git status)
- Glob/Grep (find test files, check coverage)

## XcodeBuildMCP Commands

### Session defaults — run first every session
```
mcp__XcodeBuildMCP__session_show_defaults
```

### Build and run in simulator
```
mcp__XcodeBuildMCP__build_sim
  projectPath: ~/DirtSync/DirtSync.xcodeproj
  scheme: DirtSync
  simulatorName: iPhone 16

mcp__XcodeBuildMCP__build_run_sim
  projectPath: ~/DirtSync/DirtSync.xcodeproj
  scheme: DirtSync
  simulatorName: iPhone 16
```

### Screenshot and UI inspection
```
mcp__XcodeBuildMCP__screenshot
  simulatorName: iPhone 16

mcp__XcodeBuildMCP__snapshot_ui
  simulatorName: iPhone 16
```

### Run tests
```bash
xcodebuild test -scheme DirtSync \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  2>&1 | tail -30
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox           — assigned issues
GET  /api/agent/issues/:id         — issue detail
GET  /api/agent/issues/:id/context — issue + all comments + parent
POST /api/agent/issues/:id/checkout — lock issue (409 if taken)
PATCH /api/agent/issues/:id        — update status, add comment
POST /api/agent/issues             — create QA subtask
```

### Status values
- `todo` → `in_progress` when starting QA
- `in_progress` → `in_review` when QA report posted (pass)
- `in_progress` → `blocked` if build fails

## Project Structure
```
DirtSync/
├── DirtSync.xcodeproj              — open this project
├── DirtSync/
│   ├── Views/Navigation/           — HUD, route preview, turn-by-turn
│   ├── Views/Map/                  — MapLibre map views
│   ├── Views/Rides/                — ride recording UI
│   └── Services/                   — NavigationService, TrailDetectionService
└── DirtSyncTests/                  — unit tests
    └── DirtSyncUITests/            — UI tests
```

## Visual Verification
- **Mockuuups MCP** — generate device frame mockups for QA reports
- **Playwright MCP** — screenshot reference apps for comparison
  - Capture Waze nav HUD at same zoom → compare with DirtSync screenshot
- Compare screenshots against Gold Star spec measurements

## Xcode Simulator Automation (CRITICAL — Master This)

### Step 0: Always check session defaults first
```
mcp__XcodeBuildMCP__session_show_defaults
```
Expected: project=DirtSync.xcodeproj, scheme=DirtSync, simulator=iPhone 16

### Step 1: Build
```
mcp__XcodeBuildMCP__build_sim
```
If build fails → STOP. Report the error. Don't try to fix code.

### Step 2: Launch with auto-login
```bash
# Stop any existing instance
xcrun simctl terminate <SIMULATOR_ID> app.dirtsync.DirtSync
sleep 1
# Launch with auto-login flag
xcrun simctl launch <SIMULATOR_ID> app.dirtsync.DirtSync --auto-login
sleep 6
```

**Test credentials (agent QA account):**
- Email: `agent@dirtsync.app`
- Password: `AgentTest2026`
- Supabase project: `lldipxvwocpqncixlnxj`

The `--auto-login` flag triggers auto sign-in via DirtSyncApp.swift `.task` modifier.
If auto-login fails, manually sign in via UI automation (see below).

### Step 3: Grant permissions
```bash
# Grant location permission (required for map + navigation)
xcrun simctl privacy <SIMULATOR_ID> grant location app.dirtsync.DirtSync
xcrun simctl privacy <SIMULATOR_ID> grant location-always app.dirtsync.DirtSync
```

### Step 4: Set GPS location (required for navigation testing)
```bash
# Static location at Burning Rock trailhead
xcrun simctl location <SIMULATOR_ID> set 37.7283,-81.6708

# OR simulate a ride with GPX file
xcrun simctl location <SIMULATOR_ID> start ~/DirtSync/DirtSyncUITests/GPXRoutes/<track>.gpx

# Stop simulation
xcrun simctl location <SIMULATOR_ID> stop
```

### Step 5: Screenshot
```
mcp__XcodeBuildMCP__screenshot
```

### Step 6: UI hierarchy inspection
```
mcp__XcodeBuildMCP__snapshot_ui
```
Returns every element with frame coordinates. Use for measurement verification.

### UI Automation (when manual interaction needed)

**Pasteboard approach (type text into focused field):**
```bash
# Copy text to simulator pasteboard
xcrun simctl pbcopy <SIMULATOR_ID> <<< "agent@dirtsync.app"
# Then use Cmd+V in the simulator (via AppleScript if accessibility is enabled)
```

**LIMITATION:** `xcrun simctl` does NOT support tap or keyboard input directly. For UI automation:
1. Use XCUITest (preferred) — write test in DirtSyncUITests/
2. Use `--auto-login` launch argument (fastest for QA)
3. Use `xcrun simctl openurl` for deep links: `xcrun simctl openurl <SIM_ID> "dirtsync://navigate"`

### Common Gotchas
- **Simulator ID changes:** Always get it from `session_show_defaults` or `xcrun simctl list devices booted`
- **App needs reinstall after code changes:** `build_run_sim` handles this, or `xcrun simctl install <SIM_ID> <APP_PATH>`
- **Screenshot timing:** Wait 3-5 seconds after navigation changes for animations to complete
- **Ferrostar overrides GPS:** During active navigation, `SimulatedLocationProvider` overrides CoreLocation — `simctl location` is ignored. Use `startNavigationForTesting()` instead.
- **Single CLLocationManager:** NEVER create a second one in test code — causes location updates to stop
- **Map tiles need time:** Wait 5+ seconds after app launch for MapLibre tiles to load before screenshotting

## What You CANNOT Do
- Approve any feature without an attached screenshot
- Mark `in_review` if build fails
- Skip the offline state test
- Push code or create PRs
- Modify Swift source files
