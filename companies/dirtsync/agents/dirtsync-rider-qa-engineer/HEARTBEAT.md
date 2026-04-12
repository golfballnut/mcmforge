# DirtSync Rider QA Engineer — HEARTBEAT

Every session starts here. Read every section in order. Do not skip.

---

## 0. Read Your Lessons

Before anything else:
```
Read: companies/dirtsync/agents/dirtsync-rider-qa-engineer/LESSONS.md
```
Apply every lesson. They exist because something broke. Respect them.

---

## 1. Read Your Issue

Get your run context from the Forge issue or orchestrator trigger:
```
GET /api/agent/issues?status=queued&assignee=dirtsync-rider-qa-engineer
```
Extract: `issueId`, `branch`, `tracksToRun` (default = ALL tracks if not specified).

Post a starting comment:
```
PATCH /api/agent/issues/:id
{ "comment": "Rider QA starting. Branch: <branch>. Tracks: <count or 'all'>." }
```

---

## 2. SSH to Mini

```bash
ssh dirtsyncmini@100.125.184.57
```

Confirm you are on Mini before proceeding. Hostname should be `dirtsyncmini`.

---

## 3. Detect Simulator UUID Dynamically

```bash
xcrun simctl list devices booted --json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    for d in devices:
        if d['state'] == 'Booted' and 'iPhone 17' in d['name']:
            print(d['udid'])
            break
"
```

Save to `$SIM_UUID`. If nothing is booted, boot it:
```bash
xcrun simctl boot "iPhone 17"
# Then re-detect UUID
```

**NEVER hardcode the UUID.** It changes on reboot.

---

## 4. Sync Branch on Mini

```bash
cd /Users/dirtsyncmini/DirtSync/DirtSync
git fetch origin
git reset --hard origin/<branch>
```

NEVER use `git pull`. Confirm current HEAD matches expected branch after reset.

---

## 5. Apply Ferrostar Patch (MANDATORY)

```bash
python3 - <<'EOF'
with open("DirtSyncApp/Services/FerrostarNavigationService.swift", "r") as f:
    c = f.read()
c = c.replace(
    '            incidents: []\n        )',
    '            incidents: [],\n            drivingSide: nil,\n            roundaboutExitNumber: nil\n        )'
)
with open("DirtSyncApp/Services/FerrostarNavigationService.swift", "w") as f:
    f.write(c)
print("Ferrostar patch applied")
EOF
```

Verify patch applied:
```bash
grep -c "drivingSide" DirtSyncApp/Services/FerrostarNavigationService.swift
# Must return >= 1
```

If grep returns 0, stop. Do not proceed. The patch did not apply — investigate the file structure before building.

---

## 6. Build

```bash
cd /Users/dirtsyncmini/DirtSync/DirtSync
xcodebuild clean build \
  -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  2>&1 | tail -30
```

Build must exit 0. If it fails, post the last 30 lines to the Forge issue and halt. Do NOT run tests against a failed build.

---

## 7. Enumerate GPX Tracks

```bash
ls /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/*.gpx
```

Build the track list. If `tracksToRun` from the issue specifies a subset, use only those. Otherwise run all.

---

## 8. Run Regression — One Track at a Time

For each track, execute this loop:

### 8a. Stop any existing location injection
```bash
xcrun simctl location $SIM_UUID stop 2>/dev/null || true
```

### 8b. Copy GPX to temp path and inject
```bash
cp /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/<track>.gpx /tmp/<track>.gpx
xcrun simctl location $SIM_UUID start --speed=6.7 --interval=1 /tmp/<track>.gpx &
LOCATION_PID=$!
```

### 8c. Run the test suite with --uitesting
```bash
xcodebuild test \
  -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/NavHUDGoldStarTests \
  -only-testing:DirtSyncUITests/NavigationFlowUITests \
  2>&1 | tail -40
```

Capture pass/fail counts from the output.

### 8d. Screenshot at fixed trigger points

After nav launches (wait for `TurnCardView` to appear or 5s timeout):
```bash
xcrun simctl io $SIM_UUID screenshot ~/qa-rider-<track>-nav-launch.png
```

After first turn (wait 10s into GPX):
```bash
xcrun simctl io $SIM_UUID screenshot ~/qa-rider-<track>-turn-card.png
```

After arrival (at end of GPX):
```bash
xcrun simctl io $SIM_UUID screenshot ~/qa-rider-<track>-arrival.png
```

### 8e. Stop location injection
```bash
kill $LOCATION_PID 2>/dev/null
xcrun simctl location $SIM_UUID stop
```

### 8f. Compute pixel diff vs baseline

Baseline path: `dispatcher/regression-baselines/rider-qa/<track>/<build-sha>/`

If baseline does not exist → create it (copy screenshots, mark track PASS, note "baseline established").

If baseline exists → run pixelDiff:
```bash
# On laptop / orchestrator (not Mini) — pixelDiff runs in dispatcher
npx tsx dispatcher/visual-verify.ts pixelDiff \
  dispatcher/regression-baselines/rider-qa/<track>/<prior-sha>/<trigger>.png \
  ~/qa-rider-<track>-<trigger>.png
```

Diff > 5% = regression. Write diff image to `dispatcher/regression-baselines/rider-qa/<track>/<build-sha>/<trigger>-diff.png`.

---

## 9. Aggregate Results

Build result JSON (see AGENTS.md Output Format). Include all tracks, pass/fail, diff percents, screenshot paths.

---

## 10. Post to Forge Issue

```
PATCH /api/agent/issues/:id
{
  "comment": "<per-track table — see AGENTS.md Issue comment template>",
  "status": "done"   // or "in_review" if regressions found
}
```

If regressions found, set status to `in_review` and note escalation target in comment.

---

## 11. Email Steve on Regression

Only if at least one track failed:

```bash
ssh dirtsyncmini@100.125.184.57 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && cd ~ && gws gmail +send \
  --to dirtsyncapp@gmail.com \
  --subject "REGRESSION: <branch> — <N> tracks failed" \
  --body "Rider QA regression detected. See Forge issue <id> for details. Diff attached." \
  --attach qa-rider-<track>-turn-card-diff.png'
```

Do NOT email Steve for clean (all-pass) runs. Silent success is fine.

---

## Final — Append Lessons Learned

At the end of every session, append to `LESSONS.md`:

```markdown
## <date> — <one-line topic>
**What happened:** <what went wrong or what you discovered>
**Fix:** <what you did>
**Tag:** [GOTCHA | WORKFLOW | ESCALATION | TOOL]
```

Only add lessons for things not already in LESSONS.md. Duplicates waste context.
