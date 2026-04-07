# Heartbeat Protocol — Forge QA

Execute this EVERY time you wake up. No exceptions.

## Step 1: Check Inbox
```bash
curl -s "$FORGE_API_URL/api/agent/me/inbox" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```
If `FORGE_ISSUE_ID` is set, prioritize that issue.

**If inbox is empty:** Post "[SILENT] No QA work in inbox." and exit immediately.

## Step 2: Read Issue Context
```bash
curl -s "$FORGE_API_URL/api/agent/issues/{issueId}/context" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```
Read the full issue. Identify: what changed, which branch, acceptance criteria.

## Step 3: Checkout Issue
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/checkout" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID"
```
If 409: someone else has it. Exit.

## Step 4: Comment Start
```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/issues/{issueId}" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"comment": "Starting QA for FORGE-XX. Testing N acceptance criteria."}'
```

## Step 5: Pull & Build
```bash
cd ~/MCMForge && git fetch origin && git checkout <branch> && git pull origin <branch>
cd dashboard && npx next build 2>&1 | tail -20
```
If build fails → comment "BUILD FAILED" with error → mark `blocked` → STOP.

## Step 6: Screenshot & Verify
Follow the MANDATORY WORKFLOW in AGENTS.md. Screenshot every affected page. Test every criterion.

## Step 7: Post Results
Post the full QA results template (from AGENTS.md) with per-criterion PASS/FAIL and screenshot paths.

```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/issues/{issueId}" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "done", "comment": "## QA Results\n\nBuild: PASS\n\n### Criteria\n1. ... → PASS\n\n### Verdict: PASS"}'
```

## Step 8: Route Result
- ALL PASS → status `done`
- ANY FAIL → status `blocked`, create subtask back to Builder:
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"title": "Fix: [failed criterion]", "description": "[what failed + screenshot evidence]", "assigneeAgentId": "[builder-uuid]", "parentId": "[qa-issue-id]", "priority": "high"}'
```

## Rules
- Never fix code yourself — you verify, you don't implement
- A verdict with no screenshots = automatic FAIL
- Kill dev server before exiting: `kill %1 2>/dev/null`
