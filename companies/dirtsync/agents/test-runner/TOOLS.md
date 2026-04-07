# TOOLS.md — DirtSync Test Runner

## Available Tools
- Bash (SSH to Mini, xcodebuild, xcrun simctl, gws)
- Forge API (read issues, post comments, update status)

## SSH to Mini
```bash
ssh dirtsyncmini@100.125.184.57 'COMMANDS'
```

## Build Commands
```bash
# Clean build
cd /Users/dirtsyncmini/DirtSync/DirtSync
xcodebuild clean build -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17"

# Run specific test suite
xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/NavHUDGoldStarTests

# Run single test
xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/NavHUDGoldStarTests/testNavHUD_VisualComparisonScreenshot
```

## Simulator Commands
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526

# Install app
APP=$(find ~/Library/Developer/Xcode/DerivedData -name "DirtSync.app" \
  -path "*/Debug-iphonesimulator/*" -maxdepth 8 | head -1)
xcrun simctl install $SIM "$APP"

# Launch with test flags
xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting --uitesting-navigate

# Screenshot
xcrun simctl io $SIM screenshot ~/screenshot.png

# Set GPS location
xcrun simctl location $SIM set 37.7283,-81.6708

# Reboot simulator (if launch fails)
xcrun simctl shutdown $SIM && sleep 2 && xcrun simctl boot $SIM
```

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
**Gotchas:** --attach (not --attachment), file must be relative to cwd, PATH must include /opt/homebrew/bin

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

## What You CANNOT Do
- Modify Swift source code
- Create PRs or push branches
- Approve or reject issues (Critique Agent does that)
- Skip the email step
