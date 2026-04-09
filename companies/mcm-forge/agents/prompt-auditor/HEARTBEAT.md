# HEARTBEAT.md — MCM Forge Prompt Auditor

Run this on every wake. You audit 4 agents per day against the MASTER-SKILL-TEMPLATE.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons about false positives in scoring, or gotchas that tripped you up on specific agent file structures.
3. Apply any calibration lessons from past runs.

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Load State

Read `companies/mcm-forge/agents/prompt-auditor/LAST_AUDITED.json`. This file contains:
- `schedule` — ordered list of all agents (auto-generated alphabetically)
- `next_index` — position in the rotation (0 to len(schedule)-1)
- `last_run_utc` — ISO timestamp of last audit

If the file is empty or `schedule` is stale (doesn't match current `companies/*/agents/*/` list), regenerate the schedule alphabetically.

## 2. Regenerate Schedule (if needed)

**CRITICAL:** schedule entries MUST include the company prefix to distinguish agents that share a slug across companies (e.g. `dirtsync/ceo` vs `mcm-forge/ceo`). Stripping the company would conflate them.

```bash
ls -d companies/*/agents/*/ 2>/dev/null | sort | sed 's|companies/||; s|/agents/|/|; s|/$||'
```

Output format: `<company>/<agent-slug>` — e.g.:
```
dirtsync/app-designer
dirtsync/ceo
dirtsync/feature-builder
mcm-forge/ceo
mcm-forge/factory-analyst
mcm-forge/harness-doctor
...
```

Compare to `schedule` in LAST_AUDITED.json. If different:
- New `<company>/<slug>` entries → append to end of schedule
- Removed entries → drop from schedule
- `next_index` stays pointing at the same agent (if still present)

When you read an agent's files in step 5, the path is `companies/<company>/agents/<slug>/AGENTS.md`.

## 3. Pick Today's 4 Agents

Take `schedule[next_index]` through `schedule[next_index + 3]`, wrapping around if needed.

## 4. Load MASTER-SKILL-TEMPLATE Reference

Read `vault/agents/skills/MASTER-SKILL-TEMPLATE.md` — this is your rubric source. Pay attention to:
- The 10 principles
- Directory structure
- SKILL.md format (frontmatter + Goal + Definition of Done + Pre-Made Decisions + Gotchas + Checklist)
- Skill Quality Checklist at the bottom

## 5. Audit Each Agent

For each of the 4 agents:

### 5a. Read the files
- `AGENTS.md` (full content)
- `HEARTBEAT.md` (full content)
- `LESSONS.md` (just the first 20 entries)

### 5b. Score on 10 axes

Use the rubric in AGENTS.md:
1. Identity clarity (1-10)
2. Frontmatter completeness (1-10)
3. Skills wiring — `lessons-learned-loop` present? (1-10)
4. Measurable acceptance (1-10)
5. Definition of Done block (1-10)
6. Pre-Made Decisions table (1-10)
7. Gotchas section (3+ concrete entries) (1-10)
8. Output format template (1-10)
9. HEARTBEAT numbered steps with Step 0 + final append (1-10)
10. Cost discipline (1-10)

Total = sum (0-100).

### 5c. Collect evidence

For every axis scoring below 7, copy 1-3 actual quotes from the file as evidence. No paraphrasing.

### 5d. Draft proposed edits

For every axis scoring below 7, draft a concrete edit:
- File path
- Old text (or "missing")
- New text
- One-sentence rationale

## 6. Decide What to File

For each audited agent:
- **Score >= 70 AND no axis < 4:** PASS. Record in digest. No issue.
- **Score < 70 OR any axis < 4:** file a Forge issue.
- **Score < 50:** file a HIGH priority Forge issue.

## 7. Dedup Check

Before filing, query existing `[prompt]` issues:

```sql
SELECT id, title, status FROM forge.issues
WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd'
  AND title ILIKE '[prompt] <agent name>%'
  AND status NOT IN ('done', 'cancelled', 'approved');
```

If a duplicate exists, comment on it with updated score instead of filing a new one:
```
Re-audit <date>: score <X/100> (previously <Y/100>). <better|same|worse>
```

## 8. File Issues

For each non-duplicate agent below threshold, POST to the agent API per AGENTS.md template.

Set `priority`:
- Score < 50 → `high`
- Score 50-69 → `medium`
- Score 70+ → no issue (PASS)

`assignee_agent_id`: null. Let COO or the audited agent self-improve on wake.

## 9. Update State

Write to `LAST_AUDITED.json`:
```json
{
  "schedule": ["agent1", "agent2", ...],
  "next_index": <old_index + 4, wrapping>,
  "last_run_utc": "<now>",
  "last_4_audited": [
    { "agent": "agent1", "score": 82, "passed": true, "issue_filed": null },
    { "agent": "agent2", "score": 64, "passed": false, "issue_filed": "<uuid>" }
  ]
}
```

## 10. Post Daily Digest

Post to your own routine issue per AGENTS.md template. Include the rotation status, scores, and trends.

## 11. Append Lessons Learned (MANDATORY — before exit)

For every non-trivial gotcha this run (a scoring axis that was hard to evaluate, an agent file structure you hadn't seen before, a false positive you caught), append an entry to the TOP of `companies/mcm-forge/agents/prompt-auditor/LESSONS.md`. Commit with your work.

## 12. Exit

Clean exit. Digest + any filed issues are your deliverables.
