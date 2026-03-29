# Codebase Aware — Reference

## Company-to-Repo Mapping

| Company Slug | Repo | Framework | Key Directories |
|-------------|------|-----------|-----------------|
| `dirtsync` | `golfballnut/DirtSync` | React Native / Vercel | TBD — needs architecture audit |
| `mcmforge` | `golfballnut/mcmforge` | Next.js + Supabase + Vercel | `app/`, `supabase/`, `lib/`, `vault/` |
| `linkschoice` | N/A (Shopify) | Liquid templates | Shopify theme editor |
| `golfballnut` | N/A (Shopify) | Liquid templates | Shopify theme editor |
| `hotgolfbrands` | N/A (Shopify, not built yet) | Liquid templates | N/A |

## Architecture Context Sources

| Source | Command | When to Use |
|--------|---------|-------------|
| Company profile | Read `vault/companies/{slug}.md` | Always — first step |
| Recent PRs | `gh pr list --repo golfballnut/{repo} --state merged --limit 5` | Before code changes |
| Decision logs | Read `vault/decisions/*.md` (filter by topic) | Architecture decisions |
| Competitor intel | Read `vault/competitors/{name}.md` | Feature development tasks |

## Context Quality Principle

A raw prompt like "fix the outlaw trail badges" produces unfocused, context-free PRs.
The same prompt with company profile + file paths + architecture context produces dramatically better results.

The 5 minutes spent loading context saves hours of PR revision and merge conflict resolution.
