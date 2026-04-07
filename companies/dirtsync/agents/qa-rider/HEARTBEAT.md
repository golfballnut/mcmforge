# HEARTBEAT.md — DirtSync QA Rider

Run this procedure on every wake. No exceptions.

## CRITICAL RULES
- **Build MUST pass before any testing.** Build fail = immediate FAIL verdict, stop.
- **Every verdict needs a screenshot.** No screenshot = no evidence = FAIL.
- **Test offline FIRST.** If it fails offline, the whole thing fails.
- **Use snapshot_ui for measurements.** Don't eyeball — get actual frame values.
- **Fill the FULL test matrix from AGENTS.md.** Partial reports are not QA reports.

## 1. Orient
- Read the assigned issue: `curl -s -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" $FORGE_API_URL/api/agent/me/inbox`
- Read ALL comments — find the builder's result comment (what was changed, which files, commit hash)
- Find the Gold Star spec or approved Figma design to compare against
- Find the acceptance criteria — these become your test matrix rows

## 2. Plan (MANDATORY)
POST your QA plan before starting:
```
curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"comment": "## QA Plan\n\n**Branch:** <branch>\n**Testing:** <list of acceptance criteria to verify>\n**Offline test:** yes\n**GPX test:** <if nav feature>\n**Regression:** nav, recording, maps, trail tap"}'
```

## 3. Setup Xcode (MANDATORY)
1. `mcp__XcodeBuildMCP__session_show_defaults` — verify config
2. If not set: `mcp__XcodeBuildMCP__session_set_defaults` — project=DirtSync.xcodeproj, scheme=DirtSync, sim=iPhone 16
3. `git fetch origin && git checkout <feature-branch>` — get the builder's code

## 4. Build
- `mcp__XcodeBuildMCP__build_sim`
- If FAIL → post "BUILD FAILED" with error → set issue status `blocked` → STOP

## 5. Launch and Screenshot Every State
- `mcp__XcodeBuildMCP__build_run_sim` — launch the app
- Navigate to the screen being tested
- For EACH state (normal, loading, empty, error, offline):
  - `mcp__XcodeBuildMCP__screenshot` → save as `qa-screenshots/DIRA-<N>-<state>.png`
  - `mcp__XcodeBuildMCP__snapshot_ui` → capture element frames and sizes
  - Compare measurements against Gold Star spec (±1pt font, ±2pt spacing)

## 6. Test Offline
- Kill network: `xcrun simctl status_bar booted override --dataNetwork wifi --wifiMode searching`
- Navigate through the feature being tested
- Screenshot every screen in offline state
- Re-enable: `xcrun simctl status_bar booted clear`
- If ANY screen crashes, shows blank, or spinner forever → FAIL

## 7. Test Interactions
- Tap every button the spec says is tappable
- Swipe every carousel/sheet
- Test back navigation
- Test rapid taps (double-tap shouldn't crash)

## 8. GPX Test (navigation features only)
- If testing navigation: inject test track via simctl
- Count turn card step advances vs expected
- Verify no premature "Arrived" or blank cards

## 9. Regression Check
- Quick verify: nav still starts, ride recording works, trail tap shows detail, maps load offline

## 10. Produce QA Report
- Fill the FULL test matrix from AGENTS.md
- Every row has: test, expected, actual, screenshot, verdict
- Include bugs found with severity and reproduction steps
- Final verdict: PASS or FAIL

## 11. Report Results (MANDATORY)
```
curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "<approved|blocked>", "comment": "## [QA REPORT]\n\n<full test matrix>\n\n**Verdict:** PASS/FAIL\n**Screenshots:** <count> attached\n**Blocking issues:** <list or none>"}'
```

Status: `approved` if PASS, `blocked` if FAIL (sends back to builder).
