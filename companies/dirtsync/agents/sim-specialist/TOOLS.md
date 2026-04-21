# Tools — DirtSync Simulator Specialist

Canonical commands. Copy-paste with variables replaced.

## Required env (set by orchestrator at spawn)

- `FORGE_AGENT_ID` — my agent UUID
- `FORGE_RUN_ID` — this run's UUID
- `FORGE_API_URL` — `http://localhost:3200` (Mini agent API)
- `CLAUDE_CODE_OAUTH_TOKEN` — my Claude Max auth
- `SUPABASE_URL` — `https://ncwxeeqvujgyiggkviqq.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — privileged writes

## Constants

```
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526   # iPhone 17, iOS 26.4
BUNDLE=app.dirtsync.DirtSync
REPO=/Users/dirtsyncmini/DirtSync
PROJ=/Users/dirtsyncmini/DirtSync/DirtSync    # where .xcodeproj lives
BUILD=/tmp/dirtsync-build
```

## Agent API (for comments + inbox)

**Check my inbox:**
```bash
curl -s "$FORGE_API_URL/api/agent/me/inbox" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

**Issue context:**
```bash
curl -s "$FORGE_API_URL/api/agent/issues/$ISSUE_ID/context" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

**Post a comment (standalone — shipped via FORGE-271):**
```bash
curl -sS -X POST "$FORGE_API_URL/api/agent/issues/$ISSUE_ID/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "{\"body\": \"[START] <plan text>\"}"
```

**Update issue status + proof:**
```bash
curl -sS -X PATCH "$FORGE_API_URL/api/agent/issues/$ISSUE_ID" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_review", "proof_summary": "all 5 assertions pass, evidence bundle at <url>"}'
```

## Sim lifecycle

**Boot + clean:**
```bash
xcrun simctl boot $SIM 2>/dev/null || true
xcrun simctl uninstall $SIM $BUNDLE 2>/dev/null || true
mkdir -p /tmp/qa/$ISSUE_ID
```

**Fresh device (heavier reset):**
```bash
xcrun simctl shutdown $SIM
xcrun simctl erase $SIM
xcrun simctl boot $SIM
```

**Check sim is alive:**
```bash
xcrun simctl list devices booted | grep -q $SIM && echo booted || echo not-booted
```

## Build

**Cold build (no cache):**
```bash
cd $PROJ
rm -rf $BUILD
xcodebuild build -scheme DirtSync -destination "id=$SIM" \
  -derivedDataPath $BUILD -quiet 2>&1 | tail -10
APP=$(find $BUILD -name "DirtSync.app" -type d | head -1)
echo "app=$APP"
```

**Build for testing (required for XCUITest):**
```bash
cd $PROJ
xcodebuild build-for-testing -scheme DirtSync -destination "id=$SIM" \
  -derivedDataPath $BUILD -quiet 2>&1 | tail -5
```

**Install:**
```bash
xcrun simctl install $SIM "$APP"
```

## Launch + test

**Plain launch:**
```bash
xcrun simctl launch $SIM $BUNDLE
```

**Launch with UI-testing GPX arg:**
```bash
# Canonical flag: --uitesting-gpx=<basename> (NOT --uitesting-free-ride-gpx=; that flag does not exist)
# File must exist in DirtSyncApp/Resources/TestGPXRoutes/ or the arg is silently ignored.
# See vault/agents/skills/ios-simulator-mastery.md L-004/L-005.
xcrun simctl launch $SIM $BUNDLE \
  --uitesting-gpx=field-2026-04-20-west-river-corridor.gpx
```

**Run a specific XCUITest method:**
```bash
cd $PROJ
xcodebuild test \
  -scheme DirtSync \
  -destination "id=$SIM" \
  -only-testing DirtSyncUITests/QAHarnessSmokeTest/testFullFlow \
  -derivedDataPath $BUILD 2>&1 | tee /tmp/qa/$ISSUE_ID/test.log
```

**Check XCUITest result:**
```bash
grep -E '(TEST SUCCEEDED|TEST FAILED|PASSED|FAILED)' /tmp/qa/$ISSUE_ID/test.log | tail -5
```

## Evidence capture

**Screenshot:**
```bash
xcrun simctl io $SIM screenshot /tmp/qa/$ISSUE_ID/screenshot-$LABEL.png
```

**Video (background + capped duration):**
```bash
xcrun simctl io $SIM recordVideo --codec=h264 /tmp/qa/$ISSUE_ID/session.mp4 &
VPID=$!
sleep 90
kill -INT $VPID
wait $VPID 2>/dev/null
```

**Log stream (60s, filtered):**
```bash
xcrun simctl spawn $SIM log stream --level debug \
  --predicate 'process == "DirtSync"' > /tmp/qa/$ISSUE_ID/log.txt &
LPID=$!
sleep 60
kill $LPID
wait $LPID 2>/dev/null
```

**UI element snapshot (for accessibility id check):**
```bash
# Requires XCUITest context — use inside a helper test method:
# app.debugDescription  OR  print(app.elementTree)
```

## Supabase storage upload

**Single file:**
```bash
curl -X POST \
  "$SUPABASE_URL/storage/v1/object/artifacts/qa/$ISSUE_ID/$FILENAME" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: $MIMETYPE" \
  --data-binary @/tmp/qa/$ISSUE_ID/$FILENAME
```

**MIME types:**
- `.png` → `image/png`
- `.txt` → `text/plain`
- `.mp4` → `video/mp4`
- `.json` → `application/json`

**Public URL (read-only anon access):**
```
$SUPABASE_URL/storage/v1/object/public/artifacts/qa/$ISSUE_ID/$FILENAME
```

## Location simulation (when no GPX fixture is used)

**Set a point:**
```bash
xcrun simctl location $SIM set 38.1234,-78.5678
```

**Replay a GPX file (simctl-native, not app-level):**
```bash
xcrun simctl location $SIM start $SIM /path/to/track.gpx
```

**Clear:**
```bash
xcrun simctl location $SIM clear
```

## Debugging patterns

**Verify presence service fired (the DIRA-213 scar):**
```bash
grep -c 'RiderPresence' /tmp/qa/$ISSUE_ID/log.txt
# > 0 = service ran, bug state testable
# = 0 = service never initialized, sim run proves nothing (login required?)
```

**Check for specific warning (log-exclude assertion):**
```bash
COUNT=$(grep -c 'only track your presence' /tmp/qa/$ISSUE_ID/log.txt)
[ "$COUNT" = "0" ] && echo "PASS" || echo "FAIL — $COUNT warnings"
```

**PID of running app:**
```bash
xcrun simctl spawn $SIM launchctl list | grep $BUNDLE | awk '{print $1}'
```

## Things I never run

- `git commit` or `git push` — I don't change code. If a fix is needed, I hand off.
- `xcodebuild clean` — wasted time; `rm -rf $BUILD` is faster for a cold state.
- Interactive `lldb` — I'm headless.
- `xcrun simctl shutdown all` or `erase all` — never destroy other agents' sims.
- Anything in the `MCMForge` repo or the dashboard code. That's Forge Builder.
