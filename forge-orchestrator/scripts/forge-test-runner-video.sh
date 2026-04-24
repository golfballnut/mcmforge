#!/usr/bin/env bash
# forge-test-runner-video.sh — FORGE-335 video-loop test runner
#
# Wraps xcodebuild test with:
#   - xcrun simctl io recordVideo (h264) running alongside the test
#   - xcrun simctl spawn log stream capturing device log
#   - Post-run grep for critical error patterns
#   - Drive upload of candidate video + device log
#
# Usage:
#   forge-test-runner-video.sh <TEST_CLASS>
#
# Required env:
#   TICKET_ID            e.g. DIRA-277
#   BRANCH               git branch to test
#   REFERENCE_DRIVE_ID   Drive file ID of reference clip
#
# Optional env:
#   FORGE_SCHEME         default "DirtSync"
#   FORGE_DESTINATION    default 'platform=iOS Simulator,name=iPhone 17 Pro'
#   FORGE_TIMEOUT_SEC    default 480 (8 min)
#   DRIVE_FOLDER_ID      Drive folder to upload artifacts into
#
# Output (stdout, single line, JSON):
#   {
#     "test_passed": bool,
#     "candidate_drive_id": "...",
#     "device_log_drive_id": "...",
#     "log_findings": [...],
#     "xcresult_path": "...",
#     "head_sha": "...",
#     "exit_code": N
#   }
#
# Exit codes:
#   0   — harness ran cleanly (test_passed may be false)
#   65  — test failed OR log_findings non-empty (triggers Fixer)
#   99  — dirty working tree (harness safety check)

set -euo pipefail

TEST_CLASS="${1:?missing TEST_CLASS argument}"
TICKET_ID="${TICKET_ID:?missing TICKET_ID env var}"
BRANCH="${BRANCH:?missing BRANCH env var}"
REFERENCE_DRIVE_ID="${REFERENCE_DRIVE_ID:?missing REFERENCE_DRIVE_ID env var}"

SCHEME="${FORGE_SCHEME:-DirtSync}"
DEST="${FORGE_DESTINATION:-platform=iOS Simulator,name=iPhone 17 Pro}"
TIMEOUT_SEC="${FORGE_TIMEOUT_SEC:-480}"
DRIVE_FOLDER_ID="${DRIVE_FOLDER_ID:-}"

RUN_DIR=$(mktemp -d -t forge-video-testrun-XXXXXX)
RAW_LOG="$RUN_DIR/raw.log"
XCRESULT="$RUN_DIR/result.xcresult"
CAND_VIDEO="$RUN_DIR/${TICKET_ID}-candidate.mp4"
DEVICE_LOG="$RUN_DIR/${TICKET_ID}-device.log"

cd /Users/dirtsyncmini/DirtSync

# Guard: abort if repo has uncommitted changes — TEST_RUNNER is read-only.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  printf '{"test_passed":false,"candidate_drive_id":null,"device_log_drive_id":null,"log_findings":["__DIRTY_WORKTREE__"],"xcresult_path":"","head_sha":"unknown","exit_code":99}\n'
  exit 99
fi

# Sync the branch
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
HEAD_SHA=$(git rev-parse HEAD)

# Discover the booted iPhone 17 Pro simulator UDID.
# Boot one if none is running.
UDID=$(xcrun simctl list devices --json 2>/dev/null \
  | python3 -c "
import json,sys
devs=json.load(sys.stdin)
for runtime,dlist in devs.get('devices',{}).items():
  for d in dlist:
    if 'iPhone 17 Pro' in d.get('name','') and d.get('state','')=='Booted':
      print(d['udid']); sys.exit(0)
" 2>/dev/null || true)

if [ -z "$UDID" ]; then
  # Boot the first available iPhone 17 Pro
  UDID=$(xcrun simctl list devices --json 2>/dev/null \
    | python3 -c "
import json,sys
devs=json.load(sys.stdin)
for runtime,dlist in devs.get('devices',{}).items():
  for d in dlist:
    if 'iPhone 17 Pro' in d.get('name','') and d.get('isAvailable',False):
      print(d['udid']); sys.exit(0)
" 2>/dev/null || true)
  if [ -z "$UDID" ]; then
    printf '{"test_passed":false,"candidate_drive_id":null,"device_log_drive_id":null,"log_findings":["__NO_SIMULATOR__"],"xcresult_path":"","head_sha":"%s","exit_code":1}\n' "$HEAD_SHA"
    exit 0
  fi
  xcrun simctl boot "$UDID"
  sleep 5
fi

# Build the app first so recording starts cleanly
xcodebuild build \
  -scheme "$SCHEME" \
  -destination "id=$UDID" \
  -derivedDataPath "$RUN_DIR/DerivedData" \
  > "$RUN_DIR/build.log" 2>&1 || {
  printf '{"test_passed":false,"candidate_drive_id":null,"device_log_drive_id":null,"log_findings":["__BUILD_FAILED__"],"xcresult_path":"","head_sha":"%s","exit_code":1}\n' "$HEAD_SHA"
  exit 0
}

# Install app on simulator
APP_PATH=$(find "$RUN_DIR/DerivedData" -name "*.app" -maxdepth 6 | head -1)
xcrun simctl install "$UDID" "$APP_PATH" 2>/dev/null || true

# Start video recording
xcrun simctl io "$UDID" recordVideo --codec=h264 "$CAND_VIDEO" &
RECORD_PID=$!

# Start device log stream
xcrun simctl spawn "$UDID" log stream --level=debug > "$DEVICE_LOG" 2>&1 &
LOG_PID=$!

# Run tests with hard wall-clock timeout
perl -e 'alarm shift; exec @ARGV' "$TIMEOUT_SEC" \
  xcodebuild test \
    -scheme "$SCHEME" \
    -destination "id=$UDID" \
    -only-testing:"DirtSyncUITests/$TEST_CLASS" \
    -resultBundlePath "$XCRESULT" \
    -derivedDataPath "$RUN_DIR/DerivedData" \
    > "$RAW_LOG" 2>&1
TEST_EXIT=$?

# Stop recording and log stream
kill "$RECORD_PID" 2>/dev/null || true
kill "$LOG_PID" 2>/dev/null || true
# Give recording process a moment to flush
sleep 2

# Handle timeout
if [ "$TEST_EXIT" -eq 142 ] || [ "$TEST_EXIT" -eq 124 ]; then
  TEST_EXIT=1
  echo "__HARNESS_TIMEOUT__" >> "$RAW_LOG"
fi

# Parse test pass/fail
PASSED=false
if grep -qE '\*\* TEST SUCCEEDED \*\*' "$RAW_LOG" && [ "$TEST_EXIT" -eq 0 ]; then
  PASSED=true
fi

# Grep device log for critical error patterns
LOG_FINDINGS=$(grep -oE \
  'NaN[^a-zA-Z]|CG_NUMERICS|RTIInputSystem[^:]*timeout|Result accumulator timeout|CoreText.*warning' \
  "$DEVICE_LOG" 2>/dev/null | sort | uniq -c | sort -rn | head -20 || true)

# Upload candidate video and device log to Drive (if gws is available and folder configured)
CAND_DRIVE_ID=""
LOG_DRIVE_ID=""

if command -v gws &>/dev/null && [ -n "$DRIVE_FOLDER_ID" ] && [ -f "$CAND_VIDEO" ]; then
  CAND_UPLOAD=$(gws drive files create \
    --json "{\"name\":\"${TICKET_ID}-candidate-$(date +%Y%m%d-%H%M%S).mp4\",\"parents\":[\"$DRIVE_FOLDER_ID\"]}" \
    --upload "$CAND_VIDEO" \
    --upload-content-type video/mp4 2>/dev/null || echo '{}')
  CAND_DRIVE_ID=$(echo "$CAND_UPLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)

  LOG_UPLOAD=$(gws drive files create \
    --json "{\"name\":\"${TICKET_ID}-device-$(date +%Y%m%d-%H%M%S).log\",\"parents\":[\"$DRIVE_FOLDER_ID\"]}" \
    --upload "$DEVICE_LOG" \
    --upload-content-type text/plain 2>/dev/null || echo '{}')
  LOG_DRIVE_ID=$(echo "$LOG_UPLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)
fi

# Emit structured JSON output
python3 - \
  "$PASSED" \
  "${CAND_DRIVE_ID:-null}" \
  "${LOG_DRIVE_ID:-null}" \
  "$LOG_FINDINGS" \
  "$XCRESULT" \
  "$HEAD_SHA" \
  "$TEST_EXIT" \
  <<'PY'
import json, sys
passed_str = sys.argv[1]
cand_id    = sys.argv[2] if sys.argv[2] != 'null' else None
log_id     = sys.argv[3] if sys.argv[3] != 'null' else None
findings   = [l.strip() for l in sys.argv[4].splitlines() if l.strip()] if sys.argv[4] else []
xcresult   = sys.argv[5]
head_sha   = sys.argv[6]
exit_code  = int(sys.argv[7])

out = {
  "test_passed":          passed_str == "true",
  "candidate_drive_id":   cand_id,
  "device_log_drive_id":  log_id,
  "log_findings":         findings,
  "xcresult_path":        xcresult,
  "head_sha":             head_sha,
  "exit_code":            exit_code,
}
print(json.dumps(out))
PY

# Exit 65 if tests failed OR device log has findings — signals Fixer needed
if [ "$PASSED" = "false" ] || [ -n "$LOG_FINDINGS" ]; then
  exit 65
fi

exit 0
