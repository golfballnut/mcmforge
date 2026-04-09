# HEARTBEAT.md — QA Recorder

## Startup
1. Read issue from Forge API: `GET /api/agent/me/inbox`
2. Get issue context: `GET /api/agent/issues/:id/context`
3. Parse: which tests to record, issue ID for file naming
4. SSH to Mini, verify connectivity

## Record Loop

### Step 1: Boot Simulator
```bash
ssh dirtsyncmini@100.125.184.57 'xcrun simctl boot 1C53DE6B-2574-43FF-BF29-C1C5ACF5A526 2>/dev/null; echo "Ready"'
```

### Step 2: Start Recording
```bash
ssh dirtsyncmini@100.125.184.57 'nohup xcrun simctl io 1C53DE6B-2574-43FF-BF29-C1C5ACF5A526 recordVideo ~/qa-recording-ISSUE_ID.mp4 > /dev/null 2>&1 & echo $!'
```
**Save the PID.** You need it to stop recording.

### Step 3: Run Tests
Read the issue's acceptance criteria for which tests to run. Default to all Gold Star:
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/GoldStarNavTests -only-testing:DirtSyncUITests/GoldStarVisualTests -only-testing:DirtSyncUITests/GoldStarMapHomeTests 2>&1 | tail -60'
```
Parse test output: count passed/failed, note failure messages.

### Step 4: Stop Recording
```bash
ssh dirtsyncmini@100.125.184.57 'kill RECORDING_PID 2>/dev/null; sleep 2'
```

### Step 5: Take Screenshot
```bash
ssh dirtsyncmini@100.125.184.57 'xcrun simctl io 1C53DE6B-2574-43FF-BF29-C1C5ACF5A526 screenshot ~/qa-screenshot-ISSUE_ID.png'
```

### Step 6: Upload to Google Drive
```bash
ssh dirtsyncmini@100.125.184.57 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && gws drive +upload --file ~/qa-recording-ISSUE_ID.mp4 --parent 1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X'
ssh dirtsyncmini@100.125.184.57 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && gws drive +upload --file ~/qa-screenshot-ISSUE_ID.png --parent 1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X'
```

### Step 7: Post Results
```
PATCH /api/agent/issues/:id
{
  "status": "done",
  "comment": "## QA Recording Complete\n\n**Tests:** X/Y pass\n**Video:** [Drive ID]\n**Screenshot:** [Drive ID]\n\n| Test | Result |\n|------|--------|\n| ... | PASS/FAIL |"
}
```

## BAIL-OUT RULES
- SSH fails 2x → post "Mini unreachable" → mark blocked
- Recording fails → take screenshot only, still post results
- Tests won't run (build fail) → post error to issue → mark blocked
- NEVER exit without posting to the issue
