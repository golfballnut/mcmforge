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
```bash
cd ~/MCMForge/dashboard && npx next build
```
If build fails, fix it before committing. Never commit broken code.

**After build passes, post [PROGRESS]:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROGRESS] Build passes. Committing and pushing.", "tags": ["PROGRESS"]}'
```

## Step 7: Commit, Push, PR

**BEFORE `gh pr create`, post [PROOF] with concrete artifacts.**

Rule 2 (`agent-comment-protocol.md`): any `[PROOF]` comment requires ≥1 artifact uploaded by you on this issue in the prior 10 minutes, OR the comments API returns `422 PROOF_WITHOUT_ATTACHMENT`. Upload FIRST, then comment.

**Upload path (G2-verified 2026-04-21):** the bundled agent API on `127.0.0.1:3200` does NOT expose `/attachments` — that route is dashboard-only. Agents running on Mini use **direct Supabase REST** to upload storage + insert the `forge.issue_attachments` row. This satisfies Rule 2 because the server checks the `issue_attachments` table, not the endpoint.

```bash
# a) Prepare the build-tail artifact
cd ~/MCMForge/dashboard && npx next build 2>&1 | tail -20 > /tmp/forge-build-tail.txt
FILENAME="build-tail-$(date +%s).txt"
STORAGE_PATH="agent-proof/{issueId}/$FILENAME"

# b) Upload binary to Supabase storage
curl -sS -X POST "$SUPABASE_URL/storage/v1/object/artifacts/$STORAGE_PATH" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/forge-build-tail.txt

# c) Insert forge.issue_attachments row (this is what Rule 2 checks)
SIZE=$(wc -c < /tmp/forge-build-tail.txt)
curl -sS -X POST "$SUPABASE_URL/rest/v1/issue_attachments" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Accept-Profile: forge" \
  -H "Content-Profile: forge" \
  -H "Content-Type: application/json" \
  -d "{\"issue_id\":\"{issueId}\",\"uploaded_by_agent_id\":\"$FORGE_AGENT_ID\",\"filename\":\"$FILENAME\",\"mime_type\":\"text/plain\",\"size_bytes\":$SIZE,\"storage_path\":\"$STORAGE_PATH\",\"category\":\"agent_proof\"}"

# d) NOW post [PROOF] — server Rule 2 check finds my attachment row and allows it
curl -sS -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d "{\"body\": \"[PROOF] Build passes (see $FILENAME). Branch: agent/<slug>. PR title: feat(FORGE-N): ...\"}"
```

**Why direct-Supabase instead of the endpoint:** FORGE-275 shipped the `/attachments` route in the dashboard (`dashboard/src/app/api/agent/issues/[id]/attachments`) but NOT in the bundled agent API at `127.0.0.1:3200`. Agents on Mini can only reach the bundled API. FORGE-284 tracks adding the route to the bundled API; until that lands, direct Supabase REST is the canonical path.

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
    "status": "done",
    "comment": "Implemented [what]. Branch: agent/[slug]. PR #[number]. Build passes. [any notes]."
  }'
```

## Step 9: Post [DONE] and Append Lessons Learned (MANDATORY — before exit)

**Post [DONE] as your last action:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[DONE] FORGE-N: <what shipped>. Branch: agent/<slug>. PR #<N>. ~$<cost> / <time>.", "tags": ["DONE"]}'
```

## Step 10: Append Lessons Learned

For every **non-trivial bug** you hit this run (build failures, cookie races, Supabase schema issues, adapter mismatches), append one entry to the TOP of `companies/mcm-forge/agents/forge-builder/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit with your work.

## Rules
- Never push to main directly
- Never modify files outside the scope of your issue
- If something is broken that's NOT your issue, report it but don't fix it
- Post a comment before every exit — the COO reads your comments
- If inbox is empty, exit immediately with [SILENT] marker
