# TOOLS.md — Prompt Auditor

Reference: scoring rubric details, schedule generation, state schemas.

---

## Scoring Rubric — 10 Axes Detailed

### Axis 1: Identity clarity (1-10)
- **10:** First paragraph states what the agent IS and what it is NOT, in one sentence each
- **7:** States what the agent IS
- **4:** Generic intro ("You are the X agent for Y")
- **1:** No identity statement at all

### Axis 2: Frontmatter completeness (1-10)
Required fields: `name`, `title`, `reportsTo`, `company`, `companyId`, `skills`
- **10:** All fields present + valid UUID format for companyId
- **7:** Missing 1 optional field
- **4:** No frontmatter at all (plain markdown header instead)
- **1:** File missing

### Axis 3: Skills wiring (1-10)
- **10:** `skills:` contains `forge` + `lessons-learned-loop` + any domain skills
- **7:** `skills:` present but missing `lessons-learned-loop`
- **4:** `skills: []` empty
- **1:** No skills field

### Axis 4: Measurable acceptance (1-10)
Count vague vs specific language in the Rules section:
- **10:** 90%+ of rules include a number, file path, or exact string
- **7:** 60%+ specific
- **4:** Mostly vague ("be careful", "improve quality", "try to avoid")
- **1:** All vague

### Axis 5: Definition of Done (1-10)
- **10:** Explicit "YOU ARE NOT DONE UNTIL" block with 5+ numbered criteria
- **7:** "Done when" list but less than 5 criteria
- **4:** Implicit (buried in prose)
- **1:** Missing entirely

### Axis 6: Pre-Made Decisions (1-10)
- **10:** Dedicated table with 5+ settled decisions
- **7:** Table exists but fewer than 5 rows
- **4:** Decisions scattered in prose
- **1:** No pre-made decisions documented

### Axis 7: Gotchas section (1-10)
- **10:** Table format with 5+ entries, each with Issue | Solution columns
- **7:** 3-4 gotchas in any format
- **4:** 1-2 gotchas
- **1:** No gotchas section

### Axis 8: Output format (1-10)
- **10:** Template showing exact markdown/JSON structure of what the agent produces
- **7:** Prose description of output
- **4:** Just "posts a report" with no template
- **1:** No mention of output

### Axis 9: HEARTBEAT numbered steps + Step 0/Final wiring (1-10)
- **10:** Numbered steps 1-N, explicit Step 0 "Read Your Lessons" at top, explicit final "Append Lessons Learned" before exit
- **7:** Numbered steps + Step 0 OR final append (not both)
- **4:** Numbered steps but no lessons wiring
- **1:** No HEARTBEAT.md file, or it's prose without steps

### Axis 10: Cost discipline (1-10)
- **10:** Explicit budget line: "Target $X/day, hard cap $Y/day, using <adapter>"
- **7:** Budget mentioned in Rules section but not quantified
- **4:** Mentions cost concern but no target
- **1:** No cost discussion

---

## Schedule Generation

**Schedule entries MUST include the company prefix.** Some agent slugs (like `ceo`) exist in BOTH `dirtsync/agents/` and `mcm-forge/agents/`, and they're different agents. Stripping the company would conflate them.

```bash
ls -d companies/*/agents/*/ 2>/dev/null | sort | sed 's|companies/||; s|/agents/|/|; s|/$||'
```

Output:
```
dirtsync/app-designer
dirtsync/ceo
mcm-forge/ceo
mcm-forge/factory-analyst
...
```

Example schedule (verified output as of 2026-04-09, 34 agents total):
```json
[
  "dirtsync/app-designer",
  "dirtsync/ceo",
  "dirtsync/code-scout",
  "dirtsync/critique-agent",
  "dirtsync/design-scout",
  "dirtsync/explore-ux-expert",
  "dirtsync/feature-builder",
  "dirtsync/ios-builder",
  "dirtsync/map-rendering-expert",
  "dirtsync/nav-hud-polish-expert",
  "dirtsync/presentation-builder",
  "dirtsync/qa-rider",
  "dirtsync/ship-engineer",
  "dirtsync/solutions-architect",
  "dirtsync/test-runner",
  "dirtsync/test-writer",
  "mcm-forge/auto-pr-writer",
  "mcm-forge/ceo",
  "mcm-forge/changelog-expert",
  "mcm-forge/code-reviewer",
  "mcm-forge/codex-expert",
  "mcm-forge/cost-regression-watcher",
  "mcm-forge/cto",
  "mcm-forge/dashboard-dogfood-auditor",
  "mcm-forge/factory-analyst",
  "mcm-forge/fleet-auditor",
  "mcm-forge/forge-builder",
  "mcm-forge/forge-coo",
  "mcm-forge/forge-qa",
  "mcm-forge/forge-reviewer",
  "mcm-forge/harness-doctor",
  "mcm-forge/prompt-auditor",
  "mcm-forge/release-engineer",
  "mcm-forge/skill-extractor"
]
```

34 agents / 4 per day = 9 days for full rotation.

When auditing `dirtsync/ceo`, read `companies/dirtsync/agents/ceo/AGENTS.md`. When auditing `mcm-forge/ceo`, read `companies/mcm-forge/agents/ceo/AGENTS.md`. Different files, different agents.

---

## LAST_AUDITED.json Schema

```json
{
  "schedule": ["agent-slug-1", "agent-slug-2", ...],
  "next_index": 0,
  "last_run_utc": "2026-04-10T13:00:00Z",
  "last_4_audited": [
    {
      "agent": "feature-builder",
      "score": 82,
      "axes": {
        "identity": 8,
        "frontmatter": 10,
        "skills_wiring": 10,
        "measurable": 8,
        "definition_of_done": 8,
        "pre_made_decisions": 6,
        "gotchas": 9,
        "output_format": 9,
        "heartbeat": 10,
        "cost_discipline": 4
      },
      "passed": true,
      "issue_filed": null
    }
  ],
  "rotation_week_avg": 74,
  "weeks_completed": 0
}
```

---

## Dedup Query

```sql
SELECT id, title, status
FROM forge.issues
WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd'
  AND title ILIKE '[prompt]%'
  AND status NOT IN ('done', 'cancelled', 'approved')
ORDER BY created_at DESC
LIMIT 30;
```

---

## Cost Targets

- 4 agents audited × 3 files each = 12 file reads (~30KB each = ~100K tokens total)
- 1 MASTER-SKILL-TEMPLATE read (~10K tokens)
- Scoring: ~5K tokens per agent output
- Issue drafting: ~3K tokens per issue filed (usually 0-2 issues/day)

Target: $0.20/day using Gemini Flash.
Hard cap: $0.50/day.
