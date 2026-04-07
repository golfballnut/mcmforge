# HEARTBEAT.md — DirtSync Critique Agent

Run this on every wake. You are the quality wall.

## 1. Read Assignment
- Read the issue and ALL comments
- Find the Test Runner's results (screenshot path, test counts)
- Find the Gold Star spec for this feature
- Find the Nano Banana mockup if one exists

## 2. Examine the Screenshot
- Look at every UI element systematically, top to bottom
- Compare against the Gold Star spec measurements
- Check for instant-fail conditions (dialogs, debug text, 0mph, missing tiles)

## 3. Measure (if snapshot_ui available)
- Request `snapshot_ui` from Test Runner if measurements needed
- Compare frame dimensions against spec values
- Record actual vs expected for every element

## 4. Grade
- Fill the element-by-element review table
- Calculate total deductions
- Apply the Social Media Test: "Would I post this?"
- Assign final grade

## 5. Tag Drive Folder with Grade

The Test Runner uploaded the screenshot to `QA Iterations/<ISSUE_ID>/v<N>-grade-pending/`.
Rename the folder to include your grade so the fix history is preserved:

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Find the pending version folder
QA_FOLDER="1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X"
ISSUE_ID="<ISSUE_ID>"

# Find issue folder
ISSUE_FOLDER=$(gws drive files list --params "q=name='${ISSUE_ID}' and '${QA_FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false" 2>&1 | grep -v "^Using keyring" | python3 -c "import sys,json; print(json.load(sys.stdin).get('files',[{}])[0].get('id',''))" 2>/dev/null)

# Find the latest grade-pending folder
PENDING=$(gws drive files list --params "q=name contains 'grade-pending' and '${ISSUE_FOLDER}' in parents and trashed=false" 2>&1 | grep -v "^Using keyring" | python3 -c "import sys,json; files=json.load(sys.stdin).get('files',[]); print(files[0]['id'] if files else '')" 2>/dev/null)
PENDING_NAME=$(gws drive files list --params "q=name contains 'grade-pending' and '${ISSUE_FOLDER}' in parents and trashed=false" 2>&1 | grep -v "^Using keyring" | python3 -c "import sys,json; files=json.load(sys.stdin).get('files',[]); print(files[0]['name'] if files else '')" 2>/dev/null)

# Rename: v1-grade-pending → v1-grade-4
GRADE=<GRADE>
NEW_NAME=$(echo "$PENDING_NAME" | sed "s/grade-pending/grade-${GRADE}/")
gws drive files update --file-id "$PENDING" --json "{\"name\": \"${NEW_NAME}\"}" 2>&1 | grep -v "^Using keyring"

# Upload critique report as markdown
cat > /tmp/critique.md << 'CRITIQUE'
<FULL CRITIQUE REPORT HERE>
CRITIQUE
gws drive +upload --file /tmp/critique.md --parent "$PENDING" 2>&1 | grep -v "^Using keyring"

echo "TAGGED: QA Iterations/${ISSUE_ID}/${NEW_NAME}/"
REMOTE
```

**If REJECTED**, also upload the fix list:
```bash
cat > /tmp/fix-list.md << 'FIXES'
# Fixes Required — <ISSUE_ID> v<N>

1. <exact fix with file path and line>
2. <exact fix>
...

## What the Builder changed (for future learning)
- <before>: <what was wrong>
- <after>: <what the fix should be>
FIXES
gws drive +upload --file /tmp/fix-list.md --parent "$PENDING" 2>&1 | grep -v "^Using keyring"
```

## 6. Deliver Verdict

**If 10/10 (APPROVED):**
```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Critique Report\n\n**Grade: 10/10 — APPROVED**\n\n<full report>\n\n**Drive:** QA Iterations/<ISSUE_ID>/v<N>-grade-10/\n**Social Media Test:** YES\n**Verdict:** Ship it.",
  "status": "approved"
}
```

**If <10 (REJECTED):**
```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Critique Report\n\n**Grade: X/10 — REJECTED**\n\n<full report with fix list>\n\n**Drive:** QA Iterations/<ISSUE_ID>/v<N>-grade-X/\n**Social Media Test:** NO — <reason>\n**Verdict:** Fix and resubmit.",
  "status": "todo"
}
```

## 6. Handoff (if APPROVED)
If you graded 10/10, the orchestrator auto-creates a Ship Engineer subtask. 
The Ship Engineer will read your approval comment and create the PR.
You don't need to create the subtask manually — the auto-handoff handles it.

## 7. Rejection Loop (if REJECTED)
When you set status to `todo`, the iOS Builder auto-wakes via the orchestrator's 
`checkAssignedIssues`. It reads your rejection comment (the fix list) and iterates.
The cycle continues: Builder fixes → Test Runner re-tests → you re-grade → until 10/10.

## 8. Exit
Clean exit. Your verdict drives the next step automatically.
