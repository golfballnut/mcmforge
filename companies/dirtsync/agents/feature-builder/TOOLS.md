# TOOLS.md — DirtSync Feature Builder

## Available Tools
- Bash (SSH to Mini, xcodebuild, xcrun simctl, gws, git, gh)
- Forge API (read issues, post comments, update status)
- File read/write/edit (via SSH to Mini for Swift code)

## The Factory (Mac Mini)

### Connection
```bash
ssh dirtsyncmini@100.125.184.57
```
- Tailscale IP, always available
- Xcode 26.4
- iPhone 17 simulator, iOS 26.4

### Simulator
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526

# Boot simulator
xcrun simctl boot $SIM 2>/dev/null

# Shutdown simulator
xcrun simctl shutdown $SIM

# Reboot (if launch fails)
xcrun simctl shutdown $SIM && sleep 2 && xcrun simctl boot $SIM

# Install app
APP=$(find ~/Library/Developer/Xcode/DerivedData -name "DirtSync.app" \
  -path "*/Debug-iphonesimulator/*" -maxdepth 8 | head -1)
xcrun simctl install $SIM "$APP"

# Launch with test flags (bypasses auth, onboarding, location dialog)
xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting --uitesting-navigate

# Terminate app
xcrun simctl terminate $SIM app.dirtsync.DirtSync

# Screenshot
xcrun simctl io $SIM screenshot ~/screenshot.png

# Set GPS location (lat,lon)
xcrun simctl location $SIM set 37.7283,-81.6708
```

### --uitesting Bypasses (CRITICAL)
When launching with `--uitesting`, the app skips:
1. **Auth** — `AuthManager` sets fake `User.mock()`, no Supabase login
2. **Onboarding** — `RootView` sets `showOnboarding = false`
3. **Location dialog** — `LocationManager` skips `requestWhenInUseAuthorization()` and `startUpdatingLocation()`

These bypasses let the app reach the map without human interaction.

## Build Commands

### Clean build
```bash
cd /Users/dirtsyncmini/DirtSync/DirtSync
xcodebuild clean build -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  2>&1 | tail -20
```

### Run specific test suite
```bash
cd /Users/dirtsyncmini/DirtSync/DirtSync
xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/<TestClass> \
  2>&1 | tail -40
```

### Run single test
```bash
cd /Users/dirtsyncmini/DirtSync/DirtSync
xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/<TestClass>/<testMethod> \
  2>&1 | tail -40
```

### Skip unit tests (if they block UI tests)
```bash
xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/<TestClass> \
  -skip-testing:DirtSyncAppTests \
  2>&1 | tail -40
```

## Git on Mini (CRITICAL)

**NEVER use `git pull`.** It fails silently with divergent branches.

```bash
# Always use this pattern:
cd /Users/dirtsyncmini/DirtSync
git checkout -- .
git fetch origin
git reset --hard origin/<branch-name>

# Create feature branch
git checkout -b agent/<issue-slug>

# Commit and push
git add -A
git commit -m "<ISSUE>: <description>"
git push -u origin agent/<issue-slug>

# Create PR
gh pr create --base master --title "<ISSUE>: <title>" --body "..."
```

## Ferrostar Patch (MANDATORY on Mini)

After every `git fetch/reset`, apply this patch. Mini has a newer Ferrostar package that requires additional RouteStep parameters.

```bash
cd /Users/dirtsyncmini/DirtSync
python3 -c "
with open('DirtSync/DirtSyncApp/Services/FerrostarNavigationService.swift', 'r') as f:
    c = f.read()
c = c.replace('            incidents: []\n        )', 
              '            incidents: [],\n            drivingSide: nil,\n            roundaboutExitNumber: nil\n        )')
with open('DirtSync/DirtSyncApp/Services/FerrostarNavigationService.swift', 'w') as f:
    f.write(c)
print('Ferrostar patch applied')
"
```

**If this patch is skipped:** Build will succeed but navigation will not start at runtime. The RouteStep initializer will fail silently.

## Email (gws)

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd ~  # File must be in cwd
gws gmail +send \
  --to dirtsyncapp@gmail.com \
  --subject "SUBJECT" \
  --body "BODY" \
  --attach filename.png
```

**Gotchas:**
- `--attach` (not `--attachment`)
- File must be relative to cwd (usually `~`)
- PATH must include `/opt/homebrew/bin`
- Always pipe through `grep -v "^Using keyring"` before parsing JSON output

## Google Drive (QA Iterations)

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# QA Iterations parent folder ID
QA_FOLDER="1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X"

# Upload file to QA Iterations folder
gws drive +upload --file screenshot.png --parent $QA_FOLDER

# Create subfolder for an issue
gws drive files create --json '{"name": "DIRA-73", "mimeType": "application/vnd.google-apps.folder", "parents": ["'$QA_FOLDER'"]}'

# List folder contents
gws drive files list --params "q='$QA_FOLDER' in parents and trashed=false"
```

**Gotchas:** Always pipe through `grep -v "^Using keyring"` before parsing JSON. gws outputs a keyring line first.

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox           — assigned issues
GET  /api/agent/issues/:id/context — full issue + comments
PATCH /api/agent/issues/:id        — update status, add comment
```

## Documentation
- **Context7 MCP** — query official docs before writing code
  - SwiftUI: `resolve-library-id` → "apple/swiftui" → `query-docs` → "NavigationStack"
  - MapLibre: `resolve-library-id` → "maplibre/maplibre-gl-native"
  - Always check Context7 BEFORE guessing API usage

## DirtSync Repo Paths on Mini
```
/Users/dirtsyncmini/DirtSync/
├── DirtSync/
│   ├── DirtSync.xcodeproj
│   ├── DirtSyncApp/
│   │   ├── Views/
│   │   ├── Services/
│   │   ├── Models/
│   │   ├── Components/
│   │   └── Resources/
│   ├── DirtSyncUITests/
│   │   ├── GPXRoutes/           — 34+ test tracks
│   │   ├── NavHUDGoldStarTests.swift
│   │   ├── NavigationFlowUITests.swift
│   │   ├── WazeFlowUITests.swift
│   │   └── AuthFlowUITest.swift
│   └── DirtSyncAppTests/       — unit tests
```

## Test Suites Available

| Suite | What it tests | Command flag |
|-------|--------------|--------------|
| NavHUDGoldStarTests | Nav HUD redesign — turn card, speed badge, ETA bar | `-only-testing:DirtSyncUITests/NavHUDGoldStarTests` |
| NavigationFlowUITests | 6 nav states — idle, destination, route preview, driving, turn, ended | `-only-testing:DirtSyncUITests/NavigationFlowUITests` |
| WazeFlowUITests | Full Waze flow — map home, search, autocomplete, route selection, HUD | `-only-testing:DirtSyncUITests/WazeFlowUITests` |
| AuthFlowUITest | Login, signup, logout, error handling | `-only-testing:DirtSyncUITests/AuthFlowUITest` |
