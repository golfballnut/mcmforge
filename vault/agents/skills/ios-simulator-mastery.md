# Skill: iOS Simulator Mastery

> Last updated: April 20, 2026
> Used by: DirtSync Simulator Specialist
> Purpose: headless orchestration of iOS simulators on the Mini for sim-proof runs (Gate A Level 2)

---

## Goal

Turn every DirtSync PR into a **watched sim run with evidence** — login + GPX replay + logs + screenshots + video — uploaded to the issue as proof. No more "build passes = ship."

## Known environment (Mini)

- **iPhone 17 sim** — device id `1C53DE6B-2574-43FF-BF29-C1C5ACF5A526`, iOS 26.4, typically booted
- **No XcodeBuildMCP** — use raw `xcrun simctl` + `xcodebuild` commands (memory: `feedback_no_xcodebuildmcp_on_mini`)
- **Project cwd** — `/Users/dirtsyncmini/DirtSync` (repo root) but `xcodebuild` runs from `/Users/dirtsyncmini/DirtSync/DirtSync/` (subdir has the `.xcodeproj`)
- **Test creds — read carefully:**
  - When app is launched with `--uitesting` flag: **auto-logs in as `test@dirtsync.app / TestPass123!`** (not agent creds — the `--uitesting` path has its own baked-in account). Verified April 20, 2026 via L-006.
  - Without `--uitesting`: use XCUITest to type `agent@dirtsync.app` / `AgentTest2026` into the login screen (memory: `feedback_xcuitest_for_login`).
- **XCUITest > simctl launch** — `simctl launch` can't dismiss iOS permission dialogs; XCUITest can (memory: `feedback_xcuitest_not_simctl_for_testing`)
- **iOS version** — Mini sim is iOS 26.4 beta. There is an OPEN pre-existing MapLibre crash at `MapCoordinator+TrailAnnotations.swift:338` (MLNShape nil crash) that aborts ALL sim launches before HUD renders. Until that's fixed (DIRA-219), no GPX replay reaches the nav HUD. See crash `DirtSync-2026-04-20-221009.ips`.

## Core commands (canonical form)

**Boot + reset a clean sim:**
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
xcrun simctl boot $SIM 2>/dev/null || true   # already-booted is fine
xcrun simctl uninstall $SIM app.dirtsync.DirtSync 2>/dev/null || true
```

**Build for sim (from DirtSync/DirtSync subdir):**
```bash
cd ~/DirtSync/DirtSync
xcodebuild build -scheme DirtSync \
  -destination "id=$SIM" \
  -derivedDataPath /tmp/dirtsync-build -quiet
APP=$(find /tmp/dirtsync-build -name "DirtSync.app" -type d | head -1)
```

**Install:**
```bash
xcrun simctl install $SIM "$APP"
```

**Run an XCUITest target:**
```bash
cd ~/DirtSync/DirtSync
xcodebuild test \
  -scheme DirtSync \
  -destination "id=$SIM" \
  -only-testing DirtSyncUITests/<TestClass>/<testMethod> \
  -derivedDataPath /tmp/dirtsync-build 2>&1 | tee /tmp/test-output.log
```

**Launch with UI-testing launch arg (real flag):**
```bash
# CORRECT flag — verified in DirtSyncApp.init launch-arg parser (April 20, 2026, L-004):
xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting-gpx=<basename>.gpx
# NOT --uitesting-free-ride-gpx= (doesn't exist)
```

**GPX fixture locations — must be in BOTH bundles (L-005):**
1. **App bundle** (`DirtSync/DirtSyncApp/Resources/TestGPXRoutes/<filename>.gpx`) — required for `--uitesting-gpx=` launch-arg path (the app bundle loads it at runtime).
2. **Test bundle** (`DirtSync/DirtSyncUITests/GPXRoutes/<filename>.gpx`) — required for XCUITest-internal replay via `GPXPlaybackLoader`.
Adding to only one = the other flow breaks silently. pbxproj wiring needs 4 entries per file (2 PBXBuildFile + 2 PBXFileReference + 2 group memberships + 2 Resources phases).

**Simulate location directly (no GPX file):**
```bash
xcrun simctl location $SIM set 38.1234,-78.5678
xcrun simctl location $SIM start <device-id> /path/to/track.gpx
```

**Capture evidence:**
```bash
# Screenshot
xcrun simctl io $SIM screenshot /tmp/qa/shot.png
# Video (runs until killed)
xcrun simctl io $SIM recordVideo /tmp/qa/session.mp4 &
# Log stream (60s captured)
xcrun simctl spawn $SIM log stream --level debug --predicate 'process == "DirtSync"' > /tmp/qa/log.txt &
LPID=$!
sleep 60
kill $LPID
```

**Upload evidence to Supabase storage:**
```bash
# Using the orchestrator's upload helper OR curl to storage REST
# Bucket: artifacts
# Path: qa/<issue-id>/<filename>
curl -X POST "https://ncwxeeqvujgyiggkviqq.supabase.co/storage/v1/object/artifacts/qa/<issue>/log.txt" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/qa/log.txt
```

## The XCUITest login sequence (sample)

```swift
func logInAsAgent() throws {
    let app = XCUIApplication()
    app.launch()

    // Wait for login screen
    let emailField = app.textFields["login.email"]  // accessibility identifier
    XCTAssertTrue(emailField.waitForExistence(timeout: 10))

    emailField.tap()
    emailField.typeText("agent@dirtsync.app")

    let passwordField = app.secureTextFields["login.password"]
    passwordField.tap()
    passwordField.typeText("AgentTest2026")

    app.buttons["login.submit"].tap()

    // Wait for home screen
    XCTAssertTrue(app.otherElements["home.root"].waitForExistence(timeout: 30))
}
```

**Required accessibility identifiers in production code:**
- `login.email`, `login.password`, `login.submit`
- `home.root` (marker for logged-in state)
- Add more as new flows need scripted login

## Common pitfalls

1. **Wrong cwd for xcodebuild** — error `does not contain an Xcode project`. Always cd into `DirtSync/` subdir, not the repo root.
2. **Stale sim state** — uninstall before install OR use `simctl erase` for a fresh device between runs.
3. **Dialog blocks test** — location-permission, notification-permission, tracking-transparency. XCUITest must tap "Allow" on each; simctl launch cannot.
4. **GPX filename path** — `--uitesting-gpx=<filename>` expects just the basename (file is resolved against app bundle). Don't pass full path. File MUST exist in `DirtSyncApp/Resources/TestGPXRoutes/` or the flag is silently ignored (L-005).
5. **Video recording hangs** — `simctl io recordVideo` blocks until killed with SIGINT. Wrap in background + kill -INT.
6. **Log stream grows unbounded** — always cap with `sleep N && kill`. Quote the predicate with double-quotes (shell single-quotes swallow the inner quotes — L-003).
7. **pbxproj surgery** — adding test files to target requires editing `.xcodeproj/project.pbxproj`. Use Xcode or careful textual edits; PBX corruption breaks the project. Precedent pattern in PR #417 (agent/dira-218-qa-harness).
8. **CI `NODE_ENV` on Mini** — set globally to `production`, so dev deps skip install (memory: `feedback_mac_mini_ci`). Not a sim issue but shows up in mixed test suites.
9. **MapLibre iOS 26.4 crash (active blocker as of Apr 20)** — `MLNShape(data:encoding:)` hits nil in `addMBTilesLabelsAndShieldsOnly` at `MapCoordinator+TrailAnnotations.swift:338`. Crashes EVERY test that launches the app on iOS 26.4 beta. Tracked in DIRA-219. Until fixed, a sim "build succeeded" means the tests compiled but none of them ran to completion — do NOT claim pass.
10. **simctl `simulate-route` doesn't exist** — use `xcrun simctl location <id> start <id> <path-to-gpx>` (the `start` subcommand). `simulate-route` will print unknown-command (L-002).
11. **Absence of service NSLog = test is inconclusive, not green** — every sim run must grep the app log for the specific service's own NSLog tag count (`RiderPresence`, `NavigationStateMachine`, etc.). Zero = service never ran = no evidence was produced. Memory: `feedback_sim_green_without_login_means_nothing`.

## Evidence bundle format (required output)

Every sim run produces `/tmp/qa/<run-id>/`:
```
qa-<run-id>/
├── log.txt              — 60s captured log (filtered to DirtSync process)
├── screenshot-start.png — immediately after login
├── screenshot-mid.png   — mid-fixture (waypoint 50% or 30s in)
├── screenshot-end.png   — end of fixture
├── session.mp4          — full video (optional, 5-10MB)
└── manifest.json        — { runId, issueId, branchSha, gpxFixture, assertions, startedAt, finishedAt }
```

Upload the whole folder to `artifacts/qa/<issue-id>/<run-id>/`. Post the URLs as a `[PROOF]` comment on the issue (per `agent-comment-protocol.md`).

## Definition of Done (for this skill)

1. The agent can boot a clean iPhone 17 sim in <10s
2. The agent can build + install DirtSync from HEAD of any branch
3. The agent can log in via XCUITest using the standard credentials, wait for home state
4. The agent can replay a GPX fixture via the `--uitesting-gpx=<basename>.gpx` launch arg (file present in `DirtSyncApp/Resources/TestGPXRoutes/`)
5. The agent captures an evidence bundle with all 5 files per the format above
6. The agent uploads the bundle to Supabase storage bucket `artifacts`
7. The agent posts a `[PROOF]` comment on the issue with URLs
8. The whole flow runs headlessly via SSH to Mini — no GUI required

## Why this skill exists

April 20, 2026: DIRA-213 (Supabase presence subscribe) was "verified" by running the app in a sim with no login — presence code never executed. Zero warnings in the log ≠ fix works. Memory `feedback_sim_green_without_login_means_nothing` captures the scar. This skill prevents that mistake.
