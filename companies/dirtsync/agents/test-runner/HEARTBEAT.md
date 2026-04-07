# HEARTBEAT.md — DirtSync Test Runner

Run this on every wake. This is the factory floor procedure.

## 1. Read Assignment
- Read the assigned issue and ALL comments
- Identify: branch name, test class to run, what to look for in screenshots
- If no branch specified, use the branch from the iOS Builder's comment

## 2. Sync the Factory

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /Users/dirtsyncmini/DirtSync

# ALWAYS reset to remote — never git pull
git checkout -- .
git fetch origin
git reset --hard origin/<BRANCH_NAME>

# Apply Mini-specific Ferrostar patch
python3 -c "
with open('DirtSync/DirtSyncApp/Services/FerrostarNavigationService.swift', 'r') as f:
    c = f.read()
if 'drivingSide' not in c:
    c = c.replace('            incidents: []\n        )', '            incidents: [],\n            drivingSide: nil,\n            roundaboutExitNumber: nil\n        )')
    with open('DirtSync/DirtSyncApp/Services/FerrostarNavigationService.swift', 'w') as f:
        f.write(c)
    print('Ferrostar patched')
"
REMOTE
```

## 3. Build

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
cd /Users/dirtsyncmini/DirtSync/DirtSync
xcodebuild clean build -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  2>&1 | grep -E "SUCCEEDED|FAILED|error:"
REMOTE
```

**If BUILD FAILED:** Post the error to the issue, mark `blocked`, stop.

## 4. Run Tests

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
cd /Users/dirtsyncmini/DirtSync/DirtSync
xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/<TEST_CLASS> \
  2>&1 | grep -E "Test Case|Executed|SUCCEEDED|FAILED|error:" | tail -20
REMOTE
```

Record: total tests, passed, failed, time.

## 5. Take Screenshot (if tests don't produce one)

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
xcrun simctl terminate $SIM app.dirtsync.DirtSync 2>/dev/null
xcrun simctl uninstall $SIM app.dirtsync.DirtSync 2>/dev/null
APP=$(find ~/Library/Developer/Xcode/DerivedData -name "DirtSync.app" \
  -path "*/Debug-iphonesimulator/*" -maxdepth 8 | head -1)
xcrun simctl install $SIM "$APP"
xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting --uitesting-navigate
sleep 18
xcrun simctl io $SIM screenshot ~/test-screenshot.png
echo "SCREENSHOT DONE"
REMOTE
```

## 6. Email Screenshot to Steve (MANDATORY)

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd ~
gws gmail +send \
  --to dirtsyncapp@gmail.com \
  --subject "<ISSUE_ID>: <TITLE> — Test Results from Mini" \
  --body "<RESULTS_SUMMARY>" \
  --attach test-screenshot.png
REMOTE
```

## 7. Post Results to Forge Issue (MANDATORY)

```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Test Results\n\n**Branch:** <branch>\n**Tests:** <passed>/<total>\n**Build:** PASS\n**Screenshot:** Emailed to Steve\n\n### Test Details\n<per-test results>\n\n**Verdict:** PASS / FAIL",
  "status": "in_review"  // or "blocked" if tests fail
}
```

## 8. Exit
Clean exit. Don't start new work.
