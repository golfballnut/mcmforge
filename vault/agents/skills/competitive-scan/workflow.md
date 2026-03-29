# competitive-scan: Workflow

## Step 1: Load Context
- Load our company profile from vault (e.g., `companies/dirtsync.md`)
- Load competitor profile from vault (e.g., `competitors/onx.md`)
- Load previous scan results from `intelligence/` files
- Load `intelligence/market-gaps.md` and `intelligence/seo-findings.md`

## Step 2: Crawl Competitor
- Visit key pages: homepage, pricing, features, blog, about, app store listing
- Document: feature list, pricing tiers, UX quality, content strategy
- Note new features or changes since last scan
- Capture key messaging and positioning language
- Check app store reviews for common complaints (= opportunities for us)

## Step 3: Diff Against Ours
Build a feature-by-feature comparison table:
| Feature | Competitor | Us | Gap? |
|---|---|---|---|

Compare: pricing, UX/design quality, content/SEO, mobile app.

## Step 4: Identify Gaps (They Have, We Don't)
- List every capability they have that we lack
- Categorize by impact: Critical / High / Medium / Low
- Estimate implementation difficulty for each gap
- Note: table-stakes (must have) vs nice-to-have

## Step 5: Identify Advantages (We Have, They Don't)
- List every capability we have that they lack — these are our differentiators
- Flag advantages we're not marketing well enough

## Step 6: Prioritize & Generate Action Items
- Rank gaps: business impact × implementation feasibility
- Top 3 gaps → recommended action items
- Each task: clear scope, acceptance criteria, recommended model (Claude/Gemini/Codex)

## Step 7: Update Vault
- Update `competitors/{name}.md` with new findings
- Update `intelligence/market-gaps.md` with new gaps
- Update `intelligence/seo-findings.md` if SEO data gathered
- Log strategic direction changes in `decisions/`

## Scan Schedule
| Competitor | Frequency | Company | Priority |
|---|---|---|---|
| OnX | Weekly | DirtSync | HIGH |
| Lost Golf Balls | Bi-weekly | Links Choice/GBN | MEDIUM |
| GolfBalls.com | Monthly | Links Choice/GBN | MEDIUM |
