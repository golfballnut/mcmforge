# Skill: social-intel

## Goal
Monitor social media channels daily for each company. Capture pain points, trending topics, content ideas, and comment opportunities. Output an actionable daily brief.

## Trigger Keywords
social media, social intel, reddit scan, what are people saying, content ideas, pain points, marketing intel, community scan

## Company-Specific Sources

### DirtSync (trail navigation app)
**Reddit:**
- r/overlanding — overlanding trips, trail questions, gear
- r/offroad — off-road vehicles, trail conditions
- r/4x4 — four-wheel drive community
- r/UTV — side-by-sides, UTV trails
- r/ATV — ATV trails and riding
- r/Jeep — Jeep trail riding community
- r/camping — campground + trail overlap

**Keywords to watch:** trail app, trail map, offline map, trail closed, trail conditions, difficulty rating, trail finder, got lost, no signal, cell service, which trails, best trails, trail system

**Competitors mentioned:** OnX Offroad, Trails Offroad, GAIA GPS, AllTrails, Avenza

### Links Choice (recycled golf balls — wholesale/plant)
**Reddit:**
- r/golf — main golf community (2M+ members)
- r/golfdeals — deal hunting
- r/golfclassifieds — buy/sell

**Keywords to watch:** recycled golf balls, used golf balls, refurbished, bulk golf balls, cheap golf balls, practice balls, Pro V1, Titleist, ball quality, ball grading, "worth it"

**Competitors mentioned:** lostgolfballs.com, golfballsdirect.com, usedgolfballdeals.com

### Golf Ball Nut (recycled golf ball ecommerce)
Same Reddit sources as Links Choice but different angle:
- Focus on retail customer pain points (shipping, quality, selection)
- Watch for: "where to buy", "best site for", "recommendation", "review"

### Hot Golf Brands (bulk mesh bags)
- r/golf — bulk bag discussions
- r/golfdeals — mesh bag deals
- Focus on: "range balls", "bulk bags", "mesh bag", "practice balls", "100 count"

## Output Format
```
## Social Intel — {date}

### {Company Name}

🔥 Hot Topics (what people are talking about):
- "{post title}" ({subreddit}, {upvotes} upvotes, {comments} comments)
  → Relevance: {why this matters to us}
- ...

😤 Pain Points (problems we can solve):
- "{quote or paraphrase}" — {source}
  → Our angle: {how our product/service addresses this}

💡 Content Ideas (ready to post when channels are live):
- [ ] {post idea based on what's trending}
- [ ] {post idea addressing a pain point}
- [ ] {post idea responding to competitor discussion}

🏷️ Comment Opportunities (when social channels are live):
- {link} — "{brief context}" → Draft: "{suggested comment}"

📊 Competitor Mentions:
- {competitor}: {sentiment — positive/negative/neutral}, {context}

### {Next Company}
...
```

## Gotchas
- Do NOT actually post or comment anywhere — this is INTELLIGENCE GATHERING ONLY
- Do NOT draft comments that are spammy or overtly promotional — they should be helpful and genuine
- Do NOT include posts older than 48 hours
- Focus on posts with 10+ upvotes (signal vs noise)
- When drafting comment suggestions, match the tone of the subreddit (casual in r/golf, technical in r/overlanding)
- Keep each company section under 300 words — Steve reads this on his phone
- If a pain point directly maps to a feature we have, flag it with → ACTION
- Track competitors being praised AND criticized — both are intel
- Reddit RSS can be rate-limited — use 10-second delays between fetches

## Schedule
- Runs daily at 11 UTC (6 AM ET) via Gemini CLI — right after ai-daily-intel
- Company rotation: all companies scanned daily (Reddit RSS is lightweight)

## Data Persistence
- `data/social-intel-log.json` — rolling 14-day log (prevents duplicate reporting)
- Google Sheet "Social Intel" tab in master task list
- Ideas marked with [ ] should accumulate in a separate "Content Ideas" file per company
