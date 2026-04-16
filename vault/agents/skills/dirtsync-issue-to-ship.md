---
name: dirtsync-issue-to-ship
description: The COMPLETE checklist for DirtSync iOS work. From reading the Forge issue to posting proof. Every step must be followed in order. No skipping.
---

# DirtSync: Issue to Ship

This is your step-by-step checklist. Follow it IN ORDER. Do not skip steps. Do not rearrange. Each step must be completed before moving to the next.

---

## Step 0: Setup (once per session)

```bash
export SUPA_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator/.env | cut -d= -f2-)
export SUPA_URL="https://ncwxeeqvujgyiggkviqq.supabase.co"
export COMPANY_ID="99338dee-5fdc-4cbf-a344-5c08ec112a2b"
```

Verify it works:
```bash
curl -s "$SUPA_URL/rest/v1/issues?company_id=eq.$COMPANY_ID&status=eq.todo&select=id,title&limit=3" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge"
```

If you see issues, you're connected. If empty or error, STOP and fix auth.

**How to "Post to issue"** — use this for EVERY step that says "Post to issue":
```bash
curl -s "$SUPA_URL/rest/v1/issue_comments" -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d "{\"issue_id\":\"<ISSUE_ID>\", \"company_id\":\"$COMPANY_ID\", \"body\":\"<YOUR_COMMENT>\"}"
```
**CRITICAL:** `company_id` is required (NOT NULL). Omitting it will silently fail.

---

## Step 0.25: Read Your Run Ratings

**BEFORE anything else**, check your recent ratings. These are scored 1-10 with tagged reasons why you lost points. Do NOT repeat the same gaps.

```bash
# Replace $AGENT_ID with your agent ID from the issue assignment
curl -s "$SUPA_URL/rest/v1/run_ratings?agent_id=eq.$AGENT_ID&select=score,gaps,notes,created_at&order=created_at.desc&limit=5" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge" | python3 -m json.tool
```

**If any rating has gaps, read each one and commit to avoiding it:**
- `wrong-basemap` → Test on satellite (the ACTUAL user default), not offline
- `config-test-not-render` → Write XCUITest that launches app, not unit test checking constants
- `no-screenshot` → Post RED and GREEN screenshots before claiming done
- `no-red-green` → Reproduce bug FIRST (RED), then fix (GREEN), compare
- `wrong-specialist` → Check if a domain specialist exists for this issue's tags
- `missed-knowledge` → Read the auto-injected knowledge comment on the issue
- `no-xcuitest` → Visual features require XCUITest, not unit tests
- `stale-branch` → Verify branch has all recent merges before starting
- `excess-iterations` → Diagnose root cause before iterating. 5+ attempts = step back and think
- `claimed-victory` → Watch the test output. Read every line. Don't assume pass.

**If your last run scored below 7, post a comment to the issue explaining what you'll do differently this time.**

---

## Step 0.4: Read Specialist's Lessons (if you're not the specialist)

Check the routing comment on the issue (posted by Knowledge Bot). If it names a specialist that is NOT you (e.g., "Map Rendering Expert covers this domain but is paused"), you MUST read their LESSONS.md before starting:

```bash
# Example: Map Rendering Expert's lessons
cat companies/dirtsync/agents/map-rendering-expert/LESSONS.md
```

**Specialist LESSONS.md locations:**
| Specialist | Path |
|-----------|------|
| Map Rendering Expert | `companies/dirtsync/agents/map-rendering-expert/LESSONS.md` |
| Nav HUD Polish Expert | `companies/dirtsync/agents/nav-hud-polish-expert/LESSONS.md` |
| Explore UX Expert | `companies/dirtsync/agents/explore-ux-expert/LESSONS.md` |

These lessons contain hard-won domain knowledge from previous failures. If the specialist learned "MapLibre silently drops layers added before didFinishLoadingStyle" — you need to know that BEFORE writing code, not after 5 failed iterations.

**If no routing comment exists or you ARE the recommended specialist:** skip this step.

---

## Step 0.5: Search Knowledge Base

Before reading the issue, check if prior knowledge exists for the problem area.

**NOTE:** Knowledge may already be auto-injected as a "Required Reading" comment on the issue. Read the issue comments FIRST — if a Knowledge Bot comment exists, that's your pre-loaded context. Only search manually if you need additional entries.
```bash
# Search by tags relevant to your issue (adjust tags for your domain)
curl -s "$SUPA_URL/rest/v1/knowledge?tags=cs.{RELEVANT_TAG}&confidence=neq.disproven&select=title,body,tags,confidence" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge" | python3 -m json.tool
```

Common tags: `maplibre`, `poi`, `trail-detection`, `hud`, `ride-recording`, `zoom`, `simulator`, `xcodebuild`, `supabase`, `gpx`

If results come back:
- **Read them.** Apply proven knowledge before attempting your own fix.
- **If a prior attempt is marked `disproven`, do NOT repeat it.**

If no results: proceed normally. Your work will become knowledge for the next agent.

**Post to issue:** "## Step 0.5: Knowledge search\n- Tags searched: [tags]\n- Relevant entries found: [count]\n- Key insight applied: [summary or 'none']"

---

## Step 0.75: Environment Pre-Flight

**BEFORE writing any code or test**, confirm your test environment matches what the user actually sees. Post this checklist to the issue:

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

**Rules:**
- If the issue involves labels, text, or symbols: verify the style JSON has a `glyphs` URL
- If the issue involves map rendering: test on SATELLITE (the actual user default), not offline
- If the issue involves location/GPS: use GPX test track, not static screenshots
- If you don't know what environment the user sees: **ASK, don't guess**

**If any pre-flight item is wrong (missing glyphs, stale branch, wrong basemap), fix it BEFORE writing the test.**

---

## Step 1: Read the Forge Issue

Fetch your assigned issue:
```bash
curl -s "$SUPA_URL/rest/v1/issues?id=eq.<ISSUE_ID>&select=*" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge" | python3 -m json.tool
```

Read:
- `title` — what to do
- `description` — full spec with root cause and file paths
- `acceptance_criteria` — THESE are your checkboxes. Every one must be true.
- `verify_command` — the test you must pass
- `skills` — other skills to load
- `branch_name` — the branch to work on

**Post to issue:** "## Step 1: Reading issue. Acceptance criteria: [list them]"

---

## Step 2: Mark In Progress + Tag Issue

```bash
curl -s "$SUPA_URL/rest/v1/issues?id=eq.<ISSUE_ID>" -X PATCH \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{"status":"in_progress"}'
```

**Tag the issue** for knowledge base indexing. Extract 2-5 tags from the title and description:
```bash
curl -s "$SUPA_URL/rest/v1/issues?id=eq.<ISSUE_ID>" -X PATCH \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{"tags":["<tag1>","<tag2>","<tag3>"]}'
```
Common tags: `maplibre`, `poi`, `trail-detection`, `hud`, `ride-recording`, `breadcrumb`, `zoom`, `difficulty`, `controls`, `search-bar`, `navigation`

---

## Step 3: Create Branch

```bash
git fetch origin master
git checkout -b <branch_name> origin/master
```

**CRITICAL: Check for unmerged approved PRs.** If COO has approved prior bug PRs that haven't been merged to master yet, your branch will be missing those fixes. Check with COO or run:
```bash
gh pr list --state open --label approved --limit 10
```
If any exist, ask COO to merge them first — otherwise your build will regress fixed bugs.

**Post to issue:** "## Step 3: Branch `<branch_name>` created from origin/master at $(git rev-parse --short HEAD)."

---

## Step 4: Explore the Code

Read the file(s) mentioned in the issue description. Understand the current behavior before changing anything.

**Post to issue:** "## Step 4: Code exploration\n- Read [files]\n- Current behavior: [what it does now]\n- Root cause confirmed: [yes/no + explanation]"

---

## Step 4.5: REPRODUCE THE BUG — RED (mandatory for visual/HUD/map bugs)

**You MUST prove the bug exists on current master BEFORE writing any fix.**

1. Build current master (no changes yet)
2. Run on simulator with Steve's real GPX if available (check `DirtSync/DirtSyncUITests/GPXRoutes/`)
3. Screenshot the EXACT failure moment — the frame where the bug is visible
4. Upload as **"fail"** category attachment

```bash
xcrun simctl io $SIM screenshot qa-screenshots/<issue-slug>-RED-before-fix.png
```

**If you CANNOT reproduce the bug:** STOP. Post "BLOCKED: Cannot reproduce on master" and wait for COO.

**WHY:** If you never see the bug, you can't know your fix addresses it. TDD rule: you must see RED before GREEN. This is the visual equivalent.

**Post to issue:** "## Step 4.5: Bug reproduced (RED)\n- Screenshot: [filename] — shows [what's wrong]\n- GPS point: [coordinates or GPX point number]\n- This is the baseline. My fix must make THIS specific frame correct."

---

## Step 4.75: Write the Failing Test FIRST (TDD — mandatory)

**Before writing ANY fix code, write a test that defines what "fixed" means.**

1. Write a test that asserts the CORRECT behavior (the behavior that doesn't exist yet)
2. Run it — it MUST FAIL (RED)
3. If it passes, your test is wrong — it's not testing the bug. Fix the test.
4. Post the test name and the failure message to the issue

```bash
# Example: run just your new test
xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 16 Pro" \
  -only-testing:DirtSyncTests/YourNewTestClass/testYourNewTest 2>&1 | tail -10
```

**The test is the contract.** It says "when THIS input happens, THIS output is expected." Your fix in Step 5 must make this test pass — nothing more, nothing less.

**CRITICAL: Test RENDERING, not configuration.** For ANY visual feature (labels, colors, markers, layout, visibility), your test MUST be an XCUITest that:
1. Launches the app
2. Navigates to the relevant screen
3. Asserts the element is ACTUALLY VISIBLE on screen

```swift
// WRONG — tests config, passes even when cleanup hides the label:
XCTAssertEqual(labelsLayer.minimumZoomLevel, 10) // ✅ but USELESS

// RIGHT — tests what the user actually sees:
let app = XCUIApplication()
app.launch()
// zoom to level 10
XCTAssert(app.staticTexts["Burning Rock"].waitForExistence(timeout: 10)) // Actually visible?
```

Unit tests that check property values (zoom level, color, font size) DO NOT prove the user can see the feature. A cleanup pass, a z-order issue, an opacity override, or a layout bug can hide it. **If the user sees it, the test must see it. If the test only checks config, it proves nothing.**

**When to use which test type:**
- **XCUITest (required):** anything visible — labels, markers, buttons, banners, HUD elements, colors
- **Unit test (supplemental):** logic — trail detection distance, hysteresis timing, ride recording state
- **Both:** most features need both. The unit test proves the logic. The XCUITest proves the user sees the result.

**If you can't write an XCUITest:** Explain specifically WHY (e.g., "requires GPS simulation that XCUITest can't trigger"). The COO will decide if Step 8.5 visual critic is sufficient. "It's hard" is not a valid reason.

**Post to issue:** "## Step 4.75: Failing test written (RED)\n- Test: [TestClass/testName]\n- Assertion: [what it checks]\n- Result: FAIL — [failure message]\n- This test defines done. Step 5 fix must make it pass."

---

## Step 5: Make the Fix

Edit the code. Keep changes minimal — only fix what the issue describes.

**Post to issue:** "## Step 5: Changes made\n- [file:line] — [what changed and why]\n- [file:line] — [what changed and why]"

---

## Step 6: Build

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync
xcodebuild build -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 16 Pro" 2>&1 | tail -5
```

**If build FAILS:** Fix the error. Do not continue until build passes.

**Post to issue:** "## Step 6: Build\n- Status: PASS / FAIL\n- Errors: [if any]"

---

## Step 6.5: Run Your Failing Test — It Must Now PASS (GREEN)

Run the test you wrote in Step 4.75:
```bash
xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 16 Pro" \
  -only-testing:DirtSyncTests/YourNewTestClass/testYourNewTest 2>&1 | tail -10
```

- **PASS** → your fix works. Continue to Step 7.
- **FAIL** → your fix is wrong. Go back to Step 5. Do NOT continue.

Also run the full test suite to check for regressions:
```bash
xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 16 Pro" 2>&1 | tail -20
```

**If ANY existing test fails:** Fix it before continuing. Your fix must not break anything else.

**Post to issue:** "## Step 6.5: Test verification (GREEN)\n- [TestName]: was RED in Step 4.75, now PASS\n- Full suite: X/X pass, 0 failures"

---

## Step 7: Run on Simulator

```bash
SIM=$(xcrun simctl list devices | grep "iPhone 16 Pro" | grep -v Max | head -1 | grep -oE '[A-F0-9-]{36}')
xcrun simctl boot $SIM 2>/dev/null
xcrun simctl install $SIM /Users/stevemcmillian/Library/Developer/Xcode/DerivedData/DirtSync-*/Build/Products/Debug-iphonesimulator/DirtSync.app
xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting
```

Play GPX if needed:
```bash
xcrun simctl location $SIM start-simulation /path/to/gpx-file.gpx
```

---

## Step 8: Take Screenshots + UPLOAD to Forge Issue

For EACH acceptance criterion that involves visual proof:

```bash
xcrun simctl io $SIM screenshot qa-screenshots/<issue-slug>-<criterion>.png
```

**READ the screenshot yourself.** Does it prove the criterion?
- YES → continue to Step 8.5
- NO → go back to Step 5 and fix

---

## Step 8.5: VISUAL CRITIC — Independent Verification (mandatory for visual/HUD/map bugs)

**You CANNOT grade your own visual work.** Confirmation bias means you see what you expect.

Compare your Step 4.5 RED screenshot (before fix) against your Step 8 GREEN screenshot (after fix):

1. **Same GPS point, same zoom level, same scenario.** The ONLY difference should be the fix.
2. For EACH acceptance criterion, answer honestly:
   - RED screenshot: does it show the bug? [YES/NO]
   - GREEN screenshot: does it show the bug fixed? [YES/NO]
   - Is the beacon position consistent with the HUD name? [YES/NO]
   - Would a stranger looking at the GREEN screenshot say this is correct? [YES/NO]

**HARD RULES for the critic check:**
- If the HUD says a trail name, the beacon MUST be visually on or very near that trail's line on the map
- If the HUD says "Off-trail", the beacon MUST be visually away from all trail lines
- If the HUD says a road name, the beacon MUST be visually on a road
- If ANY of these don't match → the fix is WRONG → go back to Step 5
- "Close enough" is NOT a pass. Either the visual matches or it doesn't.

**Post to issue:**
```
## Step 8.5: Visual Critic
- RED (before): [filename] — bug visible: [YES/NO + what's wrong]
- GREEN (after): [filename] — bug fixed: [YES/NO + what's correct]
- Beacon position matches HUD name: [YES/NO]
- Stranger test: would someone with no context say this looks right? [YES/NO]
- Verdict: PASS / FAIL
```

**If verdict is FAIL:** Go back to Step 5. Do NOT proceed. Do NOT rationalize.

**UPLOAD each screenshot to the Forge issue as an attachment:**
```bash
SCREENSHOT_PATH="qa-screenshots/<issue-slug>-<criterion>.png"
FILENAME=$(basename "$SCREENSHOT_PATH")
STORAGE_PATH="task-attachments/$(date +%s)-${RANDOM}.png"

# Upload to Supabase Storage
curl -s "$SUPA_URL/storage/v1/object/artifacts/$STORAGE_PATH" \
  -X POST \
  -H "apikey: $SUPA_KEY" \
  -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: image/png" \
  --data-binary @"$SCREENSHOT_PATH"

# Create attachment record
curl -s "$SUPA_URL/rest/v1/issue_attachments" \
  -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d "{\"issue_id\":\"<ISSUE_ID>\", \"filename\":\"$FILENAME\", \"mime_type\":\"image/png\", \"storage_path\":\"$STORAGE_PATH\", \"category\":\"testing\"}"
```

**Post to issue:** "## Step 8: Screenshots uploaded\n- [filename]: Shows [what]. Proves [which criterion]. UPLOADED to issue attachments.\n- [filename]: Shows [what]. Proves [which criterion]. UPLOADED to issue attachments."

**If upload fails:** Post the local path as fallback, but NOTE that upload failed. COO will verify from local.

---

## Step 9: Record Video + UPLOAD to Forge Issue

```bash
xcrun simctl io $SIM recordVideo qa-screenshots/<issue-slug>-proof.mp4 &
REC_PID=$!
# Wait for the scenario to play (30-60 seconds)
sleep 60
kill $REC_PID
```

**UPLOAD the video to the Forge issue:**
```bash
VIDEO_PATH="qa-screenshots/<issue-slug>-proof.mp4"
FILENAME=$(basename "$VIDEO_PATH")
STORAGE_PATH="task-attachments/$(date +%s)-${RANDOM}.mp4"

curl -s "$SUPA_URL/storage/v1/object/artifacts/$STORAGE_PATH" \
  -X POST \
  -H "apikey: $SUPA_KEY" \
  -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: video/mp4" \
  --data-binary @"$VIDEO_PATH"

curl -s "$SUPA_URL/rest/v1/issue_attachments" \
  -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d "{\"issue_id\":\"<ISSUE_ID>\", \"filename\":\"$FILENAME\", \"mime_type\":\"video/mp4\", \"storage_path\":\"$STORAGE_PATH\", \"category\":\"testing\"}"
```

**Post to issue:** "## Step 9: Video recorded\n- Path: [path]\n- Shows: [what the video proves]"

---

## Step 10: Run Verify Command

If the issue has a `verify_command`, run it:
```bash
<paste verify_command from issue>
```

**If verify FAILS:** Go back to Step 5. Do NOT continue.

**Post to issue:** "## Step 10: Verify\n- Command: [command]\n- Result: PASS / FAIL\n- Output: [relevant lines]"

---

## Step 11: Check Every Acceptance Criterion + Mark Verified

Go through EACH criterion from Step 1. For each one:
- Is it met? YES / NO
- What proves it? [screenshot filename or test output]

**If ANY criterion is NO:** Go back to Step 5.

**CRITICAL: Update the database.** Mark each verified criterion:
```bash
# Fetch current criteria
CRITERIA=$(curl -s "$SUPA_URL/rest/v1/issues?id=eq.<ISSUE_ID>&select=acceptance_criteria" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge" | python3 -c "import sys,json; print(json.dumps(json.loads(sys.stdin.read())[0]['acceptance_criteria']))")

# Mark all as verified
UPDATED=$(echo "$CRITERIA" | python3 -c "
import sys, json
criteria = json.loads(sys.stdin.read())
for c in criteria:
    c['verified'] = True
print(json.dumps(criteria))
")

# PATCH back to the issue
curl -s "$SUPA_URL/rest/v1/issues?id=eq.<ISSUE_ID>" -X PATCH \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d "{\"acceptance_criteria\": $UPDATED}"
```

**Post to issue:**
```
## Step 11: Acceptance Criteria — ALL VERIFIED
- [x] Criterion 1 — proved by screenshot-1.png
- [x] Criterion 2 — proved by test output PASS
- [x] Criterion 3 — proved by video showing behavior
- [ ] Criterion 4 — NOT MET: [reason]
```

---

## Step 12: Commit

```bash
git add -A
git commit -m "fix: <issue-title>"
```

**Post to issue:** "## Step 12: Committed [hash]"

---

## Step 13: Push and PR

```bash
git push -u origin <branch_name>
gh pr create --title "<issue-title>" --body "Fixes Forge issue <ISSUE_ID>. See issue comments for full proof."
```

**Post to issue:** "## Step 13: PR #[number] created\n- Branch: [branch]\n- Commit: [hash]"

---

## Step 14: Mark In Review

```bash
curl -s "$SUPA_URL/rest/v1/issues?id=eq.<ISSUE_ID>" -X PATCH \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{"status":"in_review"}'
```

---

## Step 15: STOP

Do NOT start the next issue. Wait for COO review.

The COO will:
- Read your issue comments
- Look at your screenshots
- Check the test results
- **Post a review comment** to the issue (approve or reject with reasoning)
- **Log a review event:**
```bash
curl -s "$SUPA_URL/rest/v1/issue_events" -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{"issue_id":"<ISSUE_ID>","event_type":"review_approved","actor_type":"user","actor_id":"steve","metadata":{"pr_merged":true,"pr_number":"<PR#>"}}'
```
- **Merge your PR to master** (so the next issue builds on your work)
- Mark the issue `done` if approved, or `todo` with feedback if rejected

**WHY THIS MATTERS:** If COO approves but forgets to merge, the next bug branch won't include your fix. The bug will reappear in the next build. This has happened before — BUG-5 was approved but not merged, causing duplicate controls to reappear.

---

## Step 15.5: Propose Skill + Knowledge Improvements (SELF-IMPROVING)

Before you stop, reflect: **did you hit any obstacle NOT covered by the skill or knowledge base?**

If YES — post a skill improvement proposal to the issue:
```
## Step 15.5: Skill Improvement Proposal

### Obstacle encountered
[What went wrong that the skill/KB didn't prepare you for]

### What I did to solve it
[The workaround or fix you discovered]

### Proposed skill change
[Exact step or rule that should be added/modified in dirtsync-issue-to-ship.md]

### Proposed knowledge entry
- Title: [short, searchable]
- Tags: [2-5 tags]
- Confidence: proven | suspected
- Body: [root cause + what worked + what didn't]
```

If NO obstacles — post: "## Step 15.5: No skill gaps encountered."

**WHY:** Every obstacle you overcome makes the next agent smarter. The COO reviews your proposal and either patches the skill or files it as knowledge. This is how the factory learns.

---

## Rules (HARD)

1. Every step must post to the Forge issue. No exceptions.
2. Never skip a step. The order matters.
3. Never claim done without running the verify command.
4. Never claim done without screenshots proving every acceptance criterion.
5. One issue at a time. Finish it or stop.
6. If you're stuck, post "BLOCKED: [reason]" to the issue and STOP.
7. NEVER include API keys, tokens, passwords, or credentials in issue comments, knowledge entries, or attachments. If you encounter a secret, reference it by env var name only (e.g., "$SUPA_KEY").
8. Video proof is REQUIRED for all location/HUD/map features. Screenshots alone are not sufficient — the field test is the final gate.
