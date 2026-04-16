# Phase 3: Visual Proof

**Only load this phase if the issue involves anything visible. Skip for pure logic issues.**

---

## Step 7: Run on Simulator (match pre-flight)

**Use the EXACT basemap and zoom from Step 0.75.** If you said "satellite" — the simulator MUST load satellite.

```bash
SIM=$(xcrun simctl list devices | grep "iPhone 16 Pro" | grep -v Max | head -1 | grep -oE '[A-F0-9-]{36}')
xcrun simctl boot $SIM 2>/dev/null
xcrun simctl install $SIM $(find ~/Library/Developer/Xcode/DerivedData/DirtSync-*/Build/Products/Debug-iphonesimulator/DirtSync.app -maxdepth 0 2>/dev/null | head -1)
xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting
```

**Verify basemap:** If you see dark green but pre-flight said satellite — STOP and fix style loading.

Play GPX if needed:
```bash
xcrun simctl location $SIM start-simulation /path/to/gpx-file.gpx
```

**Track:** `step_7: {done: true, basemap_verified: "satellite"}`

---

## Step 8: Screenshots + Upload

For EACH acceptance criterion with visual proof:

```bash
xcrun simctl io $SIM screenshot qa-screenshots/<issue-slug>-GREEN-<criterion>.png
```

**READ the screenshot yourself.** Does it prove the criterion?
- YES → continue
- NO → go back to Phase 2, Step 5

**Upload to Forge:**
```bash
SCREENSHOT_PATH="qa-screenshots/<issue-slug>-GREEN.png"
FILENAME=$(basename "$SCREENSHOT_PATH")
STORAGE_PATH="task-attachments/$(date +%s)-${RANDOM}.png"

curl -s "$SUPA_URL/storage/v1/object/artifacts/$STORAGE_PATH" \
  -X POST -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: image/png" --data-binary @"$SCREENSHOT_PATH"

curl -s "$SUPA_URL/rest/v1/issue_attachments" -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d "{\"issue_id\":\"$ISSUE_ID\", \"filename\":\"$FILENAME\", \"mime_type\":\"image/png\", \"storage_path\":\"$STORAGE_PATH\", \"category\":\"testing\"}"
```

**Post to issue:** "Step 8: Screenshots — [filename] proves [criterion]. UPLOADED."

**Track:** `step_8: {done: true, screenshots_uploaded: N}`

---

## Step 8.5: Visual Critic — RED vs GREEN

**You CANNOT grade your own visual work.** Compare Step 4.5 RED against Step 8 GREEN:

1. **Same GPS point, same zoom, same scenario.** Only difference = the fix.
2. For EACH criterion:
   - RED: does it show the bug? [YES/NO]
   - GREEN: does it show the fix? [YES/NO]
   - Beacon matches HUD name? [YES/NO]
   - Would a stranger say this looks correct? [YES/NO]

**Hard rules:**
- HUD says trail name → beacon MUST be on that trail
- HUD says "Off-trail" → beacon MUST be away from all trails
- HUD says road name → beacon MUST be on a road
- ANY mismatch → fix is WRONG → back to Phase 2, Step 5

**Post to issue:**
```
Step 8.5: Visual Critic
- RED: [filename] — bug visible: YES
- GREEN: [filename] — bug fixed: YES
- Beacon matches HUD: YES
- Stranger test: YES
- Verdict: PASS / FAIL
```

**FAIL → back to Phase 2. No rationalizing.**

**Track:** `step_8.5: {done: true, verdict: "PASS"}`

---

## Step 9: Record Video + Upload

```bash
xcrun simctl io $SIM recordVideo qa-screenshots/<issue-slug>-proof.mp4 &
REC_PID=$!
sleep 60  # let scenario play
kill $REC_PID
```

Upload:
```bash
VIDEO_PATH="qa-screenshots/<issue-slug>-proof.mp4"
FILENAME=$(basename "$VIDEO_PATH")
STORAGE_PATH="task-attachments/$(date +%s)-${RANDOM}.mp4"

curl -s "$SUPA_URL/storage/v1/object/artifacts/$STORAGE_PATH" \
  -X POST -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: video/mp4" --data-binary @"$VIDEO_PATH"

curl -s "$SUPA_URL/rest/v1/issue_attachments" -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d "{\"issue_id\":\"$ISSUE_ID\", \"filename\":\"$FILENAME\", \"mime_type\":\"video/mp4\", \"storage_path\":\"$STORAGE_PATH\", \"category\":\"video\"}"
```

**Track:** `step_9: {done: true, video_uploaded: true}`

---

**Phase 3 complete. Load `04-ship.md`.**
