---
name: harness-health-check
description: Routine skill that audits the complete agent harness — AGENTS.md size, skill coverage, test coverage, outcome patterns, silent failures
---

# Agent Harness Health Check

Run this as a routine to audit and improve the agent harness system.

## What to Check

### 1. AGENTS.md Size Audit
For every agent in `companies/dirtsync/agents/*/AGENTS.md`:
- File size should be < 10K chars (identity only)
- If > 10K: domain knowledge should be extracted to skills
- Flag bloated files and recommend which sections to extract

### 2. Skill Coverage
For every agent:
- Does the agent have skills listed in AGENTS.md frontmatter?
- Are the skills referenced actually used (check issue comments for skill-related actions)?
- Are there domain knowledge sections in AGENTS.md that should be skills?

### 3. HEARTBEAT Enforcement
For every agent with a HEARTBEAT.md:
- Does it enforce result posting? (must PATCH Forge API before exit)
- Does it have acceptance criteria / test requirements?
- Does it have bail-out rules? (max iterations, blocker detection)
- Does it have reflection steps? (mandatory before retry)

### 4. Outcome Pattern Analysis
Query forge.runs for the last 7 days:
```sql
SELECT 
  a.name,
  COUNT(*) as total_runs,
  COUNT(*) FILTER (WHERE r.status = 'succeeded') as succeeded,
  COUNT(*) FILTER (WHERE r.status = 'failed') as failed,
  COUNT(*) FILTER (WHERE r.summary IS NULL AND r.status = 'succeeded') as silent_successes,
  COUNT(*) FILTER (WHERE r.outcome_class IS NOT NULL) as classified,
  ROUND(AVG(r.cost_usd::numeric), 2) as avg_cost
FROM forge.runs r
JOIN forge.agents a ON a.id = r.agent_id
WHERE r.created_at > NOW() - INTERVAL '7 days'
GROUP BY a.name
ORDER BY total_runs DESC;
```

Flag:
- Agents with > 30% failure rate → harness needs improvement
- Agents with silent_successes > 0 → HEARTBEAT doesn't enforce posting
- Agents with avg_cost > $5 → AGENTS.md may be bloated (too much context)
- Agents with 0 classified outcomes → add outcome_class tracking

### 5. Test Coverage
For each screen/feature:
- Does a Gold Star spec exist?
- Does a Gold Star test suite exist?
- How many tests pass on last run?
- Are there features without any test coverage?

### 6. Write Scope
For recent issues:
- Did the issue include a Write Scope (allowed files)?
- Did the agent modify files outside scope?
- Flag scope violations

## Output Format

Post results as a Forge issue comment:

```
## Harness Health Check — {date}

### AGENTS.md Audit
| Agent | Size | Status | Action |
|-------|------|--------|--------|
| Feature Builder | 7K | ✅ OK | — |
| iOS Builder | 22K | ❌ Bloated | Extract framework knowledge to skills |

### Skill Coverage
| Agent | Skills | Missing |
|-------|--------|---------|
| Feature Builder | 4 | — |
| QA Rider | 0 | Needs gold-star-testing |

### HEARTBEAT Issues
- iOS Builder: no acceptance criteria step
- Ship Engineer: no result posting enforcement

### Outcome Patterns
| Agent | Runs | Success% | Silent | Avg Cost | Action |
|-------|------|----------|--------|----------|--------|

### Recommendations
1. [highest impact action]
2. [second highest]
3. [third highest]
```

## Self-Improvement Loop

After posting the health check, the COO reviews recommendations and:
1. Approves harness changes (skill extraction, HEARTBEAT fixes)
2. Creates issues for the changes
3. Feature Builder or COO implements them
4. Next health check measures improvement

This is the Meta-Harness outer optimization loop.
