# MCM Forge Vault — Master Index

> **Load this file first in every session.**
> This is the COO's brain — the single source of truth for all companies, competitors, agents, and decisions.

---

## Quick Status

| Company | Status | Revenue Channel | Tech Stack | Priority |
|---------|--------|-----------------|------------|----------|
| **DirtSync** | Active — 4/10 vs OnX 9/10 | Free (pre-revenue) | React Native, Vercel | HIGH — close feature gap |
| **MCM Forge** | Active — AI ops platform | Internal tooling | Next.js, Supabase, Vercel | HIGH — core infrastructure |
| **Links Choice** | Active — linkschoice.com | Recycled golf balls, 20M+/yr plant | Shopify | MEDIUM — steady revenue |
| **Golf Ball Nut** | Active — golfballnut.com | Recycled golf ball ecommerce | Shopify + ShipStation | MEDIUM — 300K email list untapped |
| **Hot Golf Brands** | Launching — hotgolfbrands.com | Bulk mesh bags (48/100 ct) | Shopify (new) | HIGH — new launch, needs traffic |

**Key Opportunity:** Golf Ball Nut has 300K unsubscribed emails. Hot Golf Brands can re-engage that list for bulk bag sales.

---

## Last Updated

| Section | Timestamp | Updated By |
|---------|-----------|------------|
| Companies | 2026-02-24 | COO (manual) |
| Competitors | 2026-02-24 | COO (manual) |
| Intelligence | 2026-02-24 | COO (manual) |
| Decisions | 2026-02-24 | COO (manual) |
| Agent Skills | 2026-02-24 | COO (manual) |

_Cron jobs will update these timestamps automatically once wired._

---

## Companies

Core business profiles. Each file contains: overview, current state, tech stack, revenue model, key metrics, and action items.

| File | Description |
|------|-------------|
| [[companies/dirtsync.md]] | Trail navigation app. Repo: `golfballnut/DirtSync`. Vercel deploy. Main competitor: OnX. |
| [[companies/mcmforge.md]] | AI ops platform. Repo: `golfballnut/mcmforge`. Dispatcher on Mac Mini via PM2. |
| [[companies/linkschoice.md]] | Recycled golf balls ecommerce. 20M+ balls/year processing plant. Shopify storefront. |
| [[companies/golfballnut.md]] | Recycled golf ball ecommerce. Shopify + ShipStation. 300K unsubscribed emails available. |
| [[companies/hotgolfbrands.md]] | Bulk mesh bags (48/100 ct). New Shopify launch. Needs SEO + traffic strategy. |

### Cross-Company Relationships

```
Golf Ball Nut ──(300K emails)──> Hot Golf Brands (re-engagement opportunity)
Links Choice ──(same plant)──> Golf Ball Nut (shared inventory/ops)
MCM Forge ──(manages all)──> [DirtSync, Links Choice, Golf Ball Nut, Hot Golf Brands]
DirtSync ──(competes with)──> OnX (see [[competitors/onx.md]])
Golf Ball Nut ──(competes with)──> Lost Golf Balls, GolfBalls.com
Links Choice ──(competes with)──> Lost Golf Balls, GolfBalls.com
```

---

## Competitors

Competitive intelligence profiles. Each file contains: product overview, pricing, strengths, weaknesses, and our gap analysis.

| File | Description |
|------|-------------|
| [[competitors/onx.md]] | DirtSync's main competitor. Trail/offroad navigation. Rating: 9/10 vs DirtSync 4/10. |
| [[competitors/lostgolfballs.md]] | Golf Ball Nut / Links Choice competitor. Major recycled golf ball retailer. |
| [[competitors/golfballs-com.md]] | Golf Ball Nut / Links Choice competitor. New + recycled golf ball marketplace. |

### Competitive Map

```
TRAIL NAVIGATION          RECYCLED GOLF BALLS
OnX (9/10)                Lost Golf Balls (established)
  vs.                       vs.
DirtSync (4/10)           Golf Ball Nut / Links Choice
                            vs.
                          GolfBalls.com (marketplace)
```

---

## Agent Skills

Reusable skill definitions that any agent (Claude, Gemini, Codex) can execute. Each file contains: trigger, inputs, steps, success criteria, and example usage.

| File | Description |
|------|-------------|
| [[agents/skills/visual-bug-fix.md]] | Screenshot → analyze → fix → verify. For UI/visual bugs. |
| [[agents/skills/competitive-scan.md]] | Crawl competitor site, diff against ours, produce gap report. |
| [[agents/skills/code-review.md]] | Review PR quality before merge. Check for security, performance, style. |
| [[agents/skills/plan-then-code.md]] | Plan implementation first (architecture, files, tests), then execute. |
| [[agents/skills/codebase-aware.md]] | Load architecture context (file map, patterns, conventions) before coding. |

### Skill Dependency Graph

```
codebase-aware ──(used by)──> plan-then-code ──(used by)──> code-review
                                                              |
visual-bug-fix (standalone)                                   v
competitive-scan (standalone)                          PR merge decision
```

---

## Agent Bakeoff

Results from testing different AI models on different task types.

| File | Description |
|------|-------------|
| [[agents/bakeoff/]] | Directory for bakeoff results per model/task combo. |

_Related: [[intelligence/model-bakeoff.md]] for summary findings._

---

## Intelligence

Accumulated research and findings. These files grow over time as agents discover new information.

| File | Description |
|------|-------------|
| [[intelligence/model-bakeoff.md]] | Which AI model is best at what task type. Claude vs Gemini vs Codex benchmarks. |
| [[intelligence/seo-findings.md]] | Accumulated SEO research across all company sites. Keywords, rankings, gaps. |
| [[intelligence/market-gaps.md]] | Identified opportunities across companies. Unserved markets, product ideas, expansion plays. |

---

## Decisions

Decision records (ADR-style). Each file captures: context, decision, consequences, and status. Named by date and topic.

| File | Description |
|------|-------------|
| [[decisions/2026-02-24-telegram-routing.md]] | Fix Telegram webhook to route tasks to correct company repo (not hardcode DirtSync). |
| [[decisions/2026-02-24-skills-architecture.md]] | Architecture for reusable agent skills system. How skills are defined, loaded, and executed. |
| [[decisions/2026-02-24-vault-creation.md]] | Decision to create this vault as the COO's persistent brain / knowledge graph. |

---

## How to Use This Vault

### For Agents (Claude, Gemini, Codex)
1. **Always load `INDEX.md` first** — it tells you what exists and where.
2. **Follow [[wiki-links]]** to drill into specific files.
3. **Update timestamps** in the "Last Updated" table when you modify a section.
4. **Add new files** to this index when you create them.

### For Steve
- Check "Quick Status" for a snapshot of all companies.
- Check "Decisions" for recent architectural choices.
- Check "Intelligence" for accumulated research.

### Naming Conventions
- Companies: `companies/{slug}.md`
- Competitors: `competitors/{slug}.md`
- Decisions: `decisions/YYYY-MM-DD-{topic}.md`
- Intelligence: `intelligence/{topic}.md`
- Skills: `agents/skills/{skill-name}.md`
- Bakeoffs: `agents/bakeoff/{model}-vs-{model}-{task}.md`

---

## Infrastructure Quick Reference

| Resource | Value |
|----------|-------|
| Brain Supabase | `ncwxeeqvujgyiggkviqq` |
| Dashboard | mcmforge.com (Vercel auto-deploy from main) |
| Agent Auth | agent@mcmforge.com |
| Email Sends From | ops@mcmforge.com (Resend, verified) |
| Email Delivers To | steve@linkschoice.com |
| Mac Mini SSH | `ssh dirtsyncmini@100.125.184.57` |
| Dispatcher | PM2 process #6 `mcmforge-dispatcher` |
| CLI Versions | Claude 2.1.39, Gemini CLI 0.29.7 (gemini-3.1-pro-preview), Codex 0.99.0 |
