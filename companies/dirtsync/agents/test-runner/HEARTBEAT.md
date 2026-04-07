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

## 6. Upload to Google Drive — QA Iterations (MANDATORY)

Upload screenshot + iteration metadata so agents can learn from fix history.

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Create issue subfolder (idempotent — check first)
PARENT_FOLDER="1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X"  # DirtSync/QA Iterations
ISSUE_ID="<ISSUE_ID>"

# Check if folder exists
EXISTING=$(gws drive files list --params "q=name='${ISSUE_ID}' and '${PARENT_FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false" 2>&1 | grep -v "^Using keyring" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('files',[{}])[0].get('id',''))" 2>/dev/null)

if [ -z "$EXISTING" ]; then
  ISSUE_FOLDER=$(gws drive files create --json "{\"name\": \"${ISSUE_ID}\", \"mimeType\": \"application/vnd.google-apps.folder\", \"parents\": [\"${PARENT_FOLDER}\"]}" 2>&1 | grep -v "^Using keyring" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
else
  ISSUE_FOLDER="$EXISTING"
fi

# Count existing versions to determine version number
VERSION=$(gws drive files list --params "q='${ISSUE_FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false" 2>&1 | grep -v "^Using keyring" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('files',[]))+ 1)" 2>/dev/null)
VERSION=${VERSION:-1}

# Create version subfolder: v1-grade-pending, v2-grade-pending, etc.
VER_FOLDER=$(gws drive files create --json "{\"name\": \"v${VERSION}-grade-pending\", \"mimeType\": \"application/vnd.google-apps.folder\", \"parents\": [\"${ISSUE_FOLDER}\"]}" 2>&1 | grep -v "^Using keyring" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Upload screenshot
cd ~
gws drive +upload --file test-screenshot.png --parent "$VER_FOLDER" 2>&1 | grep -v "^Using keyring"

echo "UPLOADED: QA Iterations/${ISSUE_ID}/v${VERSION}/"
echo "FOLDER_ID: $VER_FOLDER"
REMOTE
```

**Folder structure in Drive:**
```
DirtSync/QA Iterations/
  DIRA-73/
    v1-grade-4/
      screenshot.png      ← Critique graded 4/10
    v2-grade-10/
      screenshot.png      ← Critique approved, shipped
  DIRA-8/
    v1-grade-7/
      screenshot.png
```

After Critique Agent grades, it renames the folder (e.g., `v1-grade-pending` → `v1-grade-4`).

## 7. Email Screenshot to Steve (MANDATORY)

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd ~
gws gmail +send \
  --to dirtsyncapp@gmail.com \
  --subject "<ISSUE_ID> v<VERSION>: <TITLE> — Test Results from Mini" \
  --body "<RESULTS_SUMMARY>\n\nDrive: QA Iterations/<ISSUE_ID>/v<VERSION>/" \
  --attach test-screenshot.png
REMOTE
```

## 8. Post Results to Forge Issue (MANDATORY)

```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Test Results — v<VERSION>\n\n**Branch:** <branch>\n**Tests:** <passed>/<total>\n**Build:** PASS\n**Screenshot:** Emailed + uploaded to Drive (QA Iterations/<ISSUE_ID>/v<VERSION>/)\n\n### Test Details\n<per-test results>\n\n**Verdict:** PASS / FAIL",
  "status": "in_review"
}
```

## 9. Exit
Clean exit. Don't start new work.
