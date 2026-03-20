# Skill: github-repo-scout

## Goal
Search GitHub daily for new/trending public repos that could help our companies. Surface tools, libraries, and integrations we should know about before our competitors find them.

## Trigger Keywords
github search, repo scout, find repos, open source tools, github trending, new repos, useful repos

## Company-Specific Search Queries

### DirtSync (trail navigation app)
**Stack:** Next.js, Supabase, MapLibre, Vercel
- `trail navigation` `offline maps` `gpx parser` `kml parser`
- `maplibre plugin` `mapbox trail` `elevation profile`
- `trail difficulty` `outdoor navigation` `route planner`
- `osm trails` `openstreetmap outdoor` `overland navigation`
- `supabase geo` `postgis trails` `geojson trails`
- `react native maps offline` `mobile trail app`

### Links Choice / Golf Ball Nut / Hot Golf Brands (ecommerce)
**Stack:** Shopify, ShipStation
- `shopify app` `shopify tool` `shopify automation`
- `shipstation integration` `shipstation api`
- `ecommerce analytics` `shopify inventory`
- `golf api` `golf data` (niche — low volume but high value)
- `bulk pricing tool` `wholesale ecommerce`

### MCM Forge (AI ops platform)
**Stack:** Claude Code, Gemini CLI, Supabase, Dispatcher, MCP
- `mcp server` `model context protocol`
- `claude code` `claude agent` `anthropic tool`
- `agent framework` `agent orchestrator` `agent dispatcher`
- `gemini cli` `google gemini tool`
- `supabase mcp` `supabase tool`
- `ai ops` `llm automation` `ai agent skill`
- `task queue agent` `autonomous agent`

## Output Format
```
## GitHub Repo Scout — {date}

### 🔥 Top Finds (most useful to us right now)
1. **{owner/repo}** — ⭐ {stars} | Created: {date} | Updated: {date}
   {description}
   → Why it matters: {how we'd use it, which company benefits}
   → Link: {url}

2. ...

### DirtSync Repos
- **{owner/repo}** (⭐{stars}) — {one-line description}
  → Potential use: {specific use case}

### Ecommerce Repos (Links Choice / GBN / HGB)
- ...

### MCM Forge / Agent Repos
- ...

### Action Items
- [ ] {specific repo to evaluate or install}
```

## Search Strategy
1. Use GitHub API: `gh api search/repositories` with query params
2. Filter by: created or pushed in last 7 days, minimum 5 stars, sorted by stars
3. For MCP servers: also check `gh api search/repositories?q=mcp+server+created:>DATE`
4. Deduplicate against data/repo-scout-log.json (don't report same repo twice)

## Gotchas
- Do NOT recommend repos with fewer than 5 stars unless they're from a known org (anthropics, supabase, vercel, shopify)
- Do NOT recommend archived or unmaintained repos (check `archived` flag and last push date)
- Flag repos with no LICENSE — we can't use them commercially
- Flag repos with < 1 month of history — they might be abandoned experiments
- Check if repo has a README — no README = skip
- For MCP servers: check if they're in the official MCP registry or just someone's experiment
- Keep brief under 400 words — Steve reads on his phone

## Schedule
- Runs daily at 12 UTC (7 AM ET) via Gemini CLI
- After ai-daily-intel (5 AM) and social-intel (6 AM) so the morning brief has everything

## Data Persistence
- `data/repo-scout-log.json` — rolling 30-day log of reported repos (prevents duplicates)
