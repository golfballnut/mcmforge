# HEARTBEAT.md — DirtSync App Designer

Run this on every wake. No exceptions.

## CRITICAL RULES (read these FIRST)
- **ONE screen per run.** If the issue covers multiple screens, do ONE, then POST results and let the next run handle the next screen.
- **Write to the file FIRST, comment SECOND.** Your work lives in `docs/design/app-screen-specs.md`, not in comments. Edit the file, then report what you changed.
- **Turn budget: spend 60% working, save 40% for writing + reporting.** If you have 30 turns, start writing to the file by turn 18. If you feel turns running low, STOP research and WRITE what you have.
- **Never end a session without either editing a file OR posting a comment.** Silent runs are failures.

## 1. Orient
- Read the assigned issue: `curl -s -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" $FORGE_API_URL/api/agent/me/inbox`
- Read any comments for context (especially CEO's acceptance criteria)
- Identify which SINGLE screen this run will focus on
- If the issue says "all screens" — pick the MOST IMPORTANT one and do it perfectly

## 2. Plan (MANDATORY)
POST your plan as a comment BEFORE doing any work:
```
curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"comment": "## Plan\n\n**Screen:** <which one>\n**Approach:** Read current spec, extract measurements from code, add Waze comparison, write 5 states\n**File:** docs/design/app-screen-specs.md"}'
```

## 3. Xcode MCP Setup (MANDATORY before any build)
1. Call `mcp__XcodeBuildMCP__session_show_defaults` to verify project/scheme/simulator
2. If not configured: `mcp__XcodeBuildMCP__session_set_defaults` with project=DirtSync.xcodeproj, scheme=DirtSync, simulator=iPhone 16

## 4. Screenshot Current State
- Build: `mcp__XcodeBuildMCP__build_sim`
- Launch: `mcp__XcodeBuildMCP__build_run_sim`
- Navigate to the screen
- Screenshot: `mcp__XcodeBuildMCP__screenshot`
- If screen doesn't exist yet, note "NEW SCREEN"

## 5. Extract Measurements from Code
- Read the actual Swift view file for this screen
- Extract: font sizes, padding, corner radii, colors from PremiumColors
- Read `docs/design/design-tokens.md` if it exists
- These are REAL numbers, not guesses

## 6. Write the Spec to File
**THIS IS YOUR PRIMARY OUTPUT.** Edit `docs/design/app-screen-specs.md`:
- Use the Screen Spec Format from your AGENTS.md
- Every element: type, behavior, states, measurements from actual code
- All 5 states: normal, loading, empty, offline, error
- Waze/Strava comparison: "Waze does X at Y size. We do Z."
- Gold Star criteria: measurable, not subjective

## 7. Report Results (MANDATORY)
POST results AND update issue status:
```
curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_review", "comment": "## Results\n\n**Screen:** <name>\n**File updated:** docs/design/app-screen-specs.md\n**What changed:** Added measurements, 5 states, Waze comparison, Gold Star criteria\n**Commit:** <hash if committed>"}'
```

If you only partially finished: set status to `in_progress` (not `in_review`) and note what's left.

## 8. Exit
Clean exit. ONE screen fully specified. Next run picks up the next screen.
