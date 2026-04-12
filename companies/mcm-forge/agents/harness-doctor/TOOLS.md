# TOOLS.md — Harness Doctor

Reference SQL, regex patterns, and state schemas.

---

## Core SQL Queries

### Failed runs last 7 days, joined with agent
```sql
SELECT
  r.id, r.agent_id, a.name as agent_name, r.error_code,
  substring(r.error, 1, 200) as error_head,
  substring(r.stderr_excerpt, 1, 300) as stderr_head,
  r.cost_usd, r.created_at,
  r.context_snapshot->>'issueId' as issue_id,
  r.context_snapshot->>'issue_title' as issue_title
FROM forge.runs r
JOIN forge.agents a ON r.agent_id = a.id
WHERE r.status = 'failed'
  AND r.created_at > now() - interval '7 days'
ORDER BY r.created_at DESC
LIMIT 500;
```

### Count failures by error_code across agents
```sql
SELECT
  a.name as agent, r.error_code,
  count(*) as occurrences,
  sum(r.cost_usd)::numeric(10,2) as total_cost,
  array_agg(r.id ORDER BY r.created_at DESC) FILTER (WHERE r.created_at > now() - interval '24 hours') as recent_24h,
  array_agg(DISTINCT r.context_snapshot->>'issueId') as affected_issues
FROM forge.runs r
JOIN forge.agents a ON r.agent_id = a.id
WHERE r.status = 'failed'
  AND r.created_at > now() - interval '7 days'
  AND r.error_code IS NOT NULL
GROUP BY a.name, r.error_code
HAVING count(*) >= 2
ORDER BY total_cost DESC, occurrences DESC;
```

### Stuck handoffs — issues in the same status > 4 hours
```sql
SELECT
  i.id, i.title, i.status, a.name as assignee,
  EXTRACT(EPOCH FROM (now() - i.updated_at))/3600 as hours_stuck
FROM forge.issues i
LEFT JOIN forge.agents a ON i.assignee_agent_id = a.id
WHERE i.status IN ('in_progress', 'in_review', 'todo')
  AND i.updated_at < now() - interval '4 hours'
  AND i.company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd'  -- adjust per company
ORDER BY hours_stuck DESC
LIMIT 20;
```

### Layer 1 dedup — existing [harness] issues
```sql
SELECT id, identifier, title, status, created_at
FROM forge.issues
WHERE title ILIKE '[harness]%'
  AND status NOT IN ('done', 'cancelled', 'approved')
ORDER BY created_at DESC;
```

### Layer 2 dedup — keyword fuzzy match (REQUIRED)
For each cluster, extract 3-5 distinctive keywords, then:
```sql
SELECT id, identifier, title, status, created_at
FROM forge.issues
WHERE company_id IN ('170ebe36-d689-4f15-91f1-7474df6c98cd', '99338dee-5fdc-4cbf-a344-5c08ec112a2b')
  AND status NOT IN ('done', 'cancelled', 'approved')
  AND (
    title ILIKE '%<kw1>%' OR title ILIKE '%<kw2>%' OR title ILIKE '%<kw3>%' OR
    description ILIKE '%<kw1>%' OR description ILIKE '%<kw2>%'
  )
ORDER BY created_at DESC
LIMIT 20;
```

Many human-filed improvement issues don't have the `[harness]` prefix. Without Layer 2, you will file dupes.

**Concrete example:** Cluster "Claude exited 143 retry storm" → keywords `retry storm`, `cooldown`, `Claude exited 143` → matches FORGE-177. Comment on FORGE-177 instead of filing new.

---

## Known Transient Errors (DO NOT file as actionable)

```
Vercel.*502
Supabase.*connection timeout
GitHub API rate limit exceeded
ECONNRESET
ETIMEDOUT
fetch failed
getaddrinfo ENOTFOUND
```

Maintain this list in the agent's own `LESSONS.md` under tag `transient-errors` so it grows based on false positives.

---

## Normalization Rules

When hashing errors for cluster matching, strip:
- UUIDs: `/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g` → `<UUID>`
- ISO timestamps: `/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g` → `<TIMESTAMP>`
- File paths with line numbers: keep the path, strip the line number
- Numeric IDs in error messages: `/\b\d{4,}\b/g` → `<NUM>`

After normalization, SHA256-hash the first 200 characters as the cluster key.

---

## WATCH_LIST.json Schema

```json
{
  "patterns": [
    {
      "signature": "<normalized error text or LESSONS.md tag>",
      "cluster_key": "<sha256 first 16 chars>",
      "count_7d": 2,
      "count_24h": 1,
      "total_cost_usd": 0.45,
      "agents_affected": ["Feature Builder"],
      "first_seen": "2026-04-08T06:00:00Z",
      "last_seen": "2026-04-09T06:00:00Z",
      "days_on_watch": 2,
      "representative_run_ids": ["uuid1", "uuid2"],
      "needs_more_info": false
    }
  ],
  "known_transient_clusters": [
    "<cluster_key>"
  ],
  "last_run_utc": "2026-04-09T10:00:00Z"
}
```

Cap at 50 patterns. If a pattern is on the list for 14+ days without reaching threshold, drop it — it's noise.

---

## Cost Targets

- Query phase: 2-3 SQL calls, minimal tokens (~500 input each)
- File reads: 27 LESSONS.md files, avg 5KB each = ~20K tokens total
- Classification: ~5K tokens per candidate cluster
- Issue drafting: ~2K tokens per issue

Target: < $0.30/day using Gemini Flash.
Hard cap: $1.00/day. If exceeded, append a LESSONS.md entry and reduce scope next run (e.g., 3 days instead of 7).

---

## Example Output Issue

```markdown
## Pattern detected
Feature Builder and iOS Builder both hit `xcrun simctl: device not found` errors when the Mini reboots between runs. 4 occurrences in last 24h, $1.60 burned.

## Evidence
- Occurrences (last 7 days): 6
- Total cost burned: $2.15
- Agents affected: Feature Builder, iOS Builder
- Representative run IDs: 27c0ae3f, dac36dc2, f979c8b1
- Error signature: `xcrun simctl io: Invalid device: <UUID>`

## Root cause (hypothesis)
Hardcoded simulator UUID `1C53DE6B-2574-43FF-BF29-C1C5ACF5A526` in HEARTBEAT.md files. When the Mini reboots and the simulator is re-created with a new UUID, all agents using the hardcoded ID fail until manually updated.

## Proposed fix
File: `companies/dirtsync/agents/feature-builder/HEARTBEAT.md` line 60
Old:
```
ssh dirtsyncmini@100.125.184.57 'xcrun simctl boot 1C53DE6B-2574-43FF-BF29-C1C5ACF5A526'
```
New:
```
SIM_UUID=$(ssh dirtsyncmini@100.125.184.57 'xcrun simctl list devices available | grep "iPhone 17" | head -1 | grep -oE "[A-F0-9-]{36}"')
ssh dirtsyncmini@100.125.184.57 "xcrun simctl boot $SIM_UUID"
```

Same change in ios-builder/HEARTBEAT.md and test-runner/HEARTBEAT.md (4 files total).

## Confidence
**High** — pattern isolates perfectly (same error signature across 2 agents), fix is small (~3 line change per file), reversible (revert to hardcoded UUID), testable (simulate Mini reboot and re-run).

## Test strategy
1. Run a staged test where the fix is applied locally
2. Boot simulator via the new command
3. Confirm UUID resolves correctly
4. Run one feature-builder issue end-to-end
```
