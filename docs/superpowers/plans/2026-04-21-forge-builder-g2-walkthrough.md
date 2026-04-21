# Forge Builder G2 Certification Walk-Through

> Plan to walk through Forge Builder's G2 (manual dry-run) with Steve watching.
> Target: run every HEARTBEAT command by hand on the Mini, confirm each step works.
> Est time: 20-30 min. Cost: ~$0 (no LLM calls — just me typing, you watching).

## Pre-requisites

- [ ] PR #66 merged OR G1 frontmatter edits pulled to Mini
- [ ] `forge-orchestrator` still STOPPED (`pm2 list` shows `stopped` for it — we don't want background dispatches during the walk)
- [ ] Steve on screen-share or able to see the SSH session output
- [ ] Fresh issue for the dry-run — suggest FORGE-276 (Attachments panel) since the spec is tight

## G2 procedure (each step corresponds to Forge Builder's HEARTBEAT.md)

### Step 0 — Read LESSONS.md

```bash
ssh dirtsyncmini@100.125.184.57
cd ~/MCMForge
cat companies/mcm-forge/agents/forge-builder/LESSONS.md
```

**Expected:** file exists with header stanza. Currently empty beyond header — that's fine.

**Gate:** can we locate + read the file? Yes = PASS.

### Step 1 — Check inbox

Forge Builder's HEARTBEAT says:
> Check inbox via `GET $FORGE_API_URL/api/agent/me/inbox` with X-Forge-Agent-Id header.

Since orchestrator is stopped, the agent API on localhost:3200 is down too. For G2 we simulate this by SQL:

```bash
export KEY=$(grep ^SUPABASE_SERVICE_ROLE_KEY ~/MCMForge/forge-orchestrator/.env | cut -d= -f2-)
curl -sS "https://ncwxeeqvujgyiggkviqq.supabase.co/rest/v1/issues?select=identifier,title,status,priority&assignee_agent_id=eq.21d39f2a-db73-45af-b4ce-abd321d70fe1&status=in.(todo,in_progress)" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Accept-Profile: forge" | head -20
```

**Expected:** JSON array of assigned issues. Should include FORGE-276 if we assigned it for the test.

**Gate:** command returns without auth error and shows issues.

### Step 2 — Post [START] comment

```bash
curl -sS -X POST "https://ncwxeeqvujgyiggkviqq.supabase.co/rest/v1/issue_comments" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Profile: forge" -H "Content-Type: application/json" \
  -d '{
    "company_id":"170ebe36-d689-4f15-91f1-7474df6c98cd",
    "issue_id":"<FORGE-276 UUID>",
    "author_agent_id":"21d39f2a-db73-45af-b4ce-abd321d70fe1",
    "body":"[START] FORGE-276 dry-run — G2 walk-through. Plan: add attachments endpoint per spec. Est: 20 min."
  }'
```

**Expected:** 201 with comment row JSON.

**Gate:** comment lands on DIRA issue; visible in mcmforge.com dashboard.

### Step 3 — Checkout branch

```bash
cd ~/MCMForge
git fetch origin main
git checkout -b agent/forge-276-attachments-endpoint origin/main
git status
```

**Expected:** clean branch, current HEAD = origin/main tip.

**Gate:** on the right branch, no stale files.

### Step 4 — Make the code change

Per FORGE-276 spec: create `dashboard/src/app/api/agent/issues/[id]/attachments/route.ts`.

**For G2:** don't actually write the code — the point is to confirm the SURROUNDING workflow works. Either:
- (a) Skip — note "code writing is the LLM step, validated separately" and move to Step 5
- (b) If confident, write the file manually in vim/cursor and save

**Gate:** either skipped cleanly or file exists.

### Step 5 — Build + type-check

```bash
cd dashboard
npm run type-check  # or: npx tsc --noEmit
npm run build 2>&1 | tail -30
```

**Expected:** no errors.

**Gate:** both commands exit 0. If type-check errors on untouched code: note pre-existing.

### Step 6 — Smoke test

```bash
# Start dev server in another tmux pane
cd dashboard && npm run dev &
sleep 10
# Hit the new endpoint
curl -sS -X POST http://localhost:3000/api/agent/issues/<test-uuid>/attachments \
  -H "x-forge-agent-id: 21d39f2a-db73-45af-b4ce-abd321d70fe1" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.txt","mimeType":"text/plain","base64":"dGVzdA==","caption":"G2 dry-run"}'
```

**Expected:** 201 with storagePath + publicUrl.

**Gate:** endpoint returns successfully.

### Step 7 — [PROOF] + artifact upload

Post a [PROOF] comment with a real attachment (the terminal output of Step 6):

```bash
# save the output
echo "$(date): G2 dry-run PASS" > /tmp/g2-proof.txt

# upload via the new endpoint (the one we just built — circular!)
# OR fall back to manual service-role storage upload (pattern we used earlier tonight)
```

**Gate:** attachment appears on FORGE-276 in dashboard, visible to Steve.

### Step 8 — Push branch + create PR

```bash
git add dashboard/src/app/api/agent/issues/\[id\]/attachments/route.ts
git commit -m "feat(agent-api): POST attachments endpoint (Closes #FORGE-276)"
git push -u origin agent/forge-276-attachments-endpoint
gh pr create --title "feat: agent attachments endpoint" --body "Closes #FORGE-276"
```

**Gate:** PR opens, Vercel preview starts building.

### Step 9 — [DONE] comment

```bash
# Final comment on FORGE-276
curl -X POST [...comments endpoint...] \
  -d '{"body":"[DONE] PR #XXX opened. G2 walk-through complete. ~$0 cost (no LLM)."}'
```

### Step 10 — Commit LESSONS.md

```bash
cd ~/MCMForge
# edit companies/mcm-forge/agents/forge-builder/LESSONS.md
# add a new "2026-04-21 — G2 certification dry-run: clean run, no gaps found" entry
git add companies/mcm-forge/agents/forge-builder/LESSONS.md
git commit -m "lessons(forge-builder): G2 dry-run clean"
```

## What proves G2

All 10 steps run without:
- Permission errors
- Missing files
- Wrong paths
- Missing env vars
- API 4xx/5xx unexpected responses

If any step fails: that's a skill/tooling gap. Document it in the Certification issue, fix the HEARTBEAT or TOOLS.md, re-run from the failed step.

## What to do AFTER G2 passes

Steve posts on FORGE-281 (Forge Builder Certification issue):
```
[GATE-PASSED 2] Forge Builder manual dry-run clean on FORGE-276. All 10 HEARTBEAT steps ran. Ready for G3 supervised live run.
```

COO router (when enabled) sees the tag, updates `agents.certification_gate` from 1 to 2.

Then G3 = dispatch the actual agent on the actual issue, watch it run. Cleanup if needed.

## Risks / known limitations

- Step 4 skips actual code writing — LLM-specific. G2 is about the PROCEDURE, G3 tests the LLM.
- Agent API is down while orchestrator is stopped. We use REST + service role directly.
- Forge Builder's HEARTBEAT doesn't yet require [PROOF] artifact upload (was just shipped in skill, not in agent's own HEARTBEAT yet). The walk-through adds it manually.

## After walk-through

Update `GATES.md` in `companies/mcm-forge/agents/forge-builder/` (create if missing) with:
```markdown
# Forge Builder — Certification Gates

| Gate | Status | Date | Evidence |
|---|---|---|---|
| G1 | Promoted | 2026-04-21 | FORGE-281 comment + frontmatter commit f797a38 |
| G2 | Promoted | 2026-04-21 | FORGE-281 [GATE-PASSED 2] comment + walk-through transcript |
```

---

*This is the pattern. Every agent goes through some version of it before running.*
