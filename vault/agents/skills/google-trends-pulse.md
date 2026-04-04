# Skill: Google Trends Pulse

## Purpose
Track daily search volume trends for keywords relevant to all 5 companies. Detect rising interest, seasonal patterns, and emerging opportunities before competitors notice.

## When to Use
- Scheduled: daily at 5 AM ET (after price monitor and app store monitor)
- On-demand: before marketing decisions, content planning, or new product launches

## Companies
- **DirtSync** — trail/outdoor search trends
- **Links Choice** — recycled golf ball wholesale trends
- **Golf Ball Nut** — recycled golf ball retail trends
- **Hot Golf Brands** — bulk golf ball trends
- **MCM Forge** — AI ops/automation trends

## Keywords to Track

### DirtSync Keywords
- trail navigation app
- ATV trail maps
- UTV trail app
- off-road GPS
- Hatfield McCoy trails
- dirt bike trail finder
- offline trail maps
- side by side trail maps
- OHV trails near me

### Golf Ball Keywords (Links Choice / Golf Ball Nut / Hot Golf Brands)
- recycled golf balls
- used golf balls
- bulk golf balls
- cheap golf balls
- golf ball deals
- Pro V1 used
- refurbished golf balls
- lake balls golf
- golf balls wholesale

### MCM Forge Keywords
- AI automation platform
- AI agent orchestration
- autonomous AI agents
- Claude API
- AI ops

## Execution Steps

### Step 1: Query Google Trends
For each keyword group:
- Pull interest-over-time data (last 7 days vs previous 7 days)
- Pull related queries (rising and top)
- Pull geographic breakdown (US states)

### Step 2: Detect Signals
- **Breakout**: keyword jumped 100%+ week-over-week → urgent opportunity
- **Rising**: keyword up 20-99% → emerging trend
- **Declining**: keyword down 20%+ → market shift or seasonal
- **Seasonal**: compare to same week last year

### Step 3: Cross-Reference
- Rising trail keyword + DirtSync coverage gap = content/feature opportunity
- Rising golf ball keyword + our inventory = marketing push
- Competitor name trending = something happened (press, outage, launch)

### Step 4: Generate Report
Post to war room with relevant company tags.

## Output Format
```markdown
# 📊 Google Trends Pulse — [DATE]

## Breakout Keywords (100%+ increase)
| Keyword | Company | Change | Signal |
|---------|---------|--------|--------|
| "UTV trail app" | DirtSync | +250% | 🔥 Breakout — spring riding season starting |

## Rising Keywords (20-99%)
| Keyword | Company | Change | Signal |
|---------|---------|--------|--------|
| "bulk golf balls" | Hot Golf Brands | +45% | Tournament season approaching |
| "Hatfield McCoy trails" | DirtSync | +30% | WV riding season starting |

## Declining Keywords
| Keyword | Company | Change | Signal |
|---------|---------|--------|--------|
| "refurbished golf balls" | Golf Ball Nut | -15% | Seasonal dip (normal) |

## Related Rising Queries (NEW — not in our list)
- "best trail app for side by side" → DirtSync should target this
- "golf balls under $1 each" → Hot Golf Brands sweet spot

## Geographic Hotspots
- "ATV trail maps" spiking in WV, KY, TN → DirtSync launch region
- "bulk golf balls" spiking in FL, AZ → golf season in warm states

## Action Items
1. DirtSync: "UTV trail app" breakout — ensure App Store keywords include this
2. Hot Golf Brands: "bulk golf balls" rising — push ads in FL/AZ
```

## Model Recommendation
- **CLI**: Claude (web search for trends data)
- **Model**: sonnet
- **Timeout**: 15 minutes
- **Cost cap**: $1.00

## Gotchas
- Google Trends doesn't provide absolute numbers — only relative interest (0-100)
- Trends API unofficial — may need SerpApi or similar for reliable access
- Compare apples to apples: same time range, same geography
- Weekend vs weekday patterns differ — always compare same day of week
- Low-volume keywords show noisy data — focus on keywords with consistent baseline

## Schedule
Daily at 5 AM ET. Results posted to war room. Email only if breakout keywords detected.

## Data Persistence
- Store daily snapshots in war room (company: mcmforge, type: trends_pulse)
- Keep 90-day rolling history for seasonal analysis
- Monthly trend report: which keywords grew/shrunk over 30 days

## Related Skills
- competitive-scan (competitive intelligence)
- app-store-monitor (app-specific trends)
- competitor-price-monitor (pricing trends)
