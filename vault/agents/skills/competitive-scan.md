# Skill: Competitive Scan

## Purpose
Crawl a competitor's website/app, compare against our product, identify gaps and opportunities, and update vault intelligence files.

## When to Use
- Scheduled cron (weekly recommended for active competitors)
- Before planning a new feature sprint (input for prioritization)
- When entering a new market or launching a new brand
- When a competitor ships a notable update or feature
- When Steve asks "where do we stand vs [competitor]?"

## Pre-Task Context Loading
1. Load our company profile from vault (e.g., [[companies/dirtsync.md]])
2. Load the competitor profile from vault (e.g., [[competitors/onx.md]])
3. Load previous scan results from [[intelligence/]] files
4. Load market gaps file: [[intelligence/market-gaps.md]]
5. Load SEO findings: [[intelligence/seo-findings.md]]

## Required Capabilities
- **Web access** -- must be able to crawl/scrape competitor websites
- **Analysis** -- must be able to compare features, pricing, UX systematically
- **Writing** -- must produce structured, actionable output

## Execution Steps

### Step 1: Crawl Competitor
- Visit key pages: homepage, pricing, features, blog, about, app store listing
- Document: features list, pricing tiers, UX quality, content strategy
- Note any new features or changes since last scan
- Capture key messaging and positioning language
- Check their app store reviews for common complaints (opportunities for us)

### Step 2: Diff Against Ours
- Feature-by-feature comparison table
- Pricing comparison
- UX/design quality comparison
- Content/SEO comparison
- Mobile app comparison (if applicable)

### Step 3: Identify Gaps (They Have, We Don't)
- List every feature/capability they offer that we lack
- Categorize by impact: Critical, High, Medium, Low
- Estimate implementation difficulty for each gap
- Note which gaps are table-stakes (must have) vs nice-to-have

### Step 4: Identify Advantages (We Have, They Don't)
- List every feature/capability we offer that they lack
- These are our differentiators -- make sure we're marketing them
- Identify any advantages we're not leveraging well enough

### Step 5: Prioritize
- Rank gaps by: business impact x implementation feasibility
- Top 3 gaps become recommended action items
- Consider: what would move us from 4/10 to 6/10? (for DirtSync vs OnX)

### Step 6: Generate Action Items
- Specific, actionable tasks to close the top gaps
- Each task should be dispatchable to an agent (clear scope, acceptance criteria)
- Assign recommended model per task (Claude for code, Gemini for research, Codex for quick fixes)

### Step 7: Update Vault
- Update the competitor profile in [[competitors/]]
- Update [[intelligence/market-gaps.md]] with new findings
- Update [[intelligence/seo-findings.md]] if SEO data was gathered
- Log any decisions in [[decisions/]] if strategic direction changes

## Output Format
```markdown
# Competitive Scan: [Competitor] vs [Our Company]
## Date: YYYY-MM-DD
## Summary: [1-2 sentence executive summary]

### Feature Comparison
| Feature | Competitor | Us | Gap? |
|---------|-----------|-----|------|
| ... | ... | ... | ... |

### Top 3 Gaps to Close
1. [Gap] -- [Why it matters] -- [Estimated effort]
2. ...
3. ...

### Our Advantages to Leverage
1. [Advantage] -- [How to leverage it better]
2. ...

### Recommended Action Items
- [ ] Task 1 (assign to: Claude/Gemini/Codex)
- [ ] Task 2
- [ ] Task 3

### Changes Since Last Scan
- [What's new or different]
```

## Model Recommendation
- **Best: Gemini** -- broad knowledge, good at analysis and comparison, fast at processing large amounts of web content
- **Also good: Claude** -- thorough, structured output, good at strategic analysis
- **Not suitable: Codex** -- no web access, code-focused not analysis-focused

## Scan Schedule
| Competitor | Frequency | Our Company | Priority |
|-----------|-----------|-------------|----------|
| OnX | Weekly | DirtSync | HIGH |
| Lost Golf Balls | Bi-weekly | Links Choice / GBN | MEDIUM |
| GolfBalls.com | Monthly | Links Choice / GBN | MEDIUM |

## Related Skills
- [[agents/skills/codebase-aware.md]] -- load company context first
- [[agents/skills/plan-then-code.md]] -- use for implementing gap-closing features

## Related Intelligence
- [[intelligence/market-gaps.md]]
- [[intelligence/seo-findings.md]]
- [[competitors/onx.md]], [[competitors/lostgolfballs.md]], [[competitors/golfballs-com.md]]
