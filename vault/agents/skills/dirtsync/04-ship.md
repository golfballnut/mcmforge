# Phase 4: Ship

**Verify, commit safely, PR, mark for review.**

---

## Step 10: Run Verify Command

If the issue has a `verify_command`, run it:
```bash
<paste verify_command from issue>
```

- **PASS** → continue
- **FAIL** → back to Phase 2, Step 5

**Track:** `step_10: {done: true, verify: "pass" or "no_command"}`

---

## Step 11: Check Every Acceptance Criterion

Go through EACH criterion from Step 1. For each:
- Is it met? YES / NO
- What proves it? (screenshot, test output, video)

**If ANY criterion is NO:** Back to Phase 2.

**Update the database:**
```bash
CRITERIA=$(curl -s "$SUPA_URL/rest/v1/issues?id=eq.$ISSUE_ID&select=acceptance_criteria" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" -H "Accept-Profile: forge" \
  | python3 -c "import sys,json; print(json.dumps(json.loads(sys.stdin.read())[0]['acceptance_criteria']))")

UPDATED=$(echo "$CRITERIA" | python3 -c "
import sys, json
criteria = json.loads(sys.stdin.read())
for c in criteria:
    c['verified'] = True
print(json.dumps(criteria))
")

curl -s "$SUPA_URL/rest/v1/issues?id=eq.$ISSUE_ID" -X PATCH \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d "{\"acceptance_criteria\": $UPDATED}"
```

**Post to issue:**
```
Step 11: Acceptance Criteria — ALL VERIFIED
- [x] Criterion 1 — proved by screenshot-1.png
- [x] Criterion 2 — proved by test output PASS
- [x] Criterion 3 — proved by video
```

**Track:** `step_11: {done: true, all_verified: true}`

---

## Step 12: Commit (safe)

**NEVER use `git add -A` or `git add .`** — add ONLY the files you changed:

```bash
git add <file1.swift> <file2.swift> <testfile.swift>
git diff --cached --stat  # Verify ONLY your files are staged
```

**Check for secrets before committing:**
```bash
git diff --cached | grep -iE "api.key|token|password|secret|Bearer" && echo "STOP: secret in diff" || echo "Clean"
```

```bash
git commit -m "fix: <issue-title>"
```

**Post to issue:** "Step 12: Committed [sha] — files: [list]"

**Track:** `step_12: {done: true, commit_sha: "abc123", files: ["a.swift", "b.swift"]}`

---

## Step 13: Push + PR

```bash
git push -u origin agent/<issue-slug>
gh pr create --title "<issue-title>" --body "Fixes Forge issue $ISSUE_ID. See issue comments for full proof."
```

**Post to issue:** "Step 13: PR #[number] — branch: [name], commit: [sha]"

**Track:** `step_13: {done: true, pr_number: N}`

---

## Step 14: Mark In Review

```bash
curl -s "$SUPA_URL/rest/v1/issues?id=eq.$ISSUE_ID" -X PATCH \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d '{"status":"in_review","pr_url":"https://github.com/golfballnut/DirtSync/pull/NUMBER"}'
```

**Track:** `step_14: {done: true}`

---

**Phase 4 complete. Load `05-post-ship.md`.**
