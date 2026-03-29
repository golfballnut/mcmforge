# Orchestrator — Reference

## Skill Capability Matrix

| Skill | When to Use | Best CLI | Task Type |
|-------|-------------|----------|-----------|
| poi-research | Research POIs near trail systems, populate Google Sheets | claude | research |
| competitive-scan | Competitor analysis, feature gaps, market intelligence | gemini | research |
| code-review | Review a PR for quality, correctness, scope, security | claude | code |
| visual-bug-fix | Fix UI/CSS issues from screenshots or visual descriptions | claude | code |
| plan-then-code | Complex features touching 3+ files, new endpoints, pages | claude | code |
| tdd-workflow | Simple code fixes, small features, bug fixes | claude | code |
| shipping-checklist | Pre-deploy verification, PR merge readiness | claude | code |
| codebase-aware | Load full architecture context (auto-injected for code tasks) | claude | code |
| feature-proposal | Propose new features with structured research | gemini | proposal |
| daily-ops | Daily operational cycle: health checks, task generation | gemini | ops |

## Company Registry

| Slug | Name | Has Code Repo | Description |
|------|------|---------------|-------------|
| dirtsync | DirtSync | Yes (golfballnut/DirtSync) | Trail navigation app for ATVs/OHVs |
| mcmforge | MCM Forge | Yes (golfballnut/mcmforge) | AI ops platform (this system) |
| linkschoice | Links Choice | No (Shopify) | Recycled golf balls, 20M+ balls/year |
| golfballnut | Golf Ball Nut | No (Shopify) | Golf ball ecommerce + ShipStation |
| hotgolfbrands | Hot Golf Brands | No (Shopify) | Bulk mesh bags (48/100 ct packs) |

## CLI Target Mapping

| CLI | Strengths | Weaknesses | Cost |
|-----|-----------|------------|------|
| claude | Code editing, vision/screenshots, Bash execution, structured output | Expensive | $$$ |
| gemini | Web research, analysis, fast, broad knowledge | No reliable Bash, can over-engineer | Free (1K/day) |
| codex | Fast focused code changes, minimal | No web search, no vision, code-only | $$ |
