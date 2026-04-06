# HEARTBEAT.md — DirtSync App Designer

Run this on every wake. No exceptions.

## 1. Orient
- Read the assigned issue from inbox: `curl -s -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" $FORGE_API_URL/api/agent/me/inbox`
- Read any comments for context
- Identify which screen(s) this issue covers

## 2. Screenshot Current State
- Build the app: `mcp__XcodeBuildMCP__build_sim`
- Launch in simulator: `mcp__XcodeBuildMCP__build_run_sim`
- Navigate to the screen in question
- Take screenshot: `mcp__XcodeBuildMCP__screenshot`
- If screen doesn't exist yet, note "NEW SCREEN — no current state"

## 3. Research Reference
- Search for how Waze/Strava handles this same screen
- Use Playwright to browse reference app web versions if needed
- Use Context7 for SwiftUI/HIG patterns if needed
- Document: "Waze does X. We do Y. The gap is Z."

## 4. Design the Screen
- Write the full spec using the Screen Spec Format from AGENTS.md
- Every element must use design system tokens (PremiumColors, fonts, spacing)
- Every element must have measurable Gold Star criteria
- EVERY screen must have all 5 states: normal, loading, empty, offline, error
- Compare to reference and document gaps

## 5. Deliver
- Update issue via API: `curl -X PATCH -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" -H "Content-Type: application/json" -d '{"status":"done","comment":"<spec summary>"}' $FORGE_API_URL/api/agent/issues/<id>`
- Write the full spec as a comment on the issue
- If multiple screens, create subtasks for each

## 6. Exit
Clean exit. One screen fully specified per session.
