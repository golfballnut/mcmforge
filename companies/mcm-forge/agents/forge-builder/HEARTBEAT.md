# Heartbeat Protocol — Forge Builder

Execute this EVERY time you wake up. No exceptions.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons relevant to the current issue (cookie bugs, adapter mismatches, Supabase client gotchas).
3. If a past lesson with `Outcome: worked` matches, try that approach first.

See `vault/agents/skills/lessons-learned-loop.md`.

## Step 1: Check Inbox
```bash
curl -s "$FORGE_API_URL/api/agent/me/inbox" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```
If `FORGE_ISSUE_ID` is set, prioritize that issue. Otherwise work the inbox.
Priority: `in_progress` first, then `todo`. Skip `blocked`.

**If inbox is empty:** Post "[SILENT] No work in inbox." and exit immediately. Do not burn turns.

**After picking an issue, post [START] BEFORE touching any code:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[START] FORGE-N: <what I understood>. Plan: <file list + approach>. Est: <time>.", "tags": ["START"]}'
```

## Step 2: Read Issue Context
```bash
curl -s "$FORGE_API_URL/api/agent/issues/{issueId}/context" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```
Read the full issue description, acceptance criteria, and any comments from the COO.

## Step 2.5: Check for Recent Rejection (MANDATORY)

After reading context, scan the last 5 comments for a rejection from COO or CEO **posted after my last [PROOF] comment**.

**Rejection signals to look for:**
- `[COO]` or `[CEO]` prefix with any of: `rejected`, `Not approving`, `[GATE-FAILED]`, `retry`, explicit remediation instructions

**If a rejection is found that postdates my last [PROOF]:**

1. This is a **retry wake** — do NOT start fresh. The code is already written.
2. Post [START] acknowledging the rejection:
   ```bash
   curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
     -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
     -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
     -H "Content-Type: application/json" \
     -d '{"body": "[START] Retry per [COO] rejection at <timestamp>. Remediation: <what they asked for>. Skipping to Step 7."}'
   ```
3. **Skip Steps 3–6 entirely.** Jump directly to Step 7.
4. In Step 7, follow the rejection's specific remediation (e.g. upload the correct artifact type, re-run the right test suite, fix the specific issue flagged).

**Escalation guardrail — max 1 retry per wake:**

If the COO/CEO's comment itself is a *second* rejection (i.e., I can see a prior retry [START] in the comments and the rejection postdates it), do NOT retry again. Instead:

```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[ESCALATE] @ceo: Two consecutive [PROOF] rejections on this issue. I cannot resolve this autonomously. Please review and advise before next Builder run."}'
```
Then exit. Do not retry a third time.

**If no rejection is found:** continue to Step 3 as normal.

## Step 3: Checkout Issue
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/checkout" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID"
```
If 409 Conflict: someone else has it. Pick next issue or exit.

**After successful checkout, post [PROGRESS]:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROGRESS] Checked out. Reading code now.", "tags": ["PROGRESS"]}'
```

## Step 4: Read Existing Code
Before writing ANY code, read the files you're about to change. Understand the current state. This is non-negotiable.

## Step 5: Implement
- Create feature branch: `git checkout -b agent/<issue-slug>`
- Make changes following existing patterns
- Keep changes minimal and focused
- If the task is unclear, comment asking for clarification and EXIT

**After each major change (or if stuck >2 min), post [PROGRESS] or [BLOCKED]:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROGRESS] <what just changed>. Next: <what is next>.", "tags": ["PROGRESS"]}'
```

## Step 6: Verify Build

Determine which sub-projects your branch touches, then verify each one:

```bash
CHANGED=$(git diff --name-only main...HEAD)
echo "$CHANGED" | grep -q '^forge-orchestrator/' && ORCH=1 || ORCH=0
echo "$CHANGED" | grep -q '^dashboard/'          && DASH=1 || DASH=0

# Orchestrator: typecheck + tests
[ "$ORCH" = "1" ] && cd ~/MCMForge/forge-orchestrator && npx tsc --noEmit && npx vitest run

# Dashboard: full build
[ "$DASH" = "1" ] && cd ~/MCMForge/dashboard && npx next build
```

If any check fails, fix it before committing. Never commit broken code.

**After verification passes, post [PROGRESS]:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROGRESS] Verification passes. Committing and pushing.", "tags": ["PROGRESS"]}'
```

## Step 7: Commit, Push, PR

**BEFORE `gh pr create`, post [PROOF] with concrete artifacts that prove what the PR ships.**

Rule 2 (`agent-comment-protocol.md`): any `[PROOF]` comment requires ≥1 artifact uploaded by you on this issue in the prior 10 minutes, OR the bundled API returns `422 PROOF_WITHOUT_ATTACHMENT`.

### 7a. Choose and capture the right artifact(s)

```bash
CHANGED=$(git diff --name-only main...HEAD)
TS=$(date +%s)
ISSUE_ID="{issueId}"

upload_artifact() {
  local FILE="$1" FILENAME="$2"
  local STORAGE_PATH="agent-proof/$ISSUE_ID/$FILENAME"
  local SIZE
  SIZE=$(wc -c < "$FILE")
  # Upload to storage
  curl -sS -X POST "$SUPABASE_URL/storage/v1/object/artifacts/$STORAGE_PATH" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: text/plain" \
    --data-binary @"$FILE"
  # Insert issue_attachments row (satisfies Rule 2)
  curl -sS -X POST "$SUPABASE_URL/rest/v1/issue_attachments" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Accept-Profile: forge" \
    -H "Content-Profile: forge" \
    -H "Content-Type: application/json" \
    -d "{\"issue_id\":\"$ISSUE_ID\",\"uploaded_by_agent_id\":\"$FORGE_AGENT_ID\",\"filename\":\"$FILENAME\",\"mime_type\":\"text/plain\",\"size_bytes\":$SIZE,\"storage_path\":\"$STORAGE_PATH\",\"category\":\"agent_proof\"}"
}

# Orchestrator changes → vitest output
if echo "$CHANGED" | grep -q '^forge-orchestrator/'; then
  cd ~/MCMForge/forge-orchestrator
  npx vitest run 2>&1 | tail -40 > /tmp/forge-proof-artifact.txt
  upload_artifact /tmp/forge-proof-artifact.txt "orchestrator-vitest-tail-$TS.txt"
fi

# Dashboard changes → next build output
if echo "$CHANGED" | grep -q '^dashboard/'; then
  cd ~/MCMForge/dashboard
  npx next build 2>&1 | tail -20 > /tmp/forge-proof-artifact.txt
  upload_artifact /tmp/forge-proof-artifact.txt "dashboard-build-tail-$TS.txt"
fi
```

### 7b. Post [PROOF] — after upload(s)

```bash
curl -sS -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROOF] <what artifact proves, e.g. 63/63 orchestrator tests pass OR dashboard build passes>. Branch: agent/<slug>. PR title: feat(FORGE-N): ..."}'
```

### 7c. Commit and push

```bash
git add <specific-files>
git commit -m "feat(FORGE-X): description"
git push -u origin agent/<issue-slug>
gh pr create --title "feat(FORGE-X): ..." --body "## Summary\n- What changed\n- Why\n\n## Test plan\n- Build passes\n- [criteria from issue]"
```

## Step 8: Report Results
```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/issues/{issueId}" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_review",
    "comment": "PR open. Branch: agent/[slug]. PR #[number]. Build passes. Awaiting COO review. [any notes]."
  }'
```

## Step 9: Post [DONE] and Append Lessons Learned (MANDATORY — before exit)

**Post [DONE] as your last action:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[DONE] FORGE-N: <what shipped>. Branch: agent/<slug>. PR #<N>. ~$<cost> / <time>. Awaiting COO review.", "tags": ["DONE"]}'
```

## Step 10: Append Lessons Learned

For every **non-trivial bug** you hit this run (build failures, cookie races, Supabase schema issues, adapter mismatches), append one entry to the TOP of `companies/mcm-forge/agents/forge-builder/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit with your work.

## Rules
- Never push to main directly
- Never modify files outside the scope of your issue
- If something is broken that's NOT your issue, report it but don't fix it
- Post a comment before every exit — the COO reads your comments
- If inbox is empty, exit immediately with [SILENT] marker
