# TOOLS.md — Cost Regression Watcher

SQL queries, thresholds, baseline schema.

---

## Core SQL Queries

### Total spend last 24h
```sql
SELECT
  coalesce(sum(cost_usd), 0)::numeric(10,2) as total_spend,
  count(*) as run_count,
  count(*) FILTER (WHERE status = 'succeeded') as success_count,
  count(*) FILTER (WHERE status = 'failed') as failure_count,
  count(*) FILTER (WHERE cost_usd IS NULL) as null_cost_count
FROM forge.runs
WHERE finished_at > now() - interval '24 hours';
```

### Cost by adapter
```sql
SELECT
  a.adapter_type,
  count(r.*) as run_count,
  coalesce(sum(r.cost_usd), 0)::numeric(10,2) as total_cost
FROM forge.runs r
JOIN forge.agents a ON r.agent_id = a.id
WHERE r.finished_at > now() - interval '24 hours'
GROUP BY a.adapter_type
ORDER BY total_cost DESC;
```

### Top 5 spending agents last 24h
```sql
SELECT
  a.name, a.adapter_type,
  count(r.*) as runs,
  coalesce(sum(r.cost_usd), 0)::numeric(10,2) as cost,
  coalesce(avg(r.cost_usd), 0)::numeric(10,2) as avg_cost_per_run
FROM forge.runs r
JOIN forge.agents a ON r.agent_id = a.id
WHERE r.finished_at > now() - interval '24 hours'
GROUP BY a.id, a.name, a.adapter_type
ORDER BY cost DESC
LIMIT 5;
```

### Cost per shipped feature
```sql
WITH shipped_issues AS (
  SELECT id FROM forge.issues
  WHERE status = 'done'
    AND completed_at > now() - interval '24 hours'
),
issue_costs AS (
  SELECT
    (r.context_snapshot->>'issueId')::uuid as issue_id,
    sum(r.cost_usd) as total_cost
  FROM forge.runs r
  WHERE r.context_snapshot->>'issueId' IS NOT NULL
    AND (r.context_snapshot->>'issueId')::uuid IN (SELECT id FROM shipped_issues)
  GROUP BY (r.context_snapshot->>'issueId')
)
SELECT
  count(*) as shipped_count,
  coalesce(sum(total_cost), 0)::numeric(10,2) as total_cost,
  coalesce(avg(total_cost), 0)::numeric(10,2) as avg_cost_per_feature
FROM issue_costs;
```

### Failed-run percentage last 24h
```sql
SELECT
  100.0 * count(*) FILTER (WHERE status = 'failed') / nullif(count(*), 0) as failed_pct,
  count(*) FILTER (WHERE status = 'failed') as failed_count,
  count(*) as total_count
FROM forge.runs
WHERE finished_at > now() - interval '24 hours';
```

### Cost-tracking gaps (FORGE-176 monitor)
```sql
SELECT
  a.name, a.adapter_type,
  count(*) as null_cost_runs,
  min(r.created_at) as earliest_null,
  max(r.created_at) as latest_null
FROM forge.runs r
JOIN forge.agents a ON r.agent_id = a.id
WHERE r.status = 'succeeded'
  AND r.cost_usd IS NULL
  AND r.finished_at > now() - interval '24 hours'
GROUP BY a.name, a.adapter_type
ORDER BY null_cost_runs DESC;
```

If this query returns rows, note in digest: "FORGE-176 still open — N runs have null cost_usd on <adapter>."

---

## Thresholds

```
CRITICAL:
  delta_pct > 50 AND delta_abs > 1.00 USD

HIGH:
  delta_pct > 20 AND delta_abs > 0.50 USD

NOTE (digest only, no issue):
  delta_pct > 10 AND delta_abs > 0.50 USD

IGNORE:
  delta_abs < 0.50 USD (regardless of percentage)
  delta_pct < 10
```

The absolute floor prevents false regressions at low volumes.

---

## COST_BASELINE.json Schema

```json
{
  "daily_history": [
    {
      "date": "2026-04-09",
      "total_spend": 18.42,
      "run_count": 52,
      "success_count": 45,
      "failure_count": 7,
      "failed_pct": 13.5,
      "cost_per_success": 0.41,
      "cost_per_failure": 0.09,
      "cost_per_feature": 6.10,
      "null_cost_count": 2,
      "by_adapter": {
        "claude": { "runs": 20, "cost": 12.00 },
        "gemini": { "runs": 25, "cost": 2.42 },
        "codex": { "runs": 7, "cost": 4.00 }
      },
      "top_agents": [
        { "name": "Feature Builder", "runs": 12, "cost": 8.50 },
        { "name": "Factory Analyst", "runs": 3, "cost": 0.15 }
      ]
    }
  ],
  "last_run_utc": "2026-04-10T15:30:00Z"
}
```

Keep the last 14 days so you can compute a 7-day rolling average with tolerance for paused days.

---

## Baseline Computation — Handle Edge Cases

When computing the 7-day rolling average:

1. **Skip paused days.** If `total_spend < 1.00` on any day, exclude it. Factory-paused days distort the baseline.
2. **Skip the first 7 days.** If fewer than 7 non-paused days in `daily_history`, don't detect regressions. Just record.
3. **Give new agents a grace period.** If a top-5 agent's first cost event is within 3 days, flag its cost as "new agent baseline" not "regression."

---

## Cost Targets

- 6-8 SQL queries/day
- Light token usage (mostly numeric output)
- Issue filing: 0-2 per day (rare events)

Target: $0.15/day using Gemini Flash.
Hard cap: $0.40/day.

You are literally the cost watcher. If you exceed your own budget, you file an issue ON YOURSELF in tomorrow's run.
