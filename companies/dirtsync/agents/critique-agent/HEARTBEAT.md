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

## 5. Deliver Verdict

**If 10/10 (APPROVED):**
```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Critique Report\n\n**Grade: 10/10 — APPROVED**\n\n<full report>\n\n**Social Media Test:** YES\n**Verdict:** Ship it.",
  "status": "approved"
}
```

**If <10 (REJECTED):**
```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Critique Report\n\n**Grade: X/10 — REJECTED**\n\n<full report with fix list>\n\n**Social Media Test:** NO — <reason>\n**Verdict:** Fix and resubmit.",
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
