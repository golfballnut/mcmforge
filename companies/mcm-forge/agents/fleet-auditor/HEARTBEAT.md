# Heartbeat Protocol — Fleet Auditor

Execute this EVERY time you wake up. No exceptions.

## Step 1: Check Inbox
```bash
curl -s "$FORGE_API_URL/api/agent/me/inbox" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```
If inbox has an issue, read it. Otherwise proceed with standard health audit.

## Step 2: Run All Health Checks

Run each check and collect results. Track pass/fail for each.

### Check 1: CLI Versions
```bash
echo "--- Claude CLI ---"
~/.local/bin/claude --version 2>&1 | head -1
echo "--- Codex CLI ---"
npx codex --version 2>&1 | head -1
echo "--- Gemini CLI ---"
/opt/homebrew/bin/gemini --version 2>&1 | head -1
```

### Check 2: Agent Config Audit
```bash
curl -s "$FORGE_API_URL/api/agents" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  | jq '[.[] | {name, adapter_type, model: .adapter_config.model} | select(
    (.adapter_type == "claude" and (.model | test("gemini|gpt"; "i"))) or
    (.adapter_type == "gemini" and (.model | test("claude|opus|sonnet|gpt"; "i"))) or
    (.adapter_type == "codex" and (.model | test("gemini|claude|opus|sonnet"; "i")))
  )]'
```

### Check 3: Budget Check
```bash
curl -s "$FORGE_API_URL/api/agents" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  | jq '[.[] | select(.budget_monthly_cents > 0) | {name, budget_monthly_cents, used: (.budget_used_cents // 0), pct: ((.budget_used_cents // 0) / .budget_monthly_cents * 100)} | select(.pct > 80)]'
```

### Check 4: Stuck Agents
```bash
curl -s "$FORGE_API_URL/api/agents" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  | jq '[.[] | select(.status == "error" or (.status == "running" and (.updated_at | fromdateiso8601) < (now - 3600)))]'
```

### Check 5: Orchestrator Health
```bash
curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3200/api/health
```

### Check 6: tmux Sessions
```bash
tmux ls 2>&1
```
Verify `claude`, `codex`, and `gemini` sessions exist.

### Check 7: Disk Space
```bash
AVAIL=$(df -h / | awk 'NR==2 {print $4}' | sed 's/Gi//')
echo "Available: ${AVAIL}GB"
```
Warn if < 20GB.

### Check 8: PM2 Status
```bash
pm2 jlist 2>&1 | jq '.[] | select(.name == "orchestrator") | {name, status: .pm2_env.status}'
```

## Step 3: Compile Results

Count passes and failures across all 8 checks.

## Step 4: Report

### If ALL 8 pass:
```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/runs/$FORGE_RUN_ID" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "succeeded", "result_summary": "[SILENT] Fleet health OK. 8/8 checks passed."}'
```
Exit immediately.

### If ANY check fails:
```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/runs/$FORGE_RUN_ID" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "succeeded", "result_summary": "## Fleet Health Report — PROBLEMS DETECTED\n\n### FAILED: [check name]\n[details]\n\n### Summary\nX/8 checks passed. Y problems require attention."}'
```

Also create an issue for each critical failure:
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"title": "Fleet Health: [check name] FAILED", "description": "[what failed + observed values]", "priority": "high", "labels": ["infra", "auto-detected"]}'
```

## Final Step — Close Your Issue (MANDATORY before exit)

The routine scheduler created an issue for this run. Mark it done (all pass) or cancelled (any fail) before exiting:

```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/issues/$FORGE_ISSUE_ID" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
  # Use "cancelled" if any check failed
```

This prevents zombie issues from stacking up on the board.

## Rules
- Run ALL 8 checks. Never skip one because an earlier check failed.
- [SILENT] ONLY when all 8 pass. One failure = full report.
- Never fix anything. Detect and report only.
- Never restart services or kill processes.
- Complete within 5 minutes. If a check hangs, timeout after 15s and mark it FAILED.
