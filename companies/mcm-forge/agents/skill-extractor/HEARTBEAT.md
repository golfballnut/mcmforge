# HEARTBEAT.md — MCM Forge Skill Extractor

Run this on every wake. You only run weekly (Fridays 10am ET) — make it count.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons about clusters that turned out to be agent-specific (false positives) or skills that got rejected in review (so you don't re-extract them).

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Load State

Read `companies/mcm-forge/agents/skill-extractor/EXTRACTED.json`. Contains:
- `extracted_so_far` — list of tags already turned into skill files
- `rejected_proposals` — proposals reviewed and rejected (don't re-propose for 30 days)
- `last_run_utc` — when you last ran

## 2. Find LESSONS.md Files Modified in Last 7 Days

```bash
find companies -name "LESSONS.md" -mtime -7 2>/dev/null
```

For each file, read it. Parse entries newer than 7 days. The format per entry:

```markdown
## YYYY-MM-DD — <title>
**Bug:** <text>
**Attempted fix:** <text>
**Outcome:** worked | didn't work | partial
**Why:** <text>
**Cost:** $X.YY
**Tag:** <tag>
```

Extract: agent name (from directory), date, tag, outcome, cost, full bug text.

## 3. Cluster By Tag

Group all entries by `Tag:` field. For each tag, compute:
- `entry_count` — total entries in past 7 days
- `distinct_agents` — number of unique agents that wrote entries
- `worked_count` — entries with `Outcome: worked`
- `total_cost_usd` — sum of `Cost:` fields
- `representative_worked_entry` — the most recent/cheapest worked entry (this is the source for the skill)

## 4. Filter to Extractable Clusters

A cluster qualifies if ALL of:
- `distinct_agents >= 3`
- `worked_count >= 1`
- `tag` is NOT in `extracted_so_far` from EXTRACTED.json
- `tag` is NOT in `rejected_proposals` from EXTRACTED.json (within 30 days)
- An existing `vault/agents/skills/<tag>*.md` file does NOT already exist

## 5. Check Existing Skills (Dedup)

```bash
ls vault/agents/skills/*.md | grep -i "<tag>" || echo "no match"
```

If a match exists, the cluster is already covered. Skip.

## 6. Draft New Skill File

For each extractable cluster, create `vault/agents/skills/proposed/<tag>-<short-name>.md` following the MASTER-SKILL-TEMPLATE format.

Read `vault/agents/skills/MASTER-SKILL-TEMPLATE.md` for the structure. Read `vault/agents/skills/golden-feature.md` for an exemplar.

The drafted skill must include:
- **Goal** — 2-3 sentences derived from the cluster's bug pattern
- **Definition of Done** — derived from the `worked` outcome
- **Pre-Made Decisions** — from the cluster's consistent choices
- **Gotchas** — table with each entry as a row (Issue | Solution columns)
- **Reference Files** — pointers to the agents that hit this bug
- **Origin** — "auto-extracted by Skill Extractor on <date>, cluster of N entries from N agents"

## 7. File Forge Issue

Per AGENTS.md template. Title: `[skill] Promote proposed/<filename> to vault — N agents need it`

Set priority `medium`, `assignee_agent_id: null`, `status: todo`.

## 8. Update State

Append to `EXTRACTED.json`:

```json
{
  "extracted_so_far": [
    {
      "tag": "ferrostar",
      "filename": "ferrostar-instruction-filter.md",
      "extracted_at": "2026-04-10T14:00:00Z",
      "cluster_size": 4,
      "issue_id": "<uuid>"
    }
  ],
  "rejected_proposals": [
    {
      "tag": "xcuitest-flake",
      "rejected_at": "2026-04-03T10:00:00Z",
      "reason": "agent-specific, not generalizable",
      "cooldown_until": "2026-05-03T10:00:00Z"
    }
  ],
  "last_run_utc": "2026-04-10T14:00:00Z"
}
```

## 9. Post Weekly Digest

Post per AGENTS.md format to your routine issue.

## 10. Append Lessons Learned (MANDATORY — before exit)

For every non-trivial gotcha (false cluster, parsing error in a malformed LESSONS.md entry, dedup miss), append to `companies/mcm-forge/agents/skill-extractor/LESSONS.md`. Commit with your work.

## 11. Exit

Clean exit. Drafted skills + filed issues are your deliverables.
