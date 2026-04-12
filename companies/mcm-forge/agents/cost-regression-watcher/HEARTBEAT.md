# HEARTBEAT.md — MCM Forge Cost Regression Watcher

Run this on every wake. You catch cost spikes before they compound.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons about false regressions, baseline drift, or agents that have legitimately expensive workloads (not bugs).

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Load Baseline

Read `companies/mcm-forge/agents/cost-regression-watcher/COST_BASELINE.json`. Contains:
- `daily_history` — array of last 14 days of daily metrics (for computing 7-day rolling avg with gap tolerance)
- `last_run_utc` — when you last ran

If the file is empty or has fewer than 7 days of data, this is the **warmup phase**. Compute today's metrics, append to history, and skip regression detection. You need at least 7 days of baseline before you can detect anything.

## 2. Query Today's Cost Metrics

Use the SQL queries in TOOLS.md. Compute:
- Total spend (24h)
- Cost per successful run
- Cost per failed run
- Cost per shipped feature
- Failed-run percentage
- Cost by adapter (claude / gemini / codex)
- Top 5 spending agents

Save the results to memory.

## 2.5. Data Quality Gate (CRITICAL — verified Apr 9: 74% of runs had null cost_usd)

Before computing baselines or detecting regressions, check the data quality:

```sql
SELECT
  count(*) as total_runs,
  count(*) FILTER (WHERE cost_usd IS NULL) as null_cost,
  100.0 * count(*) FILTER (WHERE cost_usd IS NULL) / nullif(count(*), 0) as null_pct
FROM forge.runs
WHERE finished_at > now() - interval '24 hours';
```

Also break down null cost by adapter:
```sql
SELECT
  a.adapter_type,
  count(r.*) as runs,
  count(r.*) FILTER (WHERE r.cost_usd IS NULL) as null_runs,
  100.0 * count(r.*) FILTER (WHERE r.cost_usd IS NULL) / nullif(count(r.*), 0) as null_pct
FROM forge.runs r
JOIN forge.agents a ON r.agent_id = a.id
WHERE r.finished_at > now() - interval '24 hours'
GROUP BY a.adapter_type;
```

**Decision rules:**
- If overall `null_pct > 50%`, the entire baseline cannot be trusted. Skip regression detection. Emit a CRITICAL digest header: `⚠️ COST DATA UNRELIABLE: N% of runs have null cost_usd. Baseline disabled until FORGE-176 is fixed.`
- If a SPECIFIC adapter has `null_pct > 80%`, that adapter is broken. Add to digest: `Adapter <X> has Y% null costs — cost tracking is silently broken for this adapter.`
- If `null_pct < 50%`, proceed with baseline (but include the data quality footnote in the digest).

**Why this matters:** As of 2026-04-09, Gemini was at 100% null and Claude at 28% null. Without this gate, the baseline would understate true cost by 70%+ and false-positive regressions would cascade.

## 3. Compute 7-Day Rolling Baseline

**Skip this step entirely if Step 2.5 said the data is unreliable.** Otherwise:

From `daily_history`, take the last 7 days (skipping any day where `total_spend < $1.00` — that's a paused day, not a real baseline). Compute the mean for each metric.

## 4. Detect Regressions

For each metric, compute:
```
delta_pct = ((today - baseline) / baseline) * 100
delta_abs = today - baseline
```

Classify:
- `delta_pct > 50` AND `delta_abs > 1.00` → **critical**
- `delta_pct > 20` AND `delta_abs > 0.50` → **high**
- `delta_pct > 10` AND `delta_abs > 0.50` → note in digest only
- Anything else → no regression

**Important:** the `delta_abs > X` gates matter. Without them, a $0.50→$1.00 change shows as 100% regression which is not actionable.

## 5. Attribute Regressions

For every detected regression, drill into the cause:
- Which agent had the biggest `cost_usd` increase?
- Which adapter was the biggest delta?
- Did a new routine start firing?
- Was there a model swap (check `forge.runs.model` distribution change)?

Produce a 1-paragraph hypothesis per regression.

## 6. Cross-Reference Other Agents

Query today's Harness Doctor and Prompt Auditor issues:

```sql
SELECT id, title FROM forge.issues
WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd'
  AND (title ILIKE '[harness]%' OR title ILIKE '[prompt]%')
  AND created_at > now() - interval '24 hours';
```

If Harness Doctor flagged a recurring failure pattern that matches your regressed agent, cite it in your issue body ("matching pattern: see issue X").

## 7. Dedup Check

Before filing a new cost issue, check for existing open ones:

```sql
SELECT id, title, status FROM forge.issues
WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd'
  AND title ILIKE '[cost]%'
  AND status NOT IN ('done', 'cancelled', 'approved')
  AND title ILIKE '%<metric name>%';
```

If match exists, comment with updated numbers instead of filing new.

## 8. File Issues

For each non-duplicate regression, POST to the agent API per AGENTS.md template. Priority = classification (high or critical).

If priority is `critical`, ALSO send an email to Steve via `gws gmail +send` (call via ssh to Mini):

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd ~
gws gmail +send \
  --to dirtsyncapp@gmail.com \
  --subject "🚨 COST SPIKE: <metric> +<pct>% — <agent>" \
  --body "<short summary>. Full details in Forge issue <id>."
REMOTE
```

## 9. Update Baseline

Append today's metrics to `daily_history`. Trim to last 14 days. Write back:

```json
{
  "daily_history": [
    { "date": "2026-04-09", "total_spend": 18.42, "cost_per_success": 1.25, "cost_per_failure": 0.65, "failed_pct": 14, "cost_per_feature": 6.10, "by_adapter": { "claude": 12.00, "gemini": 2.42, "codex": 4.00 } },
    ...
  ],
  "last_run_utc": "<now>"
}
```

## 10. Post Daily Digest

Post per AGENTS.md format to your own routine issue. Include all metrics + trends + any regressions filed.

## 11. Append Lessons Learned (MANDATORY — before exit)

For every non-trivial gotcha this run (false regression, cost_usd null on an adapter, baseline computation edge case), append an entry to the TOP of `companies/mcm-forge/agents/cost-regression-watcher/LESSONS.md`. Commit with your work.

## 12. Exit

Clean exit. Your deliverables are the digest and any filed regression issues.
