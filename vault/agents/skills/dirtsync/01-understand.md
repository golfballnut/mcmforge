# Phase 1: Understand the Issue

**Complete ALL steps before loading Phase 2. No skipping.**

---

## Step 1: Read the Forge Issue

```bash
curl -s "$SUPA_URL/rest/v1/issues?id=eq.$ISSUE_ID&select=*" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge" | python3 -m json.tool
```

Read and internalize:
- `title` — what to fix
- `description` — full spec with root cause and file paths
- `acceptance_criteria` — THESE are your checkboxes. Every one must be true.
- `verify_command` — the test you must pass
- `tags` — auto-set by the system, tells you the domain

**Post to issue:** "Step 1: Reading issue. Acceptance criteria: [list them]"

**Track:** `step_1: {done: true, criteria_count: N}`

---

## Step 2: Mark In Progress

```bash
curl -s "$SUPA_URL/rest/v1/issues?id=eq.$ISSUE_ID" -X PATCH \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{"status":"in_progress"}'
```

**Tags** are already auto-set by the Knowledge Bot trigger. Do NOT overwrite. If a tag is genuinely missing, append only.

**Track:** `step_2: {done: true}`

---

## Step 3: Create Branch

```bash
git fetch origin master
git checkout -b agent/<issue-slug> origin/master
```

**CRITICAL: Check for unmerged approved PRs:**
```bash
gh pr list --state open --label approved --limit 10
```
If any exist, your branch will miss those fixes. Ask COO to merge them first.

**Post to issue:** "Step 3: Branch `agent/<slug>` from origin/master at [sha]"

**Track:** `step_3: {done: true, branch: "agent/<slug>", base: "sha"}`

---

## Step 4: Explore the Code

Read the file(s) mentioned in the issue description. Understand the current behavior before changing anything.

**Questions to answer:**
1. What does the code currently do?
2. Why is that wrong? (Confirm root cause matches issue description)
3. What files need to change?
4. Are there related files that might break?

**Post to issue:** "Step 4: Code exploration — [files read], root cause confirmed: [yes/no + explanation]"

**Track:** `step_4: {done: true, files_read: ["file1.swift", "file2.swift"], root_cause_confirmed: true}`

---

**Phase 1 complete. Load `02-tdd-loop.md`.**
