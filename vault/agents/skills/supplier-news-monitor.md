# Skill: Supplier News Monitor

## Purpose
Track golf ball manufacturer news — new releases, pricing changes, discontinuations, factory announcements. Upstream changes directly affect Links Choice procurement pricing and Golf Ball Nut retail inventory planning.

## When to Use
- Scheduled: daily at 8 AM ET
- On-demand: before pricing decisions or inventory buys

## Companies
- **Links Choice** — procurement impact (buy prices change with new model releases)
- **Golf Ball Nut** — retail impact (discontinued models = clearance opportunity)
- **Hot Golf Brands** — bulk pricing impact

## Manufacturers to Monitor
1. **Titleist** (Acushnet) — Pro V1, Pro V1x, AVX, Tour Speed, TruFeel, Velocity
2. **Callaway** — Chrome Soft, Chrome Tour, Supersoft, Warbird, ERC Soft
3. **TaylorMade** — TP5, TP5x, Tour Response, Soft Response, Kalea
4. **Bridgestone** — Tour B X, Tour B XS, Tour B RX, e6, e12
5. **Srixon** (Dunlop) — Z-Star, Z-Star XV, Q-Star, Soft Feel
6. **Vice Golf** — Pro, Pro Plus, Pro Soft, Tour, Drive
7. **Kirkland (Costco)** — Signature Performance (disrupts pricing)
8. **OnCore** — Elixr, Avant, Vero (emerging brand)

## News Sources
- Manufacturer press releases / newsrooms
- MyGolfSpy (independent testing / reviews)
- Golf Digest equipment news
- Golf.com gear section
- GolfWRX forums (insider leaks)
- SEC filings (Acushnet is public — earnings calls mention ball sales)
- Google News alerts for each manufacturer + "golf ball"

## Event Types to Track
- **New model release**: affects used market — old model prices drop, demand shifts
- **Price increase**: retail price up = our used ball value goes up proportionally
- **Discontinuation**: clearance inventory floods market, then scarcity premium later
- **Factory news**: plant expansion = oversupply, plant closure = shortage
- **Patent filing**: signals future product direction
- **Tour player switch**: Tiger/Rory changing balls = demand shift

## Execution Steps

### Step 1: Scan News Sources
For each manufacturer:
- Check newsroom / press release page
- Search Google News (last 24 hours)
- Check MyGolfSpy and GolfWRX for mentions

### Step 2: Classify Impact
For each news item:
- **HIGH**: new model launch, price change, discontinuation → immediate pricing impact
- **MEDIUM**: tour player switch, factory news → near-term market shift
- **LOW**: marketing campaign, sponsorship deal → awareness only

### Step 3: Map to Our Inventory
- If Titleist launches Pro V1 Gen 6 → Gen 5 becomes "previous generation" → used Gen 5 price drops → BUY OPPORTUNITY for Links Choice
- If Callaway discontinues ERC Soft → clearance flood then scarcity → time-sensitive buy window
- If any brand raises MSRP → our used ball value proposition gets stronger

### Step 4: Generate Report

## Output Format
```markdown
# 🏭 Supplier News Monitor — [DATE]

## HIGH Impact
| Manufacturer | Event | Impact | Action |
|-------------|-------|--------|--------|
| Titleist | Pro V1 Gen 6 announced for Q2 | Gen 5 used prices will drop 15-20% | BUY Gen 5 inventory now before prices crash |
| Callaway | Chrome Soft price up $2/dozen | Our used Chrome Soft value increases | RAISE Golf Ball Nut prices by $1/dozen |

## MEDIUM Impact
| Manufacturer | Event | Impact |
|-------------|-------|--------|
| Bridgestone | Tiger Woods testing new Tour B prototype | Demand spike for Tour B line coming |

## LOW Impact
- Vice Golf signed 3 new tour players — brand awareness growing
- Kirkland Signature back in stock at Costco — marginal impact

## Procurement Action Items
1. Links Choice: buy Pro V1 Gen 5 inventory aggressively — 60-day window before Gen 6 drops
2. Golf Ball Nut: raise Chrome Soft prices to match market
3. Hot Golf Brands: Kirkland restocked — bulk orders competing with us on price

## 90-Day Outlook
- Pro V1 Gen 6 launch expected May 2026 — biggest market event of the quarter
- No other major launches announced
```

## Model Recommendation
- **CLI**: Claude (web search + news scraping)
- **Model**: sonnet
- **Timeout**: 15 minutes
- **Cost cap**: $1.00

## Gotchas
- Manufacturer "leaks" on GolfWRX are sometimes marketing plants — verify with official sources
- SEC filings (Acushnet quarterly earnings) are the most reliable signal for market direction
- New model launches follow predictable 2-year cycles — maintain a launch calendar
- Price increases usually announced Q4 for next year — watch October-December
- Discontinued models have a 3-6 month clearance window — act fast

## Schedule
Daily at 8 AM ET. Email alert only for HIGH impact events.

## Data Persistence
- Store daily scans in war room (company: links_choice, type: supplier_news)
- Maintain manufacturer launch calendar (known and predicted dates)
- Track MSRP history for each SKU we carry

## Related Skills
- competitor-price-monitor (downstream pricing effects)
- google-trends-pulse (search volume around launches)
- gmail-draft-outreach (procurement timing based on supplier news)
