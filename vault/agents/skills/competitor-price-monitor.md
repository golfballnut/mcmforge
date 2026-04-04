# Skill: Competitor Price Monitor

## Purpose
Track competitor pricing daily for recycled golf ball SKUs across top competitors. Alert when price gaps open that create buying or pricing opportunities for Links Choice and Golf Ball Nut.

## When to Use
- Scheduled: daily at 3 AM ET
- On-demand: before pricing decisions, inventory buys, or promotional campaigns

## Companies
- **Links Choice** — wholesale/bulk recycled golf balls
- **Golf Ball Nut** — retail recycled golf ball ecommerce

## Target Competitors
1. lostgolfballs.com
2. golfballsdirect.com
3. usedgolfballdeals.com
4. golfballplanet.com
5. lakeballs.com
6. knetgolf.com (recycled section)
7. Amazon — search "recycled golf balls" top 10 listings
8. eBay — search "recycled golf balls" top 10 listings

## SKUs to Track (Top 10)
1. Titleist Pro V1 (Mint/5A) — dozen
2. Titleist Pro V1x (Mint/5A) — dozen
3. Callaway Chrome Soft (Mint/5A) — dozen
4. TaylorMade TP5 (Mint/5A) — dozen
5. Bridgestone Tour B (Mint/5A) — dozen
6. Titleist Pro V1 (Near Mint/4A) — dozen
7. Mixed brand bucket (48 count)
8. Mixed brand bucket (100 count)
9. Titleist Pro V1 (Good/3A) — dozen
10. Callaway Chrome Soft (Near Mint/4A) — dozen

## Execution Steps

### Step 1: Scrape Current Prices
For each competitor + SKU combination:
- Search the competitor site for the SKU
- Extract: price, condition grade, quantity, shipping cost, any sale/promo
- Note: out of stock, discontinued, or new listings

### Step 2: Compare to Previous Day
- Load previous day's prices from vault or war room
- Calculate: price change ($ and %), direction (up/down/same)
- Flag any change > 5% as significant

### Step 3: Identify Opportunities
- **Undercut alert**: competitor dropped price below our cost — investigate why
- **Premium gap**: we're priced 20%+ below competitor — room to raise
- **Stock-out**: competitor out of stock on popular SKU — we can capture demand
- **New listing**: competitor added a product we don't carry

### Step 4: Generate Report
Post to war room with company tag and send research email.

## Output Format
```markdown
# 🏷️ Daily Price Monitor — [DATE]

## Price Alerts
| SKU | Competitor | Was | Now | Change | Signal |
|-----|-----------|-----|-----|--------|--------|
| Pro V1 Mint | lostgolfballs | $24.99 | $21.99 | -12% | ⚠️ UNDERCUT |
| Chrome Soft 4A | golfballsdirect | $18.99 | $18.99 | 0% | — |

## Opportunities
- **RAISE**: Pro V1x Mint — we're at $22, market avg $27. Room for $24-25.
- **STOCK-OUT**: golfballplanet out of TP5 Mint. Push ads on this SKU.

## Market Summary
- Average Pro V1 Mint price: $24.12 (was $24.50 yesterday)
- Trend: slight downward pressure across premium balls
```

## Model Recommendation
- **CLI**: Claude (web scraping via Playwright)
- **Model**: sonnet
- **Timeout**: 20 minutes (multiple sites to scrape)
- **Cost cap**: $1.50

## Gotchas
- Some sites use dynamic pricing — prices change by time of day
- Amazon/eBay listings rotate — track by seller, not just listing
- Shipping costs vary — always include in total price comparison
- Rate limit scraping: 10-second delays between requests per site
- Some sites may block scraping — use Playwright with realistic user agent

## Schedule
Daily at 3 AM ET. Results posted to war room + email summary.

## Data Persistence
- Store daily snapshots in war room (company: links_choice, type: price_monitor)
- Keep 30-day rolling history for trend analysis
- Weekly summary every Monday with 7-day trends

## Related Skills
- competitive-scan (broader competitive intelligence)
- supplier-news-monitor (upstream pricing changes)
