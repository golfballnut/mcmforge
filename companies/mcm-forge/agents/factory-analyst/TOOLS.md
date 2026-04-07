# TOOLS.md — MCM Forge Factory Analyst

## Available Tools
- Bash (SSH to Mini for process health, Forge API queries)
- File read/write (agent instruction files, reports)
- Forge API (issues, runs, agents, costs)
- Supabase SQL (direct queries for analytics)

## Forge Database Queries

```sql
-- Agent performance (last 24h)
SELECT a.name, count(*) as runs,
  count(*) FILTER (WHERE r.status = 'succeeded') as ok,
  count(*) FILTER (WHERE r.status = 'failed') as fail,
  sum(r.cost_usd)::numeric(10,2) as cost
FROM forge.runs r JOIN forge.agents a ON r.agent_id = a.id
WHERE r.created_at > now() - interval '24 hours'
GROUP BY a.name ORDER BY runs DESC;

-- Failure patterns (last 7 days)
SELECT a.name, LEFT(r.error, 100) as error, count(*) 
FROM forge.runs r JOIN forge.agents a ON r.agent_id = a.id
WHERE r.status = 'failed' AND r.created_at > now() - interval '7 days'
GROUP BY a.name, LEFT(r.error, 100) ORDER BY count DESC LIMIT 10;

-- Stuck issues (hours since last update)
SELECT i.identifier, i.title, i.status, a.name,
  EXTRACT(EPOCH FROM (now() - i.updated_at))/3600 as hours_stuck
FROM forge.issues i LEFT JOIN forge.agents a ON i.assignee_agent_id = a.id
WHERE i.status NOT IN ('done', 'cancelled')
ORDER BY hours_stuck DESC LIMIT 10;

-- Daily throughput
SELECT date_trunc('day', r.finished_at)::date as day,
  count(*) FILTER (WHERE r.status = 'succeeded') as ok,
  count(*) FILTER (WHERE r.status = 'failed') as fail,
  sum(r.cost_usd)::numeric(10,2) as cost
FROM forge.runs r WHERE r.finished_at > now() - interval '7 days'
GROUP BY day ORDER BY day;

-- Queue depth right now
SELECT status, count(*) FROM forge.runs 
WHERE status IN ('queued', 'running') GROUP BY status;
```

## Mini Health Check
```bash
ssh dirtsyncmini@100.125.184.57 'echo "=== Orchestrator ===" && curl -s http://127.0.0.1:3200/api/health && echo "" && echo "=== Simulator ===" && xcrun simctl list devices booted && echo "=== Disk ===" && df -h / | tail -1 && echo "=== Active Processes ===" && ps aux | grep -cE "claude|codex|gemini|xcodebuild"'
```

## Forge API
```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox
GET  /api/agent/issues/:id/context
PATCH /api/agent/issues/:id
POST /api/agent/issues          — create new issues from recommendations
```

## Agent Instruction Files (for writing lessons)
- DirtSync agents: `/Users/dirtsyncmini/MCMForge/companies/dirtsync/agents/*/`
- MCM Forge agents: `/Users/dirtsyncmini/MCMForge/companies/mcm-forge/agents/*/`
- Each agent has: AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md

## Waste Tracking Queries

```sql
-- Duplicate runs (same issue, multiple failed runs, no code change between)
SELECT i.identifier, count(*) as failed_runs, sum(r.cost_usd)::numeric(10,2) as wasted_cost
FROM forge.runs r 
JOIN forge.issues i ON r.context_snapshot->>'issueId' = i.id::text
WHERE r.status = 'failed' AND r.created_at > now() - interval '24 hours'
GROUP BY i.identifier HAVING count(*) > 1
ORDER BY wasted_cost DESC;

-- Timed-out runs (ran full turns but didn't complete)
SELECT a.name, count(*) as timeouts, sum(r.cost_usd)::numeric(10,2) as cost
FROM forge.runs r JOIN forge.agents a ON r.agent_id = a.id
WHERE r.status = 'failed' AND r.error LIKE '%turn%limit%'
  AND r.created_at > now() - interval '7 days'
GROUP BY a.name ORDER BY timeouts DESC;

-- Silent failures (succeeded but no comment posted)
SELECT r.id, a.name, i.identifier, r.finished_at
FROM forge.runs r 
JOIN forge.agents a ON r.agent_id = a.id
LEFT JOIN forge.issues i ON r.context_snapshot->>'issueId' = i.id::text
LEFT JOIN forge.issue_comments c ON c.issue_id = i.id AND c.created_by_run_id = r.id
WHERE r.status = 'succeeded' AND c.id IS NULL
  AND r.created_at > now() - interval '24 hours';

-- Rejection loops (issue rejected 3+ times)
SELECT i.identifier, i.title, 
  count(*) FILTER (WHERE c.body LIKE '%REJECTED%') as rejections,
  count(*) FILTER (WHERE c.body LIKE '%APPROVED%') as approvals
FROM forge.issues i
JOIN forge.issue_comments c ON c.issue_id = i.id
WHERE c.body LIKE '%Grade:%'
GROUP BY i.identifier, i.title
HAVING count(*) FILTER (WHERE c.body LIKE '%REJECTED%') >= 3;

-- Knowledge pipeline: did scouts run today?
SELECT a.name, max(r.finished_at) as last_run, 
  count(*) FILTER (WHERE r.created_at > now() - interval '24 hours') as runs_today
FROM forge.runs r JOIN forge.agents a ON r.agent_id = a.id
WHERE a.name IN ('Design Scout', 'Code Scout', 'Factory Analyst')
GROUP BY a.name;

-- Cost per shipped feature
SELECT i.identifier, i.title,
  count(r.*) as total_runs,
  sum(r.cost_usd)::numeric(10,2) as total_cost,
  EXTRACT(EPOCH FROM (max(r.finished_at) - min(r.created_at)))/3600 as hours_to_ship
FROM forge.issues i
JOIN forge.runs r ON r.context_snapshot->>'issueId' = i.id::text
WHERE i.status = 'done'
GROUP BY i.identifier, i.title
ORDER BY total_cost DESC LIMIT 10;

-- Grade progression per issue (from critique comments)
SELECT i.identifier,
  c.body,
  c.created_at
FROM forge.issue_comments c
JOIN forge.issues i ON c.issue_id = i.id
WHERE c.body LIKE '%Grade:%'
ORDER BY i.identifier, c.created_at;
```

## Google Drive — QA Iterations Analysis

```bash
# Count iterations per issue
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
QA_FOLDER="1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X"
gws drive files list --params "q='${QA_FOLDER}' in parents and trashed=false" 2>&1 | grep -v "^Using keyring"
```

## Calendar Briefing

Post daily stats as a calendar event so Steve sees them on his phone:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
gws calendar events insert --calendar-id primary --json '{
  "summary": "Factory Report: X shipped, $Y spent, Z% waste",
  "description": "<FULL REPORT HERE>",
  "start": {"date": "YYYY-MM-DD"},
  "end": {"date": "YYYY-MM-DD"},
  "colorId": "11"
}'
```
Use colorId "11" (tomato) for DirtSync factory reports.

## What You CANNOT Do
- Write production app code
- Run tests or take screenshots
- Approve or reject features
- Restart the orchestrator (tell Steve or create an issue)
