# HEARTBEAT.md — DirtSync App Designer

Run this on every wake. No exceptions.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory (`companies/dirtsync/agents/app-designer/LESSONS.md`). Create with this header if missing:

   ```
   # Lessons Learned — App Designer

   Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

   ---
   ```

2. Scan for past lessons relevant to the current screen (match by tag or screen name).
3. If a past lesson with `Outcome: worked` matches, try that approach first.

See `vault/agents/skills/lessons-learned-loop.md`.

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

## 3. Research Reference (NO simulator — design phase is vision, not current state)
- **DO NOT open Xcode or the simulator during design.** Simulator screenshots are for QA, not design.
- Read the Swift code to understand what EXISTS (file structure, data models, colors)
- Use Playwright to screenshot Waze/Strava web apps for reference:
  - `mcp__plugin_playwright_playwright__browser_navigate` → browse reference app
  - `mcp__plugin_playwright_playwright__browser_take_screenshot` → save to `docs/design/screenshots/<screen-name>-reference.png`
- Use Context7 to look up iOS HIG and SwiftUI patterns

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

## 7. Push Visual to Figma (THIS IS YOUR PRIMARY VISUAL OUTPUT)
- Use `figma-generate-design` skill to create the screen mockup in Figma
- This is what Steve reviews — the visual, not the markdown
- If Figma is not configured, the spec + reference screenshots are the fallback

## 8. Upload to Google Drive
- Upload screenshots to Google Drive DirtSync folder:
  ```bash
  gws drive files create --json '{"name": "<screen>-screenshot.png", "parents": ["1AxKejUmVOhrD69x8yxBw4hrVRLXf8i2e"]}' \
    --upload docs/design/screenshots/<screen>-normal.png --upload-content-type "image/png"
  ```
- This makes visuals available to Steve on his phone

## 9. Report Results (MANDATORY)
POST results AND update issue status:
```
curl -X PATCH $FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_review", "comment": "## Results\n\n**Screen:** <name>\n**File updated:** docs/design/app-screen-specs.md\n**What changed:** Added measurements, 5 states, Waze comparison, Gold Star criteria\n**Commit:** <hash if committed>"}'
```

If you only partially finished: set status to `in_progress` (not `in_review`) and note what's left.

## 8. Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you hit this run, append one entry to the TOP of `companies/dirtsync/agents/app-designer/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit with your work.

## 9. Exit
Clean exit. ONE screen fully specified. Next run picks up the next screen.
