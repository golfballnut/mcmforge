# Skill: App Store Monitor

## Purpose
Track competitor trail/outdoor apps on iOS App Store and Google Play. Detect new versions, rating changes, 1-star reviews (our opportunity), and feature additions. Critical intelligence for DirtSync competitive positioning.

## When to Use
- Scheduled: daily at 4 AM ET
- On-demand: before feature planning or competitive analysis

## Companies
- **DirtSync** — primary beneficiary (trail navigation competitor tracking)

## Apps to Track

### Direct Competitors (Trail/Off-Road)
1. **OnX Offroad** — iOS + Google Play
2. **Trails Offroad** — iOS + Google Play
3. **GAIA GPS** — iOS + Google Play
4. **AllTrails** — iOS + Google Play
5. **Avenza Maps** — iOS + Google Play

### Adjacent Competitors (Navigation/Outdoor)
6. **Waze** — reference for crowdsourced features
7. **CalTopo** — backcountry mapping
8. **Komoot** — route planning

## Data Points to Track
For each app:
- **Version**: current version number, last update date
- **Rating**: overall rating, rating count, recent trend (up/down)
- **Recent reviews**: last 10 reviews, focus on 1-star and 5-star
- **What's New**: release notes from latest version
- **Price**: free/paid/subscription tiers
- **Size**: app download size (indicator of feature bloat)

## Execution Steps

### Step 1: Check App Store Listings
For each app, scrape or API-query:
- iOS: App Store listing page
- Google Play: Play Store listing page
- Extract all data points listed above

### Step 2: Detect Changes
Compare to previous day's data:
- New version released? → Read "What's New" notes
- Rating dropped? → Check recent 1-star reviews for patterns
- Rating jumped? → Check what they shipped

### Step 3: Analyze 1-Star Reviews (Gold Mine)
1-star reviews tell us what competitors are failing at:
- "App crashes when..." → reliability gap we can exploit
- "Can't find trails in..." → coverage gap we can fill
- "Too expensive for..." → pricing opportunity
- "Wish it had..." → feature we should build

### Step 4: Generate Report
Post to war room with DirtSync company tag.

## Output Format
```markdown
# 📱 App Store Monitor — [DATE]

## Version Changes
| App | Old Version | New Version | Key Changes |
|-----|------------|-------------|-------------|
| OnX Offroad | 5.2.1 | 5.3.0 | Added trail difficulty ratings |

## Rating Watch
| App | Rating | Change (7d) | Review Count |
|-----|--------|-------------|--------------|
| AllTrails | 4.8 | -0.01 | 1.2M |
| OnX Offroad | 4.7 | +0.02 | 89K |

## Competitor Pain Points (1-Star Reviews)
### OnX Offroad
- "Subscription is $30/year just to see trails offline" — PRICING OPPORTUNITY
- "GPS tracking drains battery in 2 hours" — BATTERY OPTIMIZATION OPPORTUNITY

### AllTrails
- "No off-road or ATV trails" — COVERAGE GAP (our sweet spot)

## Opportunities for DirtSync
1. OnX raised subscription price → position DirtSync as affordable alternative
2. AllTrails users complaining about no ATV content → our differentiator
```

## Model Recommendation
- **CLI**: Claude (Playwright for app store scraping)
- **Model**: sonnet
- **Timeout**: 15 minutes
- **Cost cap**: $1.00

## Gotchas
- App Store pages are JavaScript-heavy — need Playwright, not simple fetch
- Google Play layout changes frequently — selectors may break
- Rate limit: 10-second delays between app lookups
- Some review data requires scrolling/pagination
- App Store search results vary by region — use US store

## Schedule
Daily at 4 AM ET. Results posted to war room + email if significant changes detected.

## Data Persistence
- Store daily snapshots in war room (company: dirtsync, type: app_store_monitor)
- Keep 30-day rolling history for trend analysis
- Flag any app that releases 2+ updates in a week (shipping fast = threat)

## Related Skills
- competitive-scan (broader competitive intelligence)
- google-trends-pulse (search volume for competing terms)
