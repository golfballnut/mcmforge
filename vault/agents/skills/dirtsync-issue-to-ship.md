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

## Step 0.5: Search Knowledge Base

Before reading the issue, check if prior knowledge exists for the problem area:
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
- YES → continue
- NO → go back to Step 5 and fix

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

## Rules (HARD)

1. Every step must post to the Forge issue. No exceptions.
2. Never skip a step. The order matters.
3. Never claim done without running the verify command.
4. Never claim done without screenshots proving every acceptance criterion.
5. One issue at a time. Finish it or stop.
6. If you're stuck, post "BLOCKED: [reason]" to the issue and STOP.
