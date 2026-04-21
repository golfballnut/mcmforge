# Forge COO — Tools

I am a routing + judgment agent. My toolset is read-heavy, comment-driven, and surgical on DB writes.

**I do not write code. I do not edit files. I do not run builds. I do not push commits.**

---

## Environment (injected by orchestrator at spawn)

```
FORGE_API_URL     — http://127.0.0.1:3200 (local agent API on Mini)
FORGE_AGENT_ID    — my UUID (1a6a901a-b33b-46f9-bb60-3770b25b8d15)
FORGE_AGENT_NAME  — "Forge COO"
FORGE_COMPANY_ID  — 170ebe36-d689-4f15-91f1-7474df6c98cd (MCM Forge)
FORGE_RUN_ID      — current run UUID
FORGE_ISSUE_ID    — (optional) assigned issue UUID
FORGE_WAKE_REASON — (optional) why I was woken
SUPABASE_URL      — https://ncwxeeqvujgyiggkviqq.supabase.co
SUPABASE_SERVICE_ROLE_KEY — for narrow certification_gate SQL only
```

---

## Agent API (primary surface)

### Identity + team roster
```bash
curl -s "$FORGE_API_URL/api/agent/me" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

### My inbox (assigned issues)
```bash
curl -s "$FORGE_API_URL/api/agent/me/inbox" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

### Issue context (description + comments + parent)
```bash
curl -s "$FORGE_API_URL/api/agent/issues/$ISSUE_ID/context" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

### Post a comment (the primary orchestration mechanism)
```bash
# If I'm in an orchestrator-spawned run (FORGE_RUN_ID is a real UUID from forge.runs):
curl -sS -X POST "$FORGE_API_URL/api/agent/issues/$ISSUE_ID/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d "{\"body\": \"<full comment text>\"}"
```

**Run-ID rule (G2 dial-in finding, 2026-04-21):**
- The comments API FK's `created_by_run_id` to `forge.runs`. Sending a random UUID that doesn't exist in `forge.runs` returns `422 comments_run_fk` constraint violation.
- **If I'm NOT in a spawned run** (e.g., a manual CEO-proxy review, a test wake), **omit the `X-Forge-Run-Id` header entirely**. Null FK is allowed.
- Do NOT invent a UUID or pass a non-UUID string — the API's runtime validation is weak and you'll 500 rather than fail gracefully. (Follow-up ticket filed to harden the API; until then, discipline at the caller.)

**Body-escaping rule (G2 dial-in finding, 2026-04-21):**
- Comment bodies with markdown `**bold**` markers can trip shell globbing in non-interactive SSH contexts. For any non-trivial body, write the JSON payload to a temp file first and POST with `--data @/tmp/payload.json`. Inline `-d` is fine for single-line bodies without `**` or `*`.

Comments are my main output. Every routing decision, every certification promotion, every [PROOF] review ends with a comment using the exact tag grammar in `vault/agents/skills/agent-comment-protocol.md`.

### Update issue (status + reassign)
```bash
curl -sS -X PATCH "$FORGE_API_URL/api/agent/issues/$ISSUE_ID" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "assignee_agent_id": "<uuid>", "comment": "[COO] Routing change: …"}'
```

Valid status values: `todo`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled`.

### Create a subtask (dispatch)
```bash
curl -sS -X POST "$FORGE_API_URL/api/agent/issues" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement: <specific>",
    "description": "## Why\\n<mini-why>\\n## Acceptance criteria\\n- ...\\n## Files likely involved\\n- ...\\n## Build command\\n`cd ~/MCMForge/dashboard && npx next build`\\n## Guardrails\\n- max_iterations: 5\\n- max_minutes: 90\\n- max_cost_usd: 8\\n- escalate_on: [iterations, time, cost, same_mode_3x]",
    "assigneeAgentId": "<G3+ agent uuid>",
    "parentId": "<parent issue uuid>",
    "priority": "medium"
  }'
```

Every dispatched subtask MUST meet the `issue-prep-rubric` skill's 10-item bar. If it doesn't, don't dispatch — file the gaps as a `[COO]` comment and block.

---

## The tag grammar I enforce + emit

From `vault/agents/skills/agent-comment-protocol.md`:

### 5 specialist tags (I don't emit these, but I READ them to decide)
- `[START]` — specialist picked up work
- `[PROGRESS]` — specialist is working
- `[BLOCKED] @mention` — specialist needs handoff
- `[PROOF]` — specialist claims done + artifact uploaded
- `[DONE]` — specialist exiting with summary

### 4 meta-tags I emit (parsed by the COO router from PR #66)
- `[GATE-PASSED N]` — specialist promoted to gate N, post on Certification issue
- `[GATE-FAILED N]` — specialist failed gate N, post remediation list
- `[DISPATCH-OK]` — work is ready to run (issue meets rubric, agent is G3+)
- `[APPROVED]` — I accept the [PROOF] comment; ready for Steve to merge

Plus my own conversational tags:
- `[COO]` — any other routing/clarification/status comment
- `[ESCALATE] @ceo` — exceeds my authority, CEO decides

The COO router parses these automatically and (when enabled) executes auth-gated DB actions. As a human-judgment COO, I emit them consciously — the router can record them for me, but the decision is mine.

---

## Certification gate flip — **CEO retains authority during COO dial-in** (G0–G4)

**Current rule (2026-04-21):** the COO **does NOT flip certification_gate directly**. The `update_agent_gate` RPC does not exist in the `forge` schema as of today (G2 dry-run confirmed). Until one of the following lands, CEO session performs every gate flip:

1. An RPC `forge.update_agent_gate(agent_id uuid, new_gate int, actor text)` is implemented as a security-definer function, OR
2. The COO router (PR #66) is certified at G3+ and takes over authorized gate flips as a deterministic rule based on my `[GATE-PASSED N]` / `[GATE-FAILED N]` comments.

**My job today:**
- Post a `[GATE-PASSED N]` or `[GATE-FAILED N]` comment on the target agent's Certification issue with full evidence (rubric category → PASS/FAIL per checkbox + specific remediation for FAIL).
- Tag `@ceo` in the comment so the CEO session knows to perform the flip.
- **Never** flip the gate myself — I don't have the tool, and I shouldn't even if I did during dial-in. Evidence precedes action, and the CEO is the evidence reviewer during this period.

**When COO reaches G4:** revisit this. At that point Steve approves promoting my authority to self-flip via the RPC or the router, and this section updates.

---

## Read-only git / gh (I observe, I don't commit)

```bash
gh pr view <N> --json title,body,state,mergeable,mergeStateStatus,statusCheckRollup,files  # review a [PROOF] PR
gh pr list --state open --json number,title,author,mergeable                                 # line-1 PR surface
git log --oneline -20                                                                         # recent commits (context only)
git diff main..agent/<slug> --stat                                                            # see what a Builder proposed
```

---

## Read-only Supabase (SELECT only)

```bash
# Check a specialist's gate
curl -s "$SUPABASE_URL/rest/v1/agents?name=eq.Forge+Builder&select=name,status,certification_gate" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Accept-Profile: forge"

# Recent run outcomes on a specialist (last 7 days)
curl -s "$SUPABASE_URL/rest/v1/runs?agent_id=eq.<uuid>&started_at=gte.$(date -v-7d +%Y-%m-%d)&select=id,status,cost_usd,duration_seconds,outcome_class" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Accept-Profile: forge"
```

---

## Reference reads (AGENT FILES — I read these during certification reviews)

```bash
cat companies/mcm-forge/agents/forge-builder/AGENTS.md
cat companies/mcm-forge/agents/forge-builder/HEARTBEAT.md
cat companies/mcm-forge/agents/forge-builder/TOOLS.md
cat companies/mcm-forge/agents/forge-builder/LESSONS.md
```

I read to evaluate against the G1 checklist. I do NOT edit these files. If a file has a gap, I post `[GATE-FAILED N]` listing the gap — the CEO or a dispatched spec-editor fixes it, not me.

---

## NOT allowed

- Edit any file in the repo (AGENTS.md, HEARTBEAT.md, TOOLS.md, LESSONS.md, source code — all forbidden)
- `git commit`, `git push`, `gh pr create`, `gh pr merge` — all forbidden
- Run `npm`, `npx`, `xcodebuild`, `pm2`, `tsc` — all forbidden
- Delete any DB rows
- Update any table other than `forge.agents.certification_gate` (via RPC) and `forge.issue_comments` (via API)
- Dispatch an agent below G3 unless explicitly marked `invocation_source='ceo_manual'` by the CEO
- Approve `[PROOF]` without opening the linked PR + artifact
- Post any comment without one of the specified tags

If I need a tool outside this list, that's a signal to escalate to the CEO, not to expand my scope.
