# Skill: Competitor Job Postings

## Purpose
Monitor competitor career pages for new job postings. What they hire reveals what they're building next — a backend ML engineer means recommendation features, a CarPlay developer means vehicle integration, a "Head of Partnerships" means B2B push. Cheapest competitive intelligence there is.

## When to Use
- Scheduled: weekly on Wednesday at 7 AM ET (job postings don't change daily)
- On-demand: before strategic planning sessions

## Companies
- **DirtSync** — trail app competitors
- **Links Choice / Golf Ball Nut** — golf ball competitors

## Competitors to Monitor

### Trail / Outdoor Apps
1. **OnX** (onxmaps.com/careers) — Hunt, Offroad, Backcountry
2. **AllTrails** (alltrails.com/careers)
3. **GAIA GPS / Outside Inc** (outsideinc.com/careers)
4. **Trails Offroad** (small — check LinkedIn)
5. **Komoot** (komoot.com/jobs)
6. **CalTopo** (small — check LinkedIn)

### Golf Ball Competitors
7. **Lost Golf Balls** (lostgolfballs.com — check LinkedIn/Indeed)
8. **Golf Ball Planet** (LinkedIn/Indeed)
9. **Vice Golf** (vicegolf.com/careers)
10. **Acushnet / Titleist** (acushnetholdingscorp.com/careers) — the upstream giant

## Job Categories to Flag
- **Engineering — Mobile/iOS/Android**: building or improving their app
- **Engineering — ML/AI/Data**: recommendations, personalization, automation
- **Engineering — Maps/GIS/Spatial**: improving their mapping (direct DirtSync competitor move)
- **Product Manager**: new product lines coming
- **Head of Partnerships / BD**: B2B push, likely trail system or brand deals
- **Marketing / Growth**: scaling user acquisition
- **Supply Chain / Procurement**: (golf competitors) expanding sourcing
- **Content / Community**: building moat through user content

## Execution Steps

### Step 1: Scrape Career Pages
For each competitor:
- Check careers page for current openings
- Check LinkedIn "Jobs" filtered by company
- Check Indeed/Glassdoor for additional postings

### Step 2: Compare to Previous Week
- New postings since last scan = signal
- Removed postings = either filled or cancelled
- Track total headcount growth trend

### Step 3: Decode the Strategy
For each new posting, answer:
- What capability are they building?
- How does this threaten us?
- Can we build it faster with agents instead of hiring?

### Step 4: Generate Report

## Output Format
```markdown
# 👔 Competitor Job Postings — Week of [DATE]

## New Postings This Week
| Company | Role | Location | Signal |
|---------|------|----------|--------|
| OnX | Senior iOS Engineer — CarPlay | Bozeman, MT | 🚨 CarPlay integration coming |
| OnX | ML Engineer — Trail Recommendations | Remote | AI-powered trail suggestions |
| AllTrails | Head of Partnerships | SF | B2B push — trail system deals |
| Lost Golf Balls | Warehouse Manager | FL | Scaling operations |

## Strategic Implications
### DirtSync Threats
- OnX hiring for CarPlay → they'll have it in 3-6 months. We need to ship CarPlay first.
- OnX ML engineer → personalized trail recommendations. We should build this as a skill.

### Golf Ball Threats
- Lost Golf Balls scaling warehouse → preparing for volume growth. Check if they're undercutting prices.

## What We Can Build Faster (Agent vs Hire)
| Their Hire | Our Equivalent | Build Time | Cost |
|-----------|---------------|-----------|------|
| ML Engineer (recommendations) | skill: trail-recommender | 2 days | $5 |
| Partnership Manager | skill: gmail-draft-outreach | built | $1/week |
| Content Creator | skill: youtube-niche-monitor + AI content | 1 day | $0.50/day |

## Headcount Trends (Rolling 4 Weeks)
| Company | 4 Weeks Ago | Now | Trend |
|---------|-------------|-----|-------|
| OnX | 12 openings | 15 | ↑ Growing |
| AllTrails | 8 openings | 6 | ↓ Slowing |
| Vice Golf | 3 openings | 5 | ↑ Growing |
```

## Model Recommendation
- **CLI**: Claude (web scraping + LinkedIn)
- **Model**: haiku (lightweight data collection)
- **Timeout**: 10 minutes
- **Cost cap**: $0.50

## Gotchas
- LinkedIn rate limits aggressively — use search, don't scrape profiles
- Some companies post on Lever, Greenhouse, Workday — check the actual ATS URL
- "Remote" postings may be region-locked — note any geographic restrictions
- Job postings stay up after filling — track when they disappear too
- Small companies (Trails Offroad, CalTopo) may not have career pages — LinkedIn only
- Acushnet is public — their 10-K mentions headcount and hiring plans

## Schedule
Weekly on Wednesday at 7 AM ET. Email only if a competitor posts a role that directly threatens our roadmap.

## Data Persistence
- Store weekly scans in war room (company: mcmforge, type: competitor_jobs)
- Maintain rolling 4-week history for trend tracking
- Flag any company that posts 5+ roles in a week (hiring sprint = something big coming)

## Related Skills
- competitive-scan (broader competitive intelligence)
- app-store-monitor (what they shipped vs what they hired for)
