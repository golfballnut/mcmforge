# Skill: Skill Gotchas Flywheel

## Purpose
Meta-skill that makes all other skills smarter over time. Reads recent task failures, success patterns, and skill_metrics data, then proposes targeted improvements (gotchas, execution steps, output format tweaks) to the skills that need them most. This is the autoresearch engine for skill quality.

## When to Use
- Scheduled: nightly at 11 PM ET (after all daily skills have run)
- On-demand: after a skill fails or underperforms

## Companies
- **MCM Forge** — meta-skill, benefits all companies

## How It Works

### The Full Loop
```
11 PM: Read failures → Analyze → Propose fixes as Google Docs → Link in email
 6 AM: Steve gets daily brief with proposal links
 Morning: Steve taps link → reads BEFORE/AFTER → comments "Approved" or "Rejected: reason"
11 PM: Flywheel checks comments → merges approved → logs rejected → never re-proposes rejected fixes
```

This is the autoresearch pattern: Modify → Verify → Keep/Discard → Repeat.

## Execution Steps

### Step 1: Read Recent Task Results
Query task_queue for the last 24 hours:
- All tasks with status = `done` (successes)
- All tasks with status = `blocked` or failed execution
- Filter to tasks that used a skill (skill_name IS NOT NULL)

### Step 2: Analyze Failures
For each failed/blocked task:
- What skill was used?
- What was the error or failure reason?
- Is this a repeating failure? (same skill failed 2+ times this week)
- Root cause categories:
  - **Timeout**: skill took too long → increase timeout or reduce scope
  - **Data access**: couldn't reach a source → add fallback source or retry logic
  - **Output quality**: task completed but output was poor → tighten output format
  - **Hallucination**: agent made up data → add verification step
  - **Rate limit**: API/site blocked → add delays or alternative source
  - **Context overflow**: too much data → add pagination or summarization

### Step 3: Analyze Successes
For each successful task:
- What skill was used?
- Was completion time within budget? (under/over timeout)
- Was cost within budget? (under/over cost cap)
- Check skill_metrics: is this skill's success rate trending up or down?

### Step 4: Check Rejection Ledger (BEFORE proposing)
Read the rejection ledger (Google Sheet: "Skill Flywheel Decisions"):
- Has a similar fix been rejected before? → **DO NOT re-propose**
- Has a similar fix been approved for a different skill? → Propose with higher confidence
- "Similar" = same root cause category + same skill section being modified

### Step 5: Propose Improvements
For each skill that failed or underperformed (and passes the rejection ledger check):
- Draft a specific fix (new gotcha, modified execution step, adjusted timeout)
- Create a Google Doc in `MCM Forge > Skills` folder
- Name: `PROPOSAL-skill-NAME-YYYY-MM-DD.md`
- Doc format:

```markdown
# Proposed Fix: [skill-name]
**Date:** [DATE]
**Root Cause:** [what failed and why]
**Priority:** [1-5, with justification]

## BEFORE (current skill text)
> [exact text being changed, quoted]

## AFTER (proposed change)
> [new text with change highlighted]

## Why This Fix
[1-2 sentences explaining why this fixes the root cause]

## Expected Impact
- Success rate: [current]% → [expected]%
- Affects [N] runs per [day/week]

---
**To approve:** Comment "Approved"
**To reject:** Comment "Rejected: [your reason]"
```

### Step 6: Score and Prioritize
Rank proposed improvements by:
- **Impact**: how often does this skill run? (daily > weekly)
- **Severity**: failure vs underperformance
- **Effort**: one-line gotcha vs rewrite of execution steps
- Priority = Impact × Severity / Effort

### Step 7: Include Links in Daily Brief Email
Add a "Skill Improvements" section to the 6 AM morning brief email:
```
🔧 Skill Improvements Proposed Last Night (2 proposals):

1. poi-research: Batch systems with 50+ POIs (fixes 33% failure rate)
   → Review: https://docs.google.com/document/d/[DOC_ID]

2. social-intel: Add 15s delay between Reddit scans (prevents rate limits)
   → Review: https://docs.google.com/document/d/[DOC_ID]

⏱️ Takes ~2 min to review. Tap link, read BEFORE/AFTER, comment Approved or Rejected.
```

### Step 8: Process Previous Day's Decisions
Before proposing new fixes, check yesterday's proposal docs for comments:

**If comment = "Approved":**
1. Read the AFTER text from the proposal doc
2. Update the vault skill .md file with the approved change
3. Upload the updated skill to Google Drive (overwrite existing)
4. Log to rejection ledger: date, skill, fix, "Approved", —
5. Delete the proposal doc (clean up)
6. Add to nightly report: "Merged: [skill] — [fix description]"

**If comment = "Rejected: [reason]":**
1. Log to rejection ledger: date, skill, fix, "Rejected", reason
2. Delete the proposal doc (clean up)
3. Add to nightly report: "Rejected: [skill] — [fix] — Reason: [reason]"
4. **CRITICAL**: Before future proposals, check if the new proposal matches a rejected pattern. Match on: same skill + same root cause category + same section being modified. If match → skip.

**If no comment (after 48 hours):**
1. Log to rejection ledger: date, skill, fix, "Expired", "No action taken"
2. Delete the proposal doc
3. Do NOT re-propose the same fix — treat as soft rejection

## Rejection Ledger (Google Sheet)
Sheet name: "Skill Flywheel Decisions"
Location: Google Drive > MCM Forge > Skills folder

| Date | Skill | Proposed Fix | Root Cause Category | Decision | Reason | Proposal Doc ID |
|------|-------|-------------|-------------------|----------|--------|----------------|
| 2026-03-21 | poi-research | Batch large systems | timeout | Approved | — | (deleted) |
| 2026-03-21 | social-intel | Add 15s delay | rate_limit | Rejected | "Transient issue, don't slow skill" | (deleted) |
| 2026-03-22 | social-intel | Add retry logic | rate_limit | — | — | abc123 |

Before proposing, query this sheet:
```
IF skill = [target skill] AND root_cause_category = [this cause] AND decision = "Rejected"
THEN skip — COO already said no to this type of fix for this skill
```

## Output Format
```markdown
# 🔧 Skill Gotchas Flywheel — [DATE]

## Decisions Processed (from yesterday's proposals)
- ✅ MERGED: poi-research — batch large systems (was 67% → expect 90%+)
- ❌ REJECTED: social-intel — 15s delay — Reason: "Transient, don't slow it down"
- ⏳ EXPIRED: competitive-scan — add fallback URL (no action after 48h)

## Skills Health Dashboard
| Skill | Runs (24h) | Success Rate | Avg Time | Avg Cost | Trend |
|-------|-----------|-------------|----------|----------|-------|
| poi-research | 3 | 67% | 17 min | $1.80 | ↓ declining |
| competitive-scan | 1 | 100% | 8 min | $0.90 | → stable |
| ai-daily-intel | 1 | 100% | 5 min | $0.40 | → stable |

## New Proposals (links in morning email)
| Priority | Skill | Proposed Fix | Impact | Doc Link |
|----------|-------|-------------|--------|----------|
| 1 | poi-research | Reduce POI categories from 17 to 10 for large systems | -40% timeout risk | [link] |
| 2 | app-store-monitor | Cache app metadata between runs | -50% API calls | [link] |

## Skipped (Rejection Ledger Match)
- social-intel: rate_limit fixes — COO rejected similar fix on 3/21

## Metrics Summary
- Total skill runs today: 12
- Overall success rate: 91.7%
- Total cost: $8.40
- Skills improving: 3 | Stable: 4 | Declining: 1
- Proposals pending review: 2
- Proposals merged this week: 4
- Proposals rejected this week: 1
```

## Model Recommendation
- **CLI**: Claude (database queries + Google Drive API + analysis)
- **Model**: sonnet (needs reasoning for root cause analysis)
- **Timeout**: 15 minutes
- **Cost cap**: $1.00

## Gotchas
- Only propose changes that are specific and testable — not vague "improve quality"
- One proposed change per doc — don't bundle multiple fixes (easier to approve/reject individually)
- Check rejection ledger BEFORE proposing — never re-propose a rejected fix type
- Success rate trending DOWN over 7 days is more concerning than a single failure
- Some failures are environmental (network, API outage) not skill problems — don't over-correct for transient issues
- Always include the BEFORE and AFTER of the proposed change so COO can see the diff
- Proposals older than 48 hours with no comment = soft rejection. Archive and move on.
- Track approval RATE — if COO rejects >50% of proposals, the flywheel is proposing too aggressively. Tighten the proposal threshold.

## Schedule
Nightly at 11 PM ET. Report posted to war room. Proposal links included in 6 AM morning brief email.

## Data Persistence
- **task_queue + skill_metrics**: source of truth for skill performance
- **Google Docs**: proposal documents (temporary — deleted after decision)
- **Google Sheet "Skill Flywheel Decisions"**: rejection ledger (permanent — checked before every proposal)
- **Vault .md files**: updated when proposals are approved
- **Google Drive > MCM Forge > Skills**: updated copies of skill docs

## Related Skills
- All skills (this skill improves all of them)
- plan-reviewer (quality gate for task execution)
- orchestrator (routes tasks to skills)
- daily-ops (morning brief includes proposal links)
