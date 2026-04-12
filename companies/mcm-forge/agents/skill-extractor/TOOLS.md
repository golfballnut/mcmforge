# TOOLS.md — Skill Extractor

LESSONS.md parsing, cluster math, skill drafting templates.

---

## LESSONS.md Entry Parsing

Each entry follows this format (per `vault/agents/skills/lessons-learned-loop.md`):

```markdown
## YYYY-MM-DD — <title>
**Bug:** <text — one sentence>
**Attempted fix:** <text — one sentence>
**Outcome:** worked | didn't work | partial
**Why:** <text or "unknown">
**Cost:** $X.YY
**Tag:** <kebab-case-keyword>
```

### Regex to extract entries

```
^## (\d{4}-\d{2}-\d{2}) — (.+)\n
\*\*Bug:\*\* (.+)\n
\*\*Attempted fix:\*\* (.+)\n
\*\*Outcome:\*\* (worked|didn't work|partial)\n
\*\*Why:\*\* (.+)\n
\*\*Cost:\*\* \$([\d.]+)\n
\*\*Tag:\*\* (.+)
```

Capture groups: 1=date, 2=title, 3=bug, 4=fix, 5=outcome, 6=why, 7=cost, 8=tag.

If an entry doesn't parse cleanly, log it as a malformed entry but don't fail the whole run. Pattern recognition over strictness.

---

## Cluster Threshold

```
extractable = (
  distinct_agents >= 3
  AND worked_count >= 1
  AND not_already_extracted(tag)
  AND not_in_rejected_30d(tag)
  AND not vault/agents/skills/*<tag>*.md exists
)
```

3 distinct agents is the floor. A single agent hitting the same bug 10 times is Harness Doctor's domain — your job is patterns that span the factory.

---

## Skill Drafting Template

When you draft a new skill in `vault/agents/skills/proposed/<tag>-<short>.md`:

```markdown
# Skill: <Title in Plain English>

> Last updated: <today YYYY-MM-DD>
> Used by: <list of agents from the cluster>
> Origin: Auto-extracted by Skill Extractor from N LESSONS.md entries spanning N agents (week of <date>)
> Status: PROPOSED — pending review by Forge COO

---

## Goal

<2-3 sentences. Frame as preventive: "Avoid X by always doing Y. The N agents that hit this learned the hard way."  Derive from the worked-outcome entry's Why field.>

## Definition of Done

**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**

1. <criterion derived from the worked entry's Attempted fix>
2. <criterion derived from the bug condition>
3. <verification step>

## Pre-Made Decisions

| Decision | Answer |
|----------|--------|
| <decision the cluster consistently makes> | <answer> |

## Gotchas

| Issue | Solution |
|-------|----------|
| <bug from agent A's entry> | <fix from worked entry> |
| <bug from agent B's entry> | <variant fix> |
| <bug from agent C's entry> | <variant fix> |

## Reference Files

- Agents that hit this pattern: <list>
- Source LESSONS.md entries: <quote 2-3>
- Related skills: <if any>

## Output

<what an agent following this skill should produce — derived from cluster context>

## Checklist

### Before Starting
- [ ] <preflight check>

### After Running
- [ ] <verify the fix worked>
```

---

## EXTRACTED.json Schema

```json
{
  "extracted_so_far": [
    {
      "tag": "ferrostar-instruction-filter",
      "filename": "ferrostar-instruction-filter.md",
      "filepath": "vault/agents/skills/proposed/ferrostar-instruction-filter.md",
      "extracted_at": "2026-04-10T14:00:00Z",
      "cluster_size": 4,
      "distinct_agents": ["Feature Builder", "iOS Builder", "Nav HUD Polish Expert", "Test Runner"],
      "total_cost_burned": 6.20,
      "issue_id": "<forge issue uuid>",
      "promoted": false
    }
  ],
  "rejected_proposals": [
    {
      "tag": "xcuitest-launchapp-flake",
      "rejected_at": "2026-04-03T10:00:00Z",
      "reason": "agent-specific to test-runner, not generalizable to others",
      "cooldown_until": "2026-05-03T10:00:00Z"
    }
  ],
  "last_run_utc": "2026-04-10T14:00:00Z"
}
```

When a proposed skill is promoted (moved from `proposed/` to `vault/agents/skills/`), set `promoted: true` and don't re-extract.

---

## Cost Targets

- Runs once per week (Fridays only)
- 27 LESSONS.md file reads (~5KB each = ~150K tokens total)
- 1 MASTER-SKILL-TEMPLATE read
- 0-2 skill drafts (~5K tokens each)

Target: $0.30/week using Gemini Flash.
Hard cap: $1.00/week.
