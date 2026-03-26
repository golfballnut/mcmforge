---
name: revenue-analyst
description: >
  Daily revenue opportunity brief — reads overnight skill artifacts, identifies
  top money moves, drafts specific actions for Steve to approve/reject.
  Triggers on: revenue opportunities, money moves, what should I do today,
  daily revenue, pricing actions, procurement actions, morning money brief,
  revenue brief, what's making money, where's the opportunity.
allowed-tools: Read, Grep, Bash(curl *), mcp__supabase__execute_sql
context: fork
model: sonnet
---

## Goal
Read ALL completed skill artifacts from the last 24 hours. Synthesize them into the TOP 5 revenue actions Steve can take TODAY. Each action must be specific enough to execute in under 5 minutes (approve a price change, send a draft email, list an item).

**This skill is the bridge between intelligence and revenue. If it doesn't produce actionable moves, we wasted every dollar on the skills that fed it.**

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. All completed artifacts from last 24h fetched and read
2. Cross-referenced findings across skills (price + supplier + trends = opportunity)
3. Exactly 3-5 MONEY MOVES produced, each with:
   - One-line action (what to do)
   - Dollar estimate (how much it's worth)
   - Urgency (do today / this week / watch)
   - Source skill(s) that surfaced it
4. Each move has a DRAFT ACTION ready (email draft, price recommendation, listing text)
5. Report posted to war room
6. Email sent to Steve with the 3-5 moves formatted for phone reading

## Pre-Made Decisions

| Decision | Answer |
|----------|--------|
| How many moves | 3-5. Not 10. Not 1. Exactly enough to act on in 15 min. |
| Dollar threshold | Only include if estimated impact > $100/month |
| Source artifacts | Supabase storage bucket `artifacts/` — fetch completed tasks from last 24h |
| Companies covered | Links Choice (procurement), Golf Ball Nut (pricing), Hot Golf Brands (listings) |
| DirtSync | Excluded — pre-revenue. Only include if trail closure affects field test. |
| MCM Forge | Excluded — infrastructure, not revenue. |
| Schedule | Daily 9 AM ET (13 UTC) — after all morning skills complete |
| Cost cap | $1.50 per run |

## Context
- Last run: !`cat ${CLAUDE_SKILL_DIR}/data/last-run.json 2>/dev/null || echo "First run"`
- Today: !`date +%Y-%m-%d`

## Step-by-Step Execution

### Step 1: Gather overnight artifacts
```sql
SELECT id, title, skill_name, result_summary, artifact_url, completed_at
FROM task_queue
WHERE status = 'done'
  AND completed_at >= NOW() - INTERVAL '24 hours'
ORDER BY completed_at DESC;
```

### Step 2: Fetch and read each artifact
Download each `artifact_url` and extract key findings. Focus on:
- **competitor-price-monitor**: Price gaps > 15%, competitor stockouts, sale events
- **supplier-news-monitor**: New model launches (old model flood incoming), price increases, discontinuations
- **google-trends-pulse**: Rising search terms for products we sell, declining terms for products to liquidate
- **social-intel**: Customer complaints about competitors (our opportunity), demand signals
- **app-store-monitor**: Competitor weaknesses (for DirtSync field test timing only)
- **youtube-niche-monitor**: Content gaps, trending products
- **competitor-job-postings**: Strategic signals (hiring = investing in X)
- **github-repo-scout**: Ignore for revenue purposes

### Step 3: Cross-reference and identify moves
The best opportunities come from COMBINING signals:
- Price gap + rising trends = raise our price NOW
- Supplier news (new model) + competitor stockout = buy old model inventory before competitors
- Declining trends + high inventory = liquidate before it gets worse
- Competitor complaint + our strength = targeted outreach/content

### Step 4: Draft specific actions
For each move, create the actual next step:
- **Price change**: "Change [SKU] from $X to $Y on [platform]. Reason: [competitor data]."
- **Buy signal**: "Contact [supplier] about [product]. Target price: $X/unit. Volume: [N] units."
- **Liquidation**: "List [N] units of [SKU] on eBay at $X. Current market: $Y. Days in inventory: [N]."
- **Outreach**: "Draft email to [prospect] about [opportunity]. Template: [type]."
- **Content**: "Post about [topic] — trending +X% this week."

## Gotchas

| Issue | Solution |
|-------|----------|
| Artifact URLs may 404 | Check HTTP status, skip gracefully, note in report |
| result_summary is often truncated/garbled | Always fetch the full artifact, don't rely on summary |
| Skills sometimes produce empty reports | Note "no data from [skill]" — don't fabricate findings |
| Dollar estimates are imprecise | Say "estimated $X-Y/month" — ranges are honest |
| Some skills didn't run (stuck/failed) | Note which skills had no output — this is a system health signal |

## Output Format

Subject: "MCM Revenue Brief — [date] — [N] moves, ~$[X] opportunity"

```
REVENUE BRIEF — March 27, 2026
================================

MOVE 1: [ACTION] — ~$X/month
Urgency: DO TODAY
Source: price-monitor + trends
Action: [specific 1-sentence instruction]
Draft: [the actual text/numbers Steve needs]

MOVE 2: [ACTION] — ~$X/month
Urgency: THIS WEEK
Source: supplier-news
Action: [specific 1-sentence instruction]
Draft: [the actual text/numbers Steve needs]

...

SKILLS THAT DIDN'T REPORT (gaps in intel):
- supplier-news: didn't run (check dispatcher)
- gmail-outreach: no drafts created

OVERNIGHT STATS:
- X skills ran, Y produced actionable intel
- Total artifacts: Z
```

## Reference Files
- Company pricing context: [references/pricing-context.md]

## After Running
- Update data/last-run.json with today's date, move count, skills consumed
- If gmail-draft-outreach hasn't run in 7+ days, flag as P0 blocker in the report
