# Skill: YouTube Niche Monitor

## Purpose
Track new videos from golf, overlanding, UTV, and trail riding YouTube channels. Detect trending topics, view velocity, and content gaps we can exploit. Feeds content strategy for DirtSync marketing and golf brand awareness.

## When to Use
- Scheduled: daily at 7 AM ET
- On-demand: before content planning sessions

## Companies
- **DirtSync** — trail/UTV/overlanding content trends
- **Links Choice** — golf ball review and deal content
- **Golf Ball Nut** — golf ball comparison content
- **Hot Golf Brands** — bulk golf ball content opportunities

## Channels to Monitor

### Trail / Off-Road / UTV
1. TrailsOffroad (official channel)
2. Hatfield-McCoy Trails (official)
3. UTV Driver
4. Dirt Trax TV
5. SuperATV
6. SXS Guys
7. Search: "UTV trail riding" — top 5 new videos this week
8. Search: "ATV trail app" — any new content

### Golf / Golf Balls
9. Rick Shiels Golf
10. Good Good
11. Golf Sidekick
12. MyGolfSpy
13. Search: "recycled golf balls" — any new content
14. Search: "used golf balls review" — any new content
15. Search: "golf ball comparison" — top 5 new videos this week

### Overlanding / Outdoor
16. Expedition Overland
17. Lifestyle Overland
18. Search: "off-road navigation app" — any new content

## Data Points Per Video
- **Title** and **description** (first 200 chars)
- **Views** and **view velocity** (views per day since publish)
- **Publish date**
- **Like/comment ratio** (engagement signal)
- **Tags/keywords** used
- **Duration** (short-form vs long-form trend)

## Execution Steps

### Step 1: Check Monitored Channels
For each channel:
- Fetch last 5 videos
- Check if any are new since last scan
- Extract data points

### Step 2: Run Keyword Searches
For each search query:
- YouTube search, sort by upload date (last 7 days)
- Top 5 results per query
- Flag any video mentioning DirtSync competitors or our golf brands

### Step 3: Detect Signals
- **Viral**: video got 10x the channel's average views → trending topic
- **Competitor mention**: video reviews OnX, AllTrails, or competitor golf sites
- **Content gap**: popular topic with few videos → opportunity for us
- **Negative review**: someone trashing a competitor → our opening

### Step 4: Generate Report

## Output Format
```markdown
# 🎥 YouTube Niche Monitor — [DATE]

## Hot Videos (High View Velocity)
| Channel | Title | Views | Days Old | Velocity | Relevant To |
|---------|-------|-------|----------|----------|-------------|
| UTV Driver | "Best Trail Apps 2026" | 45K | 3 | 15K/day | DirtSync |
| Rick Shiels | "Are Used Golf Balls Worth It?" | 120K | 5 | 24K/day | Links Choice |

## Competitor Mentions
- **OnX Offroad** mentioned in "Best Trail Apps 2026" — positive review, but complaints about price
- **Lost Golf Balls** mentioned in Rick Shiels video — shown as top used ball source

## Content Gaps (Opportunity)
- "UTV trail navigation" — only 3 videos in last 30 days. Low competition keyword.
- "recycled vs new golf balls" — high search intent, few recent comparison videos

## New Videos from Monitored Channels
- TrailsOffroad: "Spring Trail Openings 2026" (2 days ago, 8K views)
- Good Good: "Playing with $1 Golf Balls" (1 day ago, 200K views)

## Action Items
1. DirtSync: reach out to UTV Driver for app review/sponsorship
2. Golf Ball Nut: "recycled vs new" comparison is content gap — write blog or video script
```

## Model Recommendation
- **CLI**: Claude (YouTube Data API or web search)
- **Model**: haiku (lightweight data collection)
- **Timeout**: 10 minutes
- **Cost cap**: $0.50

## Gotchas
- YouTube Data API has daily quota limits (10,000 units) — cache results, don't re-fetch
- View counts are delayed by YouTube (up to 24h for exact counts)
- Some channels post Shorts — these inflate video count but are different content
- Subscriber count is a vanity metric — view velocity matters more
- Search results personalized by region — use US locale

## Schedule
Daily at 7 AM ET. Email summary only if viral video or competitor mention detected.

## Data Persistence
- Store daily scans in war room (company: mcmforge, type: youtube_monitor)
- Track view velocity over 7 days for trending analysis
- Monthly report: which topics got the most combined views

## Related Skills
- social-intel (Reddit/social monitoring)
- app-store-monitor (competitor app changes)
- google-trends-pulse (search volume correlation)
