# DirtSync Rider QA Engineer — TOOLS

All commands run on Mac Mini via SSH unless noted. Copy-paste ready.

---

## Mac Mini Access

```bash
ssh dirtsyncmini@100.125.184.57
```

Repo root: `/Users/dirtsyncmini/DirtSync/DirtSync`
GPX tracks: `/Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/`
gws CLI: `/opt/homebrew/bin/gws`

---

## Simulator Management

### Detect booted simulator UUID (ALWAYS use this, never hardcode)
```bash
xcrun simctl list devices booted --json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    for d in devices:
        if d['state'] == 'Booted' and 'iPhone 17' in d['name']:
            print(d['udid'])
"
```

### Boot simulator if not booted
```bash
xcrun simctl boot "iPhone 17"
open -a Simulator
```

### Shutdown simulator
```bash
xcrun simctl shutdown $SIM_UUID
```

---

## Git Sync on Mini (CRITICAL — never use git pull)

```bash
cd /Users/dirtsyncmini/DirtSync/DirtSync
git fetch origin
git reset --hard origin/<branch-name>
```

Confirm SHA:
```bash
git rev-parse --short HEAD
```

---

## Ferrostar Patch (MANDATORY after every sync)

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

Verify:
```bash
grep -c "drivingSide" DirtSyncApp/Services/FerrostarNavigationService.swift
# Must be >= 1 or DO NOT PROCEED
```

---

## Build

```bash
xcodebuild clean build \
  -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  2>&1 | tail -30
```

---

## GPX Location Injection

### List available tracks
```bash
ls /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/*.gpx
```

### Inject location from GPX file (use temp copy — stdin is unreliable)
```bash
cp /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/<track>.gpx /tmp/<track>.gpx
xcrun simctl location $SIM_UUID start --speed=6.7 --interval=1 /tmp/<track>.gpx &
LOCATION_PID=$!
```

Speed 6.7 m/s = ~24 km/h = typical trail riding pace.

### Stop location injection (ALWAYS call between tracks)
```bash
kill $LOCATION_PID 2>/dev/null
xcrun simctl location $SIM_UUID stop
```

---

## Run Tests with --uitesting (bypasses auth + dialogs)

```bash
xcodebuild test \
  -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/NavHUDGoldStarTests \
  -only-testing:DirtSyncUITests/NavigationFlowUITests \
  2>&1 | tail -50
```

Add additional `-only-testing:` flags per suite as needed. Never use bare `xcrun simctl launch` for these — it cannot dismiss iOS dialogs.

---

## Screenshot Capture

```bash
# Nav launch screenshot (after app opens)
xcrun simctl io $SIM_UUID screenshot ~/qa-rider-<track>-nav-launch.png

# Turn card screenshot (after 10s of GPX playback)
sleep 10
xcrun simctl io $SIM_UUID screenshot ~/qa-rider-<track>-turn-card.png

# Arrival screenshot (at end of GPX)
xcrun simctl io $SIM_UUID screenshot ~/qa-rider-<track>-arrival.png
```

All screenshots saved to Mini home dir (`~/`). Pull to laptop for diffing.

---

## Video Recording (optional, for debugging only — archival goes to QA Recorder)

```bash
# Start recording
nohup xcrun simctl io $SIM_UUID recordVideo ~/qa-rider-<track>-debug.mp4 > /dev/null 2>&1 &
VIDEO_PID=$!

# ... run tests ...

# Stop recording
kill $VIDEO_PID 2>/dev/null
sleep 2
```

Do NOT upload video to Drive — that is QA Recorder's job.

---

## Pixel Diff — pixelDiff() from dispatcher/visual-verify.ts

The `pixelDiff` function signature:
```typescript
export function pixelDiff(
  img1Buffer: Buffer,   // baseline PNG
  img2Buffer: Buffer    // current run PNG
): PixelDiffResult
```

Where:
```typescript
interface PixelDiffResult {
  diffPercent: number;      // percentage of pixels that changed
  diffPixels: number;       // raw count of changed pixels
  totalPixels: number;
  diffImageBuffer?: Buffer; // red-highlight diff image, write as PNG
}
```

Usage from a script:
```typescript
import { pixelDiff } from "../../../../dispatcher/visual-verify.ts";
import { readFileSync, writeFileSync } from "fs";

const baseline = readFileSync("dispatcher/regression-baselines/rider-qa/<track>/<sha>/nav-launch.png");
const current  = readFileSync("~/qa-rider-<track>-nav-launch.png");

const result = pixelDiff(baseline, current);
console.log(`Diff: ${result.diffPercent.toFixed(1)}%`);

if (result.diffImageBuffer) {
  writeFileSync("dispatcher/regression-baselines/rider-qa/<track>/<sha>/nav-launch-diff.png", result.diffImageBuffer);
}
```

**Threshold:** diff > 5% = regression. Exclude top 44px (status bar) before diffing.

---

## Regression Baseline Storage Convention

```
dispatcher/regression-baselines/rider-qa/
  <track-slug>/            e.g. kidd-dairy-trail/
    <build-sha>/           e.g. abc1234/
      nav-launch.png
      turn-card.png
      arrival.png
      nav-launch-diff.png  (only written if diffed against prior baseline)
      turn-card-diff.png
      arrival-diff.png
      result.json          (per-track result object)
```

This is a **document path only** — the directory `dispatcher/regression-baselines/rider-qa/` does not exist in the repo yet and should be created on first run. Do NOT pre-create it as an empty directory commit.

---

## Email Steve (regression only)

```bash
ssh dirtsyncmini@100.125.184.57 \
  'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && cd ~ && \
   gws gmail +send \
     --to dirtsyncapp@gmail.com \
     --subject "REGRESSION: <branch> — <track>.gpx failed" \
     --body "Pixel diff <N>% on <trigger>. See Forge issue <id>." \
     --attach qa-rider-<track>-turn-card-diff.png'
```

Rules:
- `--attach` not `--attachment`
- File must be in cwd when gws runs (use `cd ~` before)
- Only email on regression — do NOT email on clean passes

---

## Post Results to Forge

```bash
curl -X PATCH https://mcmforge.com/api/agent/issues/<issueId> \
  -H "Content-Type: application/json" \
  -d '{
    "comment": "## Rider QA — Regression Report\n\n**Branch:** `<branch>`\n**Tracks:** <N> run\n\n| Track | Result | Diff % |\n|-------|--------|--------|\n| <track>.gpx | PASS | 1.2% |\n",
    "status": "done"
  }'
```

Set `"status": "in_review"` if any tracks failed.

---

## Budget Rationale

- $0.75/day target: 9 GPX tracks × 3 screenshots × 1 pixelDiff call each = pure mechanical work, minimal LLM tokens needed
- $2.50/day hard cap: if a run exceeds this, something is looping — stop and investigate before continuing
- Use Claude Sonnet (not Opus) — Sonnet handles aggregation and issue posting at a fraction of Opus cost
- Grunt loops (track enumeration, file copying) can use Gemini on Mini if available
