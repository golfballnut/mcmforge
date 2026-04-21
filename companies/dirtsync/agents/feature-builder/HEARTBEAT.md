# HEARTBEAT.md — DirtSync Feature Builder

## ⛔ REPRODUCE-FIRST RULE (non-negotiable — ship gate)

**You may not claim a bug is fixed until you can prove the bug existed in your test environment BEFORE your fix.**

1. **Write a failing test (red).** Post the failing output to the issue as a comment.
2. **Only then** write the fix.
3. **Re-run — must pass (green).** Post the passing output.
4. **A test that passes before you touched the code proves NOTHING.** If you can't reproduce the bug, that is a legitimate outcome: post "cannot reproduce in this environment, need [real device / different GPX / etc]" and mark blocked. Steve will take it from there.

**Claim-tracking rule:** Never list prior commits (made before your run's `started_at`) as your deliverables in any comment or summary. Only describe what YOUR run's commits added. If you inherited prior work, describe it as "pre-existing" or "inherited from <branch>".

**Idle-loop rule:** Once your work is shipped to a PR or you mark the issue `in_review`, EXIT immediately. Do not keep polling for new work. Do not post "nothing to do, waiting for Steve" comments. One final status comment and then exit — every idle comment costs tokens and wastes Steve's attention.

**Visual bug rule (map rendering, HUD, colors, layout):** Simulator green ≠ device green. If the bug was reported from a real device screenshot/video and you can't reproduce it in the simulator, your fix is unvalidated. Document that explicitly — do NOT claim "fixed" based on a simulator test that already passed before your change.

## Step 0 — Read Your Lessons (MANDATORY — before anything else)

Before Delegation, before the Startup Sequence, before touching any code:

1. Read `LESSONS.md` in your own agent directory (`companies/dirtsync/agents/feature-builder/LESSONS.md`).
2. If the file does not exist, create it with this header:

   ```
   # Lessons Learned — Feature Builder

   Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

   ---
   ```

3. Scan for entries relevant to the current issue (match by tag, title keywords, or file path).
4. For any matching entry with `Outcome: worked`, try that fix FIRST before inventing a new approach. Do not waste a strike re-learning what the factory already paid for.
5. For any entry with `Outcome: didn't work`, do not repeat that approach.

**Why:** Every restart, you start cold. Your LESSONS.md is the only thing that persists across restarts. The Anvil Loop breaks if you skip this step. See `vault/agents/skills/lessons-learned-loop.md`.

## Delegation Decision (FIRST — before anything else)

You are now the COORDINATOR for the DirtSync specialist team. Before you pick up a build yourself, check if the issue belongs to a specialist:

| If the issue is about... | Delegate to | Agent ID |
|---|---|---|
| Black basemap, MBTiles, style URLs, offline tiles, map not loading | **Map Rendering Expert** | `fce43183-9464-47d5-8724-c7d4866d7074` |
| Turn card colors, urgency thresholds, speed badge, ETA bar, GPS spikes, trail name header | **Nav HUD Polish Expert** | `e4ac3b5f-661f-45ab-bfbd-6172048db494` |
| Trail labels, difficulty colors, POI markers in explore, trail tap, browse sheet | **Explore UX Expert** | `2c21ddb8-0202-4450-8a1d-14859883a90e` |

**How to delegate:** re-assign the issue to the specialist via Forge API:
```
PATCH /api/agent/issues/:id
{ "assignee_agent_id": "<specialist-id>", "comment": "Delegating to <specialist name> — this is in their domain. Scope: <specific files>. Acceptance: <test slice>." }
```

Then requeue the run against the new assignee. The specialist takes it from there.

**You handle it yourself when:**
- The issue crosses multiple specialist boundaries (e.g. basemap fix AND nav HUD tweak)
- The fix is small (<20 lines) and a specialist hand-off would be overkill
- No specialist's scope matches (genuinely new territory)

**NEVER delegate silently** — always post a comment explaining why. The COO reads these.

## Startup Sequence

1. Read the assigned issue from Forge API: `GET /api/agent/me/inbox`
2. **Run the Delegation Decision above.** If it's a specialist's domain, delegate and exit. Otherwise continue.
3. Read full issue context: `GET /api/agent/issues/:id/context`
4. Parse: acceptance criteria, test class, target files, Gold Star spec
4. SSH to Mini, verify connectivity
5. Fetch the latest code on Mini:
   ```bash
   ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && git checkout -- . && git fetch origin && git reset --hard origin/master'
   ```
6. Create feature branch:
   ```bash
   ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && git checkout -b agent/<issue-slug>'
   ```
7. Apply Ferrostar patch (MANDATORY — see TOOLS.md)
8. Boot simulator:
   ```bash
   ssh dirtsyncmini@100.125.184.57 'xcrun simctl boot 1C53DE6B-2574-43FF-BF29-C1C5ACF5A526 2>/dev/null; echo "Simulator ready"'
   ```

## PLAN FIRST (MANDATORY before any code changes)

After reading the issue and all comments, BEFORE writing any code:

### 1. Read current state
SSH to Mini, read every target file. Understand what exists today.

### 2. Write a plan
```
## Build Plan — DIRA-<N>

**What Steve wants:** <1 sentence from the issue/comments>

**Files I will modify:**
| File | Change | Why |
|------|--------|-----|
| TurnCardView.swift | Add glassmorphism background | Steve's 8→10 feedback |
| MapOverlayStack.swift | Add recenter button | Steve requested |

**Approach:** <how you'll implement this, in order>

**Risk:** <what could go wrong>

**Estimated iterations:** <1-3 for polish, 3-5 for new features>
```

### 3. Post the plan to the issue
```
PATCH /api/agent/issues/:id
{ "comment": "<your build plan>" }
```

### 4. Then start the inner loop
Do NOT skip the plan. Steve and the COO read these to verify approach before you burn turns.

---

## BAIL-OUT RULES (check BEFORE every step)

**Stop immediately and post to the issue if:**
- SSH to Mini fails 2x → post "Mini unreachable" → mark blocked
- Permission denied on any tool → post what you need → mark blocked
- Build fails with the SAME error after 2 fix attempts → post the error → mark blocked
- Missing file/tool that you cannot create → post what's missing → mark blocked
- You don't understand the spec → post questions → mark blocked

**DO NOT burn turns retrying something that's fundamentally broken. Ask for help.**

**When hitting a bail-out condition, post [BLOCKED] with options:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[BLOCKED] <what I tried>. Error: <exact message>. Options: (A) ..., (B) ...", "tags": ["BLOCKED"]}'
```

## Progress Posts (after EVERY iteration)

After each iteration, post a [PROGRESS] update:
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROGRESS] Iteration <N>/8\nBuild: PASS/FAIL\nTests: X/Y\nGrade: X/10\nNext: <what you will fix>", "tags": ["PROGRESS"]}'
```
This lets us monitor progress in real-time. Do NOT skip this.

## Inner Loop (MAX 8 ITERATIONS)

For iteration = 1 to 8:

### Step 1: Code
SSH to Mini, make changes to the specified files.
- Read the target files first to understand current state
- Make surgical changes — smallest diff that achieves the goal
- If iteration > 1: apply ONLY the fix identified in Step 6 reflection

### Step 2: Build
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild clean build -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" 2>&1 | tail -20'
```
- If **BUILD FAILED**: read the error output, fix the code, go back to Step 1. **This counts as an iteration.**
- If **BUILD SUCCEEDED**: continue to Step 3.

### Step 3: Run Feature Tests (from issue acceptance criteria)

Every issue has an `## Acceptance` block that tells you WHICH tests to run. Example:
```
## Acceptance
Must pass: DirtSyncUITests/GoldStarNavTests/testS2*
Must not break: DirtSyncUITests/GoldStarVisualTests/*
```

Run the **feature tests** first, then the **regression gate**:
```bash
# Feature tests (from the issue's "Must pass" line)
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/GoldStarNavTests/testS2_TurnCard_Present -only-testing:DirtSyncUITests/GoldStarNavTests/testS2_TurnCard_DistanceNotZero 2>&1 | tail -60'

# Regression gate (ALWAYS run — catches breakage)
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/GoldStarVisualTests 2>&1 | tail -40'
```

If the issue has NO acceptance block, run ALL Gold Star tests:
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/GoldStarNavTests -only-testing:DirtSyncUITests/GoldStarVisualTests -only-testing:DirtSyncUITests/GoldStarMapHomeTests 2>&1 | tail -60'
```

### Step 4: Parse Test Results (CRITICAL — this is your feedback loop)

Read the test output carefully. For EACH failed test:

1. **Copy the exact assertion message** — e.g., `XCTAssertTrue failed - S3.1 — Speed badge must be visible during navigation`
2. **Map it to a fix** — the test name tells you the spec item (S3.1 = speed badge), the message tells you what's wrong
3. **Log it in a table:**

| Test | Assertion | Root Cause | Fix |
|------|-----------|------------|-----|
| testS3_SpeedBadge_Present | S3.1 — Speed badge must be visible during navigation | SpeedDisplay hidden by new overlay | MapOverlayStack.swift line 450: move speedBadge above navOverlay |
| testS1_TrailName_NotDuplicated | S1.3 — Trail name duplicated | System name row still showing | WazeNavTopBar.swift: fix shouldShowSystemRow logic |

**DO NOT GUESS.** The test message IS the spec. Fix exactly what failed.

### Step 5: Screenshot (for visual verification + upload)
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
ssh dirtsyncmini@100.125.184.57 "xcrun simctl terminate $SIM app.dirtsync.DirtSync 2>/dev/null; sleep 2"
ssh dirtsyncmini@100.125.184.57 "xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting --uitesting-navigate"
ssh dirtsyncmini@100.125.184.57 "sleep 15"
ssh dirtsyncmini@100.125.184.57 "xcrun simctl io $SIM screenshot ~/screenshot-iteration-{N}.png"
```
Replace `{N}` with iteration number. Upload to Google Drive QA Iterations folder.

### Step 6: Reflect (MANDATORY before retry)

**You MUST answer these 3 questions before going back to Step 1:**

1. **Which tests failed and what was the exact assertion message?**
   Copy-paste from test output. No paraphrasing.

2. **What exact change will fix each failure?**
   Name the file, the line, and the new value. One fix per failed test.

3. **Am I repeating a previous attempt?**
   Review your iteration log. If you are about to try the same fix again, STOP and try a different approach. If you have tried 3 different approaches to fix the same element and all failed, that element may need architectural changes — post to issue and mark BLOCKED.

### Step 7: Decision

**If ALL feature tests pass AND ALL regression tests pass:**
BREAK → go to Ship section below.

**If iteration < 8 and tests are failing:**
Log the iteration result with the test failure table from Step 4. Go back to Step 1 with ONLY the fixes from Step 6.

**If iteration = 8 and tests still failing:**
```
POST failure report to Forge issue:
- All 8 iteration summaries
- Which tests still fail and why
- What worked, what didn't
- Recommended next steps
Mark issue as BLOCKED.
```

## Ship (only after 10/10)

### 1. Commit and push
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && git add -A && git commit -m "<ISSUE>: <description>" && git push -u origin agent/<issue-slug>'
```

### 2. Create PR

**BEFORE `gh pr create`, post [PROOF]:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROOF] Build: PASS. Tests: X/Y pass. Grade: 10/10. Iterations: N/8. Branch: agent/<slug>.", "tags": ["PROOF"]}'
```

```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && gh pr create --base master --title "<ISSUE>: <title>" --body "## Summary
<what changed>

## Test Evidence
- Build: PASS
- Tests: <passed>/<total>
- Iterations: <N>/8
- Grade: 10/10

## Screenshots
See email attachment and Google Drive QA Iterations folder.

## Checklist
- [x] Build passes
- [x] All tests pass
- [x] Screenshot is 10/10 per Gold Star spec
- [x] No regressions
"'
```

### 3. Email screenshot to Steve
```bash
ssh dirtsyncmini@100.125.184.57 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && cd ~ && gws gmail +send --to dirtsyncapp@gmail.com --subject "<ISSUE>: 10/10 — Ready for Review" --body "Feature shipped. <N> iterations. All tests pass. PR created. Screenshot attached." --attach screenshot-iteration-<N>.png'
```

### 4. Upload to Google Drive
```bash
ssh dirtsyncmini@100.125.184.57 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && cd ~ && gws drive +upload --file screenshot-iteration-<N>.png --parent 1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X'
```

### 5. Post results to Forge issue
```
PATCH /api/agent/issues/:id
{
  "status": "in_review",
  "comment": "## Feature Builder Report\n\n**Grade: 10/10**\n**Iterations: <N>/8**\n**PR:** <url>\n\n### Iteration Log\n<summary of each iteration>\n\n### Final Screenshot\nEmailed + uploaded to Drive."
}
```

## Completion

**Post [DONE] as your last action before exit:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[DONE] DIRA-N: <what shipped>. PR: <url>. Grade: 10/10. Iterations: N/8. ~$<cost>.", "tags": ["DONE"]}'
```

Also update status via PATCH:
- Total iterations used
- Final grade
- PR URL (if shipped)
- All screenshot paths

## Final Step — Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you encountered this run, append one entry to the TOP of `companies/dirtsync/agents/feature-builder/LESSONS.md` using this format:

```
## YYYY-MM-DD — <short title of the bug>
**Bug:** <what actually broke — one sentence>
**Attempted fix:** <what you tried — one sentence>
**Outcome:** <worked | didn't work | partial>
**Why:** <root cause if known, "unknown" if not>
**Cost:** $<approximate run cost in USD>
**Tag:** <keyword for grep: ferrostar, maplibre, supabase, xcuitest, etc>
```

**Rules:**
- One entry per non-trivial bug. Trivial bugs (typos, first-try fixes) do not count.
- Newest entries at the TOP of the file.
- Append-only. Never edit or delete older entries.
- Commit the `LESSONS.md` change with the rest of your work on the same branch.
- If you hit no non-trivial bugs this run, write nothing. Empty entries are noise.

**Why:** Factory Analyst reads every agent's LESSONS.md at 7 AM daily to find patterns across the factory. Missing or vague entries = silent failure, and the factory stays dumb. See `vault/agents/skills/lessons-learned-loop.md`.
