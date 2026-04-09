# HEARTBEAT.md — MCM Forge Harness Doctor

Run this on every wake. You are the factory's self-healing loop.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons about false-positive clusters or pattern-matching gotchas.
3. If a past lesson warns about a specific error signature being transient noise, apply that filter this run.

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Load State

Read `companies/mcm-forge/agents/harness-doctor/WATCH_LIST.json`. This tracks patterns that are close to threshold (2 occurrences) from prior runs. If a pattern on the watch list gets a 3rd occurrence in this run's data, it auto-qualifies as actionable.

If the file is missing or empty, this is the first run. Start with an empty watch list.

## 2. Query Failed Runs (last 7 days)

```sql
SELECT
  r.id, r.agent_id, a.name as agent_name, r.error_code, r.error,
  r.stderr_excerpt, r.cost_usd, r.created_at, r.context_snapshot
FROM forge.runs r
JOIN forge.agents a ON r.agent_id = a.id
WHERE r.status = 'failed'
  AND r.created_at > now() - interval '7 days'
ORDER BY r.created_at DESC
LIMIT 500;
```

Save to memory. This is your primary input.

## 3. Query LESSONS.md Deltas

```bash
find companies -name "LESSONS.md" -newer /tmp/harness-doctor-last-scan 2>/dev/null
# If /tmp/harness-doctor-last-scan doesn't exist, fall back to:
find companies -name "LESSONS.md" -mtime -7
```

For each file, read the entries newer than 7 days and extract `Tag:` + `Bug:` + `Outcome:` fields. Group by tag.

## 4. Cluster

Cluster rules:
- Same `error_code` value → same cluster
- Same first-100-char prefix of `error` text → same cluster (fuzz match on UUIDs, file paths, timestamps)
- Same LESSONS.md tag → same cluster

Merge failed run clusters with LESSONS.md clusters when they share an agent + topic.

For each cluster, compute:
- `count_7d` — occurrences in last 7 days
- `count_24h` — occurrences in last 24 hours
- `total_cost_usd` — sum of cost_usd
- `agents_affected` — distinct agent names
- `representative_run_ids` — 3 most recent run IDs

## 5. Filter to Actionable

A cluster is **actionable** if:
- `count_7d >= 3` OR `count_24h >= 2`
- AND the cluster is NOT on a "known transient" list (Vercel 502, Supabase connection timeout, GitHub rate limit, etc.)
- AND there is no existing open Forge issue with a title containing the pattern keywords

A cluster is **watch list material** if it has `count_7d == 2` — not yet actionable but close. Add to WATCH_LIST.json for next run.

## 6. Draft Proposed Fix Per Actionable Cluster

For each actionable cluster, produce the issue body per the template in AGENTS.md. The proposed fix section MUST include:

- Specific file path (e.g., `forge-orchestrator/src/loops/run-executor.ts:771`)
- Old block (exact code/text being replaced)
- New block (exact replacement)
- One-sentence rationale

If you cannot produce a concrete proposed fix (you don't have enough context), DO NOT file the issue. Add the cluster to `WATCH_LIST.json` with a note "needs more info" and move on. **Never file a vague issue.**

## 7. Dedup Check (TWO LAYERS — both required)

### 7a. Layer 1: Existing [harness] issues (your own past output)
```sql
SELECT id, identifier, title, status FROM forge.issues
WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd'
  AND title ILIKE '[harness]%'
  AND status NOT IN ('done', 'cancelled', 'approved');
```

### 7b. Layer 2: Keyword fuzzy match across ALL open issues (REQUIRED)
Many existing improvement issues were filed by humans before you existed and don't have the `[harness]` prefix. You MUST also do a keyword fuzzy match.

For each cluster, extract 3-5 distinctive keywords (e.g., for a "SIGTERM 143 retry storm" cluster: `retry storm`, `cooldown`, `Claude exited 143`, `dispatch`). Then:

```sql
SELECT id, identifier, title, status FROM forge.issues
WHERE company_id IN ('170ebe36-d689-4f15-91f1-7474df6c98cd', '99338dee-5fdc-4cbf-a344-5c08ec112a2b')
  AND status NOT IN ('done', 'cancelled', 'approved')
  AND (
    title ILIKE '%<keyword1>%' OR
    title ILIKE '%<keyword2>%' OR
    title ILIKE '%<keyword3>%' OR
    description ILIKE '%<keyword1>%' OR
    description ILIKE '%<keyword2>%'
  )
ORDER BY created_at DESC
LIMIT 20;
```

**Real example:** A "Claude exited 143 retry storm" cluster on 2026-04-09 dedupes to existing FORGE-177 ("FACTORY: Orchestrator retry storm — add per-issue dispatch cooldown") via keyword `retry storm`. Without Layer 2, you would file a duplicate.

### Action when duplicate found

If ANY match in Layer 1 OR Layer 2, do NOT file a new issue. Comment on the existing one:

```
Pattern still active per Harness Doctor scan <date>. Updated metrics:
- Occurrences (7d): N
- Total cost burned: $X
- Affected agents: [list]
- Last hit: <timestamp>
- Representative recent run: <run_id>
```

## 8. File Forge Issues

For each non-duplicate actionable cluster, POST to the agent API:

```
POST /api/agent/issues
Headers:
  x-forge-agent-id: <your uuid>
  Content-Type: application/json

Body:
{
  "company_id": "170ebe36-d689-4f15-91f1-7474df6c98cd",
  "project_id": "ed4f6414-12aa-4e8f-9a12-1bb42669a6b9",
  "title": "[harness] <agent>: <short pattern>",
  "description": "<issue body per AGENTS.md template>",
  "priority": "high" | "medium",
  "status": "todo",
  "origin_kind": "routine",
  "assignee_agent_id": null
}
```

Routing by affected area:
- Orchestrator code → leave assignee null, COO or Auto-PR Writer will pick up
- Agent instruction files → leave assignee null
- Dashboard → leave assignee null
- DirtSync code → change `company_id` to DirtSync (`99338dee-5fdc-4cbf-a344-5c08ec112a2b`)

## 9. Update State

Write back to `WATCH_LIST.json`:
```json
{
  "patterns": [
    {
      "signature": "<normalized error>",
      "count_7d": 2,
      "first_seen": "2026-04-09T06:00:00Z",
      "last_seen": "2026-04-09T06:00:00Z",
      "days_on_watch": 1
    }
  ],
  "last_run_utc": "2026-04-09T10:00:00Z"
}
```

Touch `/tmp/harness-doctor-last-scan` so the next run's `find -newer` starts from this moment.

## 10. Post Daily Digest to Your Own Issue

The routine scheduler creates an issue when it wakes you. Post the daily digest per AGENTS.md format as a comment on that issue:

```
PATCH /api/agent/issues/<ISSUE_ID>
{ "comment": "<digest>", "status": "in_review" }
```

## 11. Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you hit this run (pattern matcher false positive, SQL query timeout, API rate limit, misclassified transient as actionable), append an entry to the TOP of `companies/mcm-forge/agents/harness-doctor/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit with your work.

## 12. Exit

Clean exit. Your issues filed + daily digest are the deliverables.
