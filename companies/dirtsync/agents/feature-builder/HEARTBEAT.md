# HEARTBEAT.md — DirtSync Feature Builder

## Startup Sequence

1. Read the assigned issue from Forge API: `GET /api/agent/me/inbox`
2. Read full issue context: `GET /api/agent/issues/:id/context`
3. Parse: acceptance criteria, test class, target files, Gold Star spec
4. SSH to Mini, verify connectivity
5. Fetch the latest code on Mini:
   ```bash
   ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && git checkout -- . && git fetch origin && git reset --hard origin/master'
   ```
6. Create feature branch:
   ```bash
   ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && git checkout -b agent/<issue-slug>'
   ```
7. Apply Ferrostar patch (MANDATORY — see TOOLS.md)
8. Boot simulator:
   ```bash
   ssh dirtsyncmini@100.125.184.57 'xcrun simctl boot 1C53DE6B-2574-43FF-BF29-C1C5ACF5A526 2>/dev/null; echo "Simulator ready"'
   ```

## Inner Loop (MAX 8 ITERATIONS)

For iteration = 1 to 8:

### Step 1: Code
SSH to Mini, make changes to the specified files.
- Read the target files first to understand current state
- Make surgical changes — smallest diff that achieves the goal
- If iteration > 1: apply ONLY the fix identified in Step 6 reflection

### Step 2: Build
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild clean build -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" 2>&1 | tail -20'
```
- If **BUILD FAILED**: read the error output, fix the code, go back to Step 1. **This counts as an iteration.**
- If **BUILD SUCCEEDED**: continue to Step 3.

### Step 3: Test
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/<TEST_CLASS> 2>&1 | tail -40'
```
- Record: passed / failed / total
- If tests fail: note which tests and the failure reason
- Continue to Step 4 regardless (screenshot may still be useful)

### Step 4: Screenshot
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
# Kill any existing app instance
ssh dirtsyncmini@100.125.184.57 "xcrun simctl terminate $SIM app.dirtsync.DirtSync 2>/dev/null; sleep 2"
# Launch with test flags
ssh dirtsyncmini@100.125.184.57 "xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting --uitesting-navigate"
# Wait for app to load and navigate
ssh dirtsyncmini@100.125.184.57 "sleep 15"
# Take screenshot
ssh dirtsyncmini@100.125.184.57 "xcrun simctl io $SIM screenshot ~/screenshot-iteration-{N}.png"
```
Replace `{N}` with the current iteration number.

### Step 5: Self-Critique
Look at the screenshot. Check against Gold Star spec:

**Instant Fail Checklist:**
- [ ] No login screen or onboarding visible
- [ ] No system dialog (location, notifications) blocking the UI
- [ ] Speed shows real value (not 0 mph) — if nav screenshot
- [ ] No debug/test trail names
- [ ] No missing or partially loaded map tiles
- [ ] No overlapping elements
- [ ] No truncated or clipped text

**Element-by-Element Check (Nav HUD):**
| Element | Spec | Actual | Pass/Fail |
|---------|------|--------|-----------|
| Turn icon | 58x58 circle | ? | ? |
| Distance font | 34pt Heavy | ? | ? |
| Card corner radius | 20pt | ? | ? |
| Orange accent line | 2.5pt | ? | ? |
| Speed badge | 74pt circle | ? | ? |
| Speed font | 34pt Heavy rounded | ? | ? |
| mph label | 10pt semibold lowercase | ? | ? |
| ETA time font | 22pt Heavy | ? | ? |
| ETA detail font | 12pt medium | ? | ? |
| Progress bar | 2.5pt height | ? | ? |
| End button | 40x40 circle | ? | ? |

**Social Media Test:** Would I post this screenshot to promote DirtSync? YES/NO — why?

Grade: X/10

### Step 6: Reflect (MANDATORY before retry)
**You MUST answer these 3 questions before going back to Step 1:**

1. **What specifically failed?**
   List every element that did not meet spec. Be precise: "Speed badge is 64pt, spec says 74pt" not "speed badge looks small."

2. **What exact change will fix it?**
   Name the file, the line, and the new value. "In TurnCardView.swift line 47, change `.frame(width: 64)` to `.frame(width: 74)`"

3. **Am I repeating a previous attempt?**
   Review your iteration log. If you are about to try the same fix again, STOP and try a different approach. If you have tried 3 different approaches to fix the same element and all failed, that element may need architectural changes — note it in your failure report.

### Step 7: Decision

**If ALL tests pass AND screenshot is 10/10:**
BREAK → go to Ship section below.

**If iteration < 8:**
Log the iteration result, go back to Step 1 with the fixes from Step 6.

**If iteration = 8 and NOT 10/10:**
```
POST failure report to Forge issue:
- All 8 iteration summaries
- What worked, what didn't
- Recommended next steps
- All screenshot paths
Mark issue as BLOCKED.
```

## Ship (only after 10/10)

### 1. Commit and push
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && git add -A && git commit -m "<ISSUE>: <description>" && git push -u origin agent/<issue-slug>'
```

### 2. Create PR
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && gh pr create --base master --title "<ISSUE>: <title>" --body "## Summary
<what changed>

## Test Evidence
- Build: PASS
- Tests: <passed>/<total>
- Iterations: <N>/8
- Grade: 10/10

## Screenshots
See email attachment and Google Drive QA Iterations folder.

## Checklist
- [x] Build passes
- [x] All tests pass
- [x] Screenshot is 10/10 per Gold Star spec
- [x] No regressions
"'
```

### 3. Email screenshot to Steve
```bash
ssh dirtsyncmini@100.125.184.57 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && cd ~ && gws gmail +send --to dirtsyncapp@gmail.com --subject "<ISSUE>: 10/10 — Ready for Review" --body "Feature shipped. <N> iterations. All tests pass. PR created. Screenshot attached." --attach screenshot-iteration-<N>.png'
```

### 4. Upload to Google Drive
```bash
ssh dirtsyncmini@100.125.184.57 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && cd ~ && gws drive +upload --file screenshot-iteration-<N>.png --parent 1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X'
```

### 5. Post results to Forge issue
```
PATCH /api/agent/issues/:id
{
  "status": "in_review",
  "comment": "## Feature Builder Report\n\n**Grade: 10/10**\n**Iterations: <N>/8**\n**PR:** <url>\n\n### Iteration Log\n<summary of each iteration>\n\n### Final Screenshot\nEmailed + uploaded to Drive."
}
```

## Completion

Post to Forge API that the run is complete. Include:
- Total iterations used
- Final grade
- PR URL (if shipped)
- All screenshot paths
- Any lessons learned for future runs
