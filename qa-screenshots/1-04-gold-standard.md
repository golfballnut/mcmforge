--gws_boundary_8bfc4b1df625ad63
Content-Type: application/json; charset=UTF-8

{"name":"1-04-research-reviews-GOLD-STANDARD","parents":["12TYZUn_la5uSKRSvIdcYZIOkMX0t8Fpu"]}
--gws_boundary_8bfc4b1df625ad63
Content-Type: text/markdown

---
name: research-reviews
description: Mine app store reviews from competitors to extract pain points, feature requests, and opportunities. Use when running 1-04, analyzing app reviews, or extracting user insights from competitors.
---

# Research Reviews

Mine app store reviews from competitors and north star apps to understand what users love, hate, and wish for. Extract actionable insights that inform product decisions.

## Prerequisites

- `docs/research/competitor-analysis.md` exists (from 1-03)
- `docs/research/north-star-selection.md` exists (from 1-01)
- Access to App Store / Google Play for review research

## Definition of Done

**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**

1. Reviews analyzed for TOP 5 competitors from competitor-analysis.md (20-30 per app)
2. Top 5-10 pain points documented with frequency indicators
3. Top 5-10 feature requests cataloged
4. Positive patterns identified (what works well)
5. Opportunity matrix created showing market gaps
6. Main insights doc at `docs/research/review-insights.md`
7. Per-app review notes appended to competitor profiles
8. Checklist updated

**If you only reviewed some apps, you are NOT done. Check competitor-analysis.md for the full list.**

## Folder Structure

**Outputs go in docs/research/**

```
docs/research/
├── review-insights.md          ← Main findings document
├── competitors/
│   ├── carfax.md               ← Append review section here
│   ├── drivvo.md
│   └── ...
├── competitor-analysis.md      ← From 1-03 (reference)
└── north-star-selection.md     ← From 1-01 (reference)
```

**Why this structure:**
- Review insights complement existing competitor profiles
- Single synthesis doc for easy consumption
- Per-app details stay with their profiles

---

## Process

### Step 1: Gather Context

Read existing research:

```
Read: docs/research/competitor-analysis.md
Read: docs/research/north-star-selection.md
```

Build list of top 5 competitors to analyze (prioritize direct competitors over adjacent).

### Step 2: Get User Approval

**STOP HERE AND ASK USER TO APPROVE THE LIST**

Present the 5 apps you'll analyze before diving in:

```
## Proposed Apps for Review Analysis (5 apps)

| # | App | Type | Why Prioritize |
|---|-----|------|----------------|
| 1 | CARFAX | Direct | Market leader |
| 2 | Drivvo | Direct | UX benchmark |
| ... | ... | ... | ... |

Approve this list before I proceed?
```

### Step 3: Determine Collection Method

**Pre-decided:** Web search for review insights (see Pre-Made Decisions).

For each app, use:
- Web search: "[app name] app store reviews 2024" or "[app name] user complaints"
- Review summary articles and roundups
- App store page descriptions (ratings, review counts)

**Note:** You're searching for review *insights* and *patterns*, not scraping raw reviews. Articles like "CARFAX app reviews: what users say" are ideal sources.

### Step 4: Create Output Files

```bash
touch docs/research/review-insights.md
```

### Step 5: Collect Review Insights Per App

For each competitor (20-30 review insights each):

**Focus Areas:**
- **1-3 star reviews (60%)** - Pain points and opportunities
- **4-5 star reviews (40%)** - What users love, what to replicate

**Capture These Details:**
- Star rating
- Key complaint or praise
- Feature mentioned (if any)
- Category (UX, bugs, features, pricing, support)
- Frequency indicator (common, occasional, rare)

**Look For:**
- "I wish this app..." - Direct feature requests
- "Why can't I..." - Missing functionality
- "Love how easy..." - UX wins to replicate
- Comparisons to other apps - Competitive insights
- Rating changes ("Updated to 4 stars after...") - What fixes matter

### Step 6: Categorize Findings

Group all findings into these categories:

1. **Pain Points** - Common complaints across apps
2. **Feature Requests** - What users are asking for
3. **Praise Patterns** - What users consistently love
4. **UX Issues** - Navigation, onboarding, complexity
5. **Reliability Issues** - Bugs, crashes, sync problems
6. **Support Issues** - Response time, resolution quality
7. **Pricing Complaints** - Value perception, subscription fatigue

### Step 7: Build Opportunity Matrix

In `docs/research/review-insights.md`, create:

```markdown
## Opportunity Matrix

| Opportunity | Frequency | Competitors Affected | Vinzo Opportunity |
|-------------|-----------|---------------------|-------------------|
| [Pain point] | High/Med/Low | App1, App2, App3 | [How we address] |
```

Focus on:
- Pain points that appear across ALL competitors (market-wide opportunity)
- Feature requests that no one has addressed
- UX problems that seem fixable

### Step 8: Append Per-App Insights

For each competitor profile (`docs/research/competitors/[app].md`), append:

```markdown
## Review Insights

**Reviews Analyzed:** X reviews (date range)
**Average Rating:** X.X

### Top Complaints
1. [Complaint] - Frequency
2. [Complaint] - Frequency

### Top Praise
1. [Praise] - Frequency
2. [Praise] - Frequency

### Notable Feature Requests
- [Request]
- [Request]
```

### Step 9: Synthesize Final Document

Create final `docs/research/review-insights.md` with:

1. **Executive Summary** - Top 3-5 insights
2. **Pain Points Ranked** - By frequency and severity
3. **Feature Requests Ranked** - By demand
4. **Praise Patterns** - What to replicate
5. **Opportunity Matrix** - Gaps to exploit
6. **Recommendations** - Actionable next steps

See [templates/review-insights-template.md](templates/review-insights-template.md) for format.

---

## Pre-Made Decisions

**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Number of apps | Top 5 competitors (prioritize direct over adjacent) |
| Reviews per app | 20-30 insights per app |
| Star rating focus | All, with focus on 1-3 stars (60%) |
| Analysis method | Web search for review articles/summaries |
| Timeframe | Last 6-12 months |
| Language scope | English only |
| Output location | `docs/research/review-insights.md` |
| Per-app notes | Append to existing competitor profiles |
| User approval | Required before deep-dive |

---

## Checklist

### Before Starting
- [ ] Read competitor-analysis.md
- [ ] Read north-star-selection.md
- [ ] Listed top 5 apps to review
- [ ] Got user approval on app list

### Per App (×5)
- [ ] 20-30 review insights gathered
- [ ] Pain points documented
- [ ] Feature requests noted
- [ ] Positive patterns captured
- [ ] Notes appended to competitor profile

### After All Apps
- [ ] review-insights.md created
- [ ] Opportunity matrix complete
- [ ] Top insights synthesized
- [ ] Recommendations documented

---

## Gotchas

**READ THIS BEFORE STARTING**

| Issue | Solution |
|-------|----------|
| Skipping user approval | ALWAYS get app list approved first (Step 2) |
| Trying to scrape raw reviews | Use web search for review articles/summaries instead |
| Analyzing all 8 competitors | Focus on top 5 only |
| Only reading 5-star reviews | Focus on 1-3 star reviews for opportunities |
| Ignoring positive feedback | 5-star reviews reveal what to replicate |
| Not categorizing findings | Group by theme: UX, bugs, features, pricing, support |
| Missing recent reviews | Filter to last 6-12 months for relevance |
| Over-indexing on outliers | Look for repeated patterns, not single complaints |
| No frequency tracking | Note how often each issue appears |
| Analysis paralysis | Time-box to 2-3 hours total |

---

## Research Tools

- **App Store / Google Play** - Direct review browsing
- **Web Search** - "[app name] reviews 2024/2025"
- **AppFollow** - Review monitoring (paid)
- **SensorTower** - Review sentiment analysis (paid)

---

## When Done

1. Update `docs/workflow/artifacts/phase-1/1-04-research-reviews/checklist.md`
2. Tell human to add verification screenshot to `verified/` folder
3. Note any learnings in [learnings.md](learnings.md)
4. Hand back to CEO

--gws_boundary_8bfc4b1df625ad63--
