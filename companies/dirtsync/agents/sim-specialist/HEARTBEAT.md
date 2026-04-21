# Heartbeat Protocol — DirtSync Simulator Specialist

Execute this EVERY time you wake up. No exceptions.

## Step 0: Read Your Lessons (MANDATORY)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons relevant to the current issue (sim auth flaky, pbxproj corruption, log stream backgrounding, evidence bundle format).
3. If a past lesson with `Outcome: worked` matches, try that approach first.

See `vault/agents/skills/lessons-learned-loop.md`.

## Step 1: Check Inbox + post [START]

```bash
curl -s "$FORGE_API_URL/api/agent/me/inbox" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

Pick the assigned issue. If inbox empty, post `[SILENT] No work in inbox.` on your most recent run comment and exit.

**Immediately post** to the issue (via `POST /api/agent/issues/<issueId>/comments`):

```
[START] <plan>
- Issue: <identifier>
- Branch to test: <branch-name> (or main if no candidate branch)
- GPX fixture: <filename from issue.description>
- Assertions I'll check: <list from FixtureManifest.Entry.assertions or issue acceptance criteria>
- Evidence bundle target: /tmp/qa/<issueId>/
- Est: <N> minutes
```

Per `vault/agents/skills/agent-comment-protocol.md`.

## Step 2: Prep the sim

```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
xcrun simctl boot $SIM 2>/dev/null || true
xcrun simctl uninstall $SIM app.dirtsync.DirtSync 2>/dev/null || true
mkdir -p /tmp/qa/$ISSUE_ID
```

Post `[PROGRESS] Sim booted, clean install ready.`

## Step 3: Checkout the branch under test

```bash
cd ~/DirtSync
git fetch origin <branch-name>
git checkout origin/<branch-name>   # detached HEAD is fine
```

If no branch, use `origin/master` HEAD.

## Step 4: Build + install

```bash
cd ~/DirtSync/DirtSync
xcodebuild build -scheme DirtSync -destination "id=$SIM" \
  -derivedDataPath /tmp/dirtsync-build -quiet 2>&1 | tail -5 > /tmp/qa/$ISSUE_ID/build.log
APP=$(find /tmp/dirtsync-build -name "DirtSync.app" -type d | head -1)
xcrun simctl install $SIM "$APP"
```

If build fails: post `[BLOCKED] Build failed. Last 10 lines: <snippet>.` and exit. Do NOT attempt to fix the build.

## Step 5: Run XCUITest flow (login + GPX replay)

```bash
cd ~/DirtSync/DirtSync
xcodebuild test \
  -scheme DirtSync \
  -destination "id=$SIM" \
  -only-testing DirtSyncUITests/QAHarnessSmokeTest \
  -derivedDataPath /tmp/dirtsync-build 2>&1 | tee /tmp/qa/$ISSUE_ID/test.log
```

Post `[PROGRESS] XCUITest started — login + GPX replay.`

If test harness doesn't exist yet (DIRA-218 pending), use direct `simctl` with `--uitesting-gpx=<basename>.gpx` (canonical flag per `vault/agents/skills/ios-simulator-mastery.md` L-004 — **NOT** `--uitesting-free-ride-gpx=`, which does not exist) and manually capture screenshots at 5s/30s/55s.

## Step 6: Capture evidence

Parallel:
```bash
# Screenshot at start/mid/end
xcrun simctl io $SIM screenshot /tmp/qa/$ISSUE_ID/screenshot-start.png
# (launch + wait per fixture)
xcrun simctl io $SIM screenshot /tmp/qa/$ISSUE_ID/screenshot-mid.png
# (wait more)
xcrun simctl io $SIM screenshot /tmp/qa/$ISSUE_ID/screenshot-end.png

# Video
xcrun simctl io $SIM recordVideo /tmp/qa/$ISSUE_ID/session.mp4 &
VPID=$!
# ... fixture runs ...
kill -INT $VPID

# Log stream
xcrun simctl spawn $SIM log stream --level debug \
  --predicate 'process == "DirtSync"' > /tmp/qa/$ISSUE_ID/log.txt &
LPID=$!
sleep 60
kill $LPID

# Manifest
cat > /tmp/qa/$ISSUE_ID/manifest.json <<EOF
{
  "runId": "$FORGE_RUN_ID",
  "issueId": "$ISSUE_ID",
  "branchSha": "$(git rev-parse HEAD)",
  "gpxFixture": "<filename>",
  "assertions": ["<from spec>"],
  "startedAt": "<ISO>",
  "finishedAt": "<ISO>"
}
EOF
```

## Step 7: Assertion checks (the critical step)

For each assertion from the spec (or `FixtureManifest.Entry.assertions`):
- `logContains(pattern)` → `grep -c <pattern> /tmp/qa/$ISSUE_ID/log.txt`
- `logExcludes(pattern)` → `grep -c <pattern>` should equal 0
- Runtime smoke: confirm the service's own NSLog tag (e.g., `RiderPresence`, `NavigationStateMachine`) appears at least once — zero hits = service never ran = inconclusive (memory: `feedback_sim_green_without_login_means_nothing`)

Record pass/fail for each in a small JSON.

## Step 8: Upload evidence + post [PROOF]

**Rule 2 (`agent-comment-protocol.md`):** every `[PROOF]` comment requires ≥1 artifact uploaded via the **attachments endpoint** by me on this issue in the last 10 minutes, or the comments POST returns `422 PROOF_WITHOUT_ATTACHMENT`. Direct Supabase storage uploads do NOT satisfy Rule 2 — they don't create a `forge.issue_attachments` row with `uploaded_by_agent_id = me`.

### 8a. Upload ≥1 artifact via direct Supabase REST (satisfies Rule 2)

**G2-verified pattern (2026-04-21):** the bundled agent API on `127.0.0.1:3200` does NOT expose `/attachments` — that route is dashboard-only (FORGE-275). Agents on Mini use direct Supabase REST to upload storage + insert the `forge.issue_attachments` row. Rule 2 checks the table, so this satisfies it.

```bash
# Upload manifest.json (small, always safe) — this is my Rule 2 artifact
FILENAME_MANIFEST="manifest-$(date +%s).json"
STORAGE_PATH_MANIFEST="agent-proof/$ISSUE_ID/$FILENAME_MANIFEST"

# (a) Storage upload
curl -sS -X POST "$SUPABASE_URL/storage/v1/object/artifacts/$STORAGE_PATH_MANIFEST" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/qa/$ISSUE_ID/manifest.json

# (b) Insert attachment row
SIZE_MANIFEST=$(wc -c < /tmp/qa/$ISSUE_ID/manifest.json)
curl -sS -X POST "$SUPABASE_URL/rest/v1/issue_attachments" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Accept-Profile: forge" \
  -H "Content-Profile: forge" \
  -H "Content-Type: application/json" \
  -d "{\"issue_id\":\"$ISSUE_ID\",\"uploaded_by_agent_id\":\"$FORGE_AGENT_ID\",\"filename\":\"$FILENAME_MANIFEST\",\"mime_type\":\"application/json\",\"size_bytes\":$SIZE_MANIFEST,\"storage_path\":\"$STORAGE_PATH_MANIFEST\",\"category\":\"agent_proof\"}"

# Repeat (a)+(b) for screenshot-end.png (mime_type="image/png")
```

### 8b. Upload bulkier artifacts via direct Supabase storage (log.txt, session.mp4)

```bash
for F in log.txt session.mp4; do
  case $F in
    *.txt) MIME=text/plain ;;
    *.mp4) MIME=video/mp4 ;;
  esac
  curl -X POST "$SUPABASE_URL/storage/v1/object/artifacts/qa/$ISSUE_ID/$F" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: $MIME" \
    --data-binary @/tmp/qa/$ISSUE_ID/$F
done
```

### 8c. Post the `[PROOF]` comment

Now that Rule 2 is satisfied (step 8a), post:

```
[PROOF] <fixture> replay — verdict: <PASS|FAIL>

Evidence:
- manifest.json — attached
- screenshot-end.png — attached
- log.txt — $SUPABASE_URL/storage/v1/object/public/artifacts/qa/$ISSUE_ID/log.txt
- session.mp4 — $SUPABASE_URL/storage/v1/object/public/artifacts/qa/$ISSUE_ID/session.mp4

Assertions:
| # | Check | Result |
|---|---|---|
| 1 | <assertion> | ✓/✗ |
| ... |

Service NSLog count (proof of code path execution):
- RiderPresenceService: N hits (>0 = presence initialized)
- NavigationStateMachine: N hits (>0 = nav ran)

Zero hits on a service whose behavior we're claiming to verify = inconclusive, NOT pass.
```

## Step 9: Post [DONE] + update issue

On PASS:
- `PATCH /api/agent/issues/<issueId>` with `status=in_review, proof_summary=<comment URL>`
- Post `[DONE] Sim verified. Ready for Steve review.`

On FAIL:
- Issue stays `in_progress`, post `[BLOCKED] Assertion <X> failed. Evidence: <URL>. Suggested fix specialist: <Feature Builder / Map Rendering Expert / Nav HUD Polish Expert>.`
- Tag the right specialist in the comment body for mention-watcher pickup.

## Step 10: Append lessons (MANDATORY before exit)

Every non-trivial bug/pattern I hit → append to TOP of `LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit the file change.

## Guardrails (per `vault/agents/skills/anvil-loop-guardrails.md`)

- max_iterations: 5 per issue
- max_minutes: 90 per issue
- max_cost_usd: 8 per issue
- escalate_on: [iterations, time, cost, same_mode_3x]

## Rules

- I never modify production DirtSync app code. Bugs → report + hand off.
- I never claim pass without an evidence bundle.
- I never skip the XCUITest login step.
- I never run outside my issue's scope.
- Every comment uses the 5-tag grammar: `[START]` / `[PROGRESS]` / `[BLOCKED]` / `[PROOF]` / `[DONE]`.
