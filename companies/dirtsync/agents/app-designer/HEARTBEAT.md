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

## 3b. Plan (MANDATORY before any design work)
1. Write a plan: which screens will you spec, what's your approach, what could go wrong
2. POST the plan as a comment on the issue:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Plan\n\n<your plan here>\n\n**Screens:** ...\n**Approach:** ...\n**Risk:** ..."}'
   ```
3. For trivial fixes (<10 lines, obvious from error): note "Trivial fix, skipping plan" in comment
4. For design work: the plan IS your contract. Don't deviate without updating it.

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

## 6. Report Results (MANDATORY — your work doesn't count without this)
1. POST your results as a comment on the issue:
   ```
   curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "Content-Type: application/json" \
     -d '{"comment": "## Results\n\n<summary of what you did>\n\n**Files changed:** ...\n**Status:** ...\n**Next steps:** ..."}'
   ```
2. If you're running low on turns, STOP working and POST what you have so far
3. Update issue status via PATCH (in_review, approved, done, blocked)
4. Your work does NOT count unless it's posted as a comment. The next agent in the chain reads your comment to continue.

## 7. Exit
Clean exit. One screen fully specified per session.
