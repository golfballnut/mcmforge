# Phase 0: Pre-Setup

**Complete ALL steps before loading Phase 1. No skipping.**

---

## Step 0: Connect

Verify environment variables are set and connection works:
```bash
export ISSUE_ID="<YOUR_ISSUE_ID>"
export AGENT_ID="<YOUR_AGENT_ID>"

curl -s "$SUPA_URL/rest/v1/issues?company_id=eq.$COMPANY_ID&status=eq.todo&select=id,title&limit=3" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge"
```

If you see issues, you're connected. If empty or error, STOP and fix auth.

**Track:** `step_0: {done: true}`

---

## Step 0.25: Read Your Run Ratings

Check your last 5 ratings. These tell you what you got wrong before.

```bash
curl -s "$SUPA_URL/rest/v1/run_ratings?agent_id=eq.$AGENT_ID&select=score,gaps,notes,created_at&order=created_at.desc&limit=5" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge" | python3 -m json.tool
```

**If any rating has gaps, commit to avoiding them:**

| Gap | What to do differently |
|-----|----------------------|
| `wrong-basemap` | Test on satellite, not offline |
| `config-test-not-render` | XCUITest that launches app, not unit test |
| `no-screenshot` | Post RED and GREEN screenshots |
| `no-red-green` | Reproduce bug FIRST, then fix |
| `wrong-specialist` | Check routing comment for specialist |
| `missed-knowledge` | Read the Knowledge Bot comment on the issue |
| `no-xcuitest` | Visual features require XCUITest |
| `stale-branch` | Verify branch has all recent merges |
| `excess-iterations` | Diagnose root cause before retrying |
| `claimed-victory` | Watch every line of test output |

**If your last run scored below 7:** Post a comment explaining what you'll do differently.

**Track:** `step_0.25: {done: true, last_score: X, gaps: [...]}`

---

## Step 0.4: Read Specialist's Lessons

Check the routing comment on the issue (posted by Knowledge Bot). If it names a specialist that is NOT you, read their LESSONS.md:

| Specialist | Path |
|-----------|------|
| Map Rendering Expert | `companies/dirtsync/agents/map-rendering-expert/LESSONS.md` |
| Nav HUD Polish Expert | `companies/dirtsync/agents/nav-hud-polish-expert/LESSONS.md` |
| Explore UX Expert | `companies/dirtsync/agents/explore-ux-expert/LESSONS.md` |

These contain hard-won knowledge from previous failures. Read them BEFORE writing code.

**If no routing comment or you ARE the specialist:** Skip this step.

**Track:** `step_0.4: {done: true, specialist: "Name" or "self"}`

---

## Step 0.5: Read Knowledge

**Check the issue comments FIRST.** If a Knowledge Bot "Required Reading" comment exists, that's your pre-loaded context. Read every entry.

Only search manually if you need additional entries:
```bash
curl -s "$SUPA_URL/rest/v1/knowledge?tags=cs.{TAG}&confidence=neq.disproven&select=title,body,tags,confidence" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge" | python3 -m json.tool
```

**Rules:**
- If a knowledge entry is marked `proven` — apply it before attempting your own fix
- If marked `disproven` — do NOT repeat that approach
- If no knowledge exists — your work will become knowledge for the next agent

**Post to issue:** "Step 0.5: Knowledge — [count] entries read. Key insight: [summary or none]"

**Track:** `step_0.5: {done: true, entries_read: N}`

---

## Step 0.75: Environment Pre-Flight

**BEFORE writing any code**, confirm your test environment matches what the user sees.

Post this checklist to the issue:
```
## Step 0.75: Environment Pre-Flight
- Default basemap: satellite (mapbox-satellite-style.json)
- Test basemap: [satellite / offline / both]
- Simulator: iPhone 16 Pro (iOS 18.x)
- Zoom level for this bug: [z8-z12 / z14+ / all]
- Style JSON has glyphs URL: [yes / MISSING — fix first]
- Branch base: master at commit [sha]
- All recent PRs merged to master: [yes / no — list missing]
```

**Hard rules:**
- Labels/text/symbols → verify glyphs URL exists in the style JSON
- Map rendering → test on SATELLITE (user default), not offline
- Location/GPS → use GPX test track, not static screenshots
- Don't know what user sees → **ASK, don't guess**

**If any pre-flight item is wrong: FIX IT before writing the test.**

**Track:** `step_0.75: {done: true, basemap: "satellite", glyphs: true, branch_sha: "abc123"}`

---

**Phase 0 complete. Load `01-understand.md`.**
