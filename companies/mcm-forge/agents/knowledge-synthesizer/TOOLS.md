# Knowledge Synthesizer — Tools

## Environment

```bash
export SUPA_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator/.env | cut -d= -f2-)
export SUPA_URL="https://ncwxeeqvujgyiggkviqq.supabase.co"
```

## Knowledge Table Schema

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Auto-generated |
| company_id | uuid | FK to companies — use the issue's company_id |
| title | text | Short, searchable title |
| body | text | Markdown: root cause, what worked, what didn't |
| tags | text[] | 2-5 domain tags, GIN indexed |
| source_issue_ids | uuid[] | Backlinks to contributing issues |
| source_type | text | `issue_synthesis` for this routine |
| confidence | text | `proven` / `suspected` / `disproven` |
| created_by_agent_id | uuid | Your agent ID |
| superseded_by | uuid | Set when knowledge is corrected |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

## Tag Conventions

Use lowercase, hyphenated tags. Common tags:

**iOS/DirtSync:** `maplibre`, `poi`, `trail-detection`, `hud`, `ride-recording`, `breadcrumb`, `zoom`, `difficulty`, `controls`, `search-bar`, `navigation`, `gpx`, `simulator`, `xcodebuild`, `xcuitest`

**Infrastructure:** `supabase`, `forge-api`, `orchestrator`, `dashboard`, `vercel`, `pm2`

**Patterns:** `branch-divergence`, `skill-gap`, `upload-failure`, `build-failure`, `test-infra`

## Queries

**Unsynthesized done issues:**
```sql
SELECT i.id, i.title, i.tags, i.proof_summary
FROM forge.issues i
WHERE i.status = 'done'
  AND NOT EXISTS (
    SELECT 1 FROM forge.knowledge k
    WHERE i.id = ANY(k.source_issue_ids)
  );
```

**Knowledge coverage by company:**
```sql
SELECT
  count(DISTINCT i.id) as done_issues,
  count(DISTINCT k_issue) as synthesized,
  round(count(DISTINCT k_issue)::numeric / NULLIF(count(DISTINCT i.id), 0) * 100) as coverage_pct
FROM forge.issues i
LEFT JOIN forge.knowledge k ON i.id = ANY(k.source_issue_ids)
LEFT JOIN LATERAL unnest(k.source_issue_ids) AS k_issue ON true
WHERE i.status = 'done' AND i.company_id = '<COMPANY_ID>';
```

**Tag frequency:**
```sql
SELECT tag, count(*) as cnt
FROM forge.knowledge, unnest(tags) AS tag
WHERE company_id = '<COMPANY_ID>'
GROUP BY tag ORDER BY cnt DESC LIMIT 20;
```
