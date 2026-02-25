# Decision: Skills Architecture for Agent Tasks

- **Date:** 2026-02-24
- **Status:** Designing (vault built, dispatcher integration pending)
- **Decision maker:** COO
- **Category:** Architecture / Agent System

---

## Context
Agents (Claude, Gemini, Codex) receive raw one-liner prompts from Telegram with no context about the codebase, architecture, conventions, or scope boundaries. This produces unfocused PRs that:
- Touch too many files (scope creep)
- Don't follow existing code patterns
- Create merge conflicts
- Require multiple revision rounds

Example: Gemini's health check PR touched every dashboard page instead of just adding one endpoint, resulting in 8 merge conflicts.

## Problem
- Raw prompts lack context: "fix the outlaw trail badges" tells the agent nothing about file structure, tech stack, or acceptance criteria
- Different task types need different execution approaches
- No reusable patterns -- every task starts from scratch
- No quality gates before PR creation
- No competitive or business context when building features

## Decision
Build a vault of interlinked markdown files that agents load before executing tasks. The vault contains:
1. **Company profiles** (`vault/companies/`) -- tech stack, architecture, key files, current status
2. **Competitor profiles** (`vault/competitors/`) -- competitive intelligence, gap analysis
3. **Skill templates** (`vault/agents/skills/`) -- reusable execution patterns per task type
4. **Intelligence files** (`vault/intelligence/`) -- accumulated research, model benchmarks, SEO data
5. **Decision logs** (`vault/decisions/`) -- architectural decisions that constrain future work

## Architecture

### Vault Structure
```
vault/
  INDEX.md                          # Master index, load first
  companies/
    dirtsync.md                     # Company profiles
    mcmforge.md
    linkschoice.md
    golfballnut.md
    hotgolfbrands.md
  competitors/
    onx.md                          # Competitor profiles
    lostgolfballs.md
    golfballs-com.md
  agents/
    skills/
      visual-bug-fix.md             # Skill templates
      competitive-scan.md
      plan-then-code.md
      codebase-aware.md
      code-review.md
    bakeoff/                        # Model comparison results
  intelligence/
    model-bakeoff.md                # Model benchmarks
    seo-findings.md                 # SEO research
    market-gaps.md                  # Market opportunities
  decisions/
    2026-02-24-telegram-routing.md  # Decision records
    2026-02-24-skills-architecture.md
    2026-02-24-vault-creation.md
```

### Cross-Linking
Files use `[[wiki-links]]` notation to reference each other, creating a knowledge graph:
- Company profiles link to their competitors
- Skill templates link to required context files
- Intelligence files link to relevant companies and competitors
- Decision logs link to affected systems

### Dispatcher Integration (Pending)
The dispatcher should:
1. Receive task from Telegram
2. Parse company slug and task type
3. Load relevant vault files as context
4. Select the appropriate skill template
5. Construct a context-rich prompt:
   ```
   ## Context
   {company profile}
   {relevant architecture info}
   {acceptance criteria from skill template}

   ## Task
   {original task description}

   ## Constraints
   {scope boundaries from skill template}
   ```
6. Dispatch to the selected model
7. Run code review skill on the resulting PR

## Key Insight
**Context quality determines output quality.** A "visual-bug-fix" skill with file paths, acceptance criteria, and architecture context produces dramatically better PRs than a raw "fix the outlaw trail badges" prompt.

The 5 minutes spent loading context saves hours of PR revision and merge conflict resolution.

## Consequences

### Positive
- Agents produce higher-quality, more focused PRs
- Reusable skill templates reduce prompt engineering per task
- Accumulated intelligence improves over time
- Cross-linked knowledge graph captures relationships between companies, competitors, and decisions
- Vault is version-controlled (in the MCMForge repo)

### Negative
- Initial setup effort to build the vault
- Vault files need maintenance (can become stale)
- Longer prompts = more tokens = slightly higher API costs
- Dispatcher integration requires code changes

## Alternatives Considered
1. **Database-backed context system** -- rejected (markdown is simpler, version-controlled, agent-friendly)
2. **Per-task context files** -- rejected (too much duplication, no reusability)
3. **No context, just better prompts** -- rejected (doesn't solve the architecture awareness problem)
4. **RAG over codebase** -- rejected for now (too complex, vault is sufficient for current scale)

## Next Steps
1. Build vault files (company profiles, competitor intel, skills, intelligence, decisions) -- **in progress**
2. Wire dispatcher to load vault context before task execution
3. Test vault-augmented tasks against raw tasks (A/B comparison)
4. Add cron jobs to update intelligence files automatically
5. Build feedback loop: PR quality feeds back into skill template refinement

## Inspiration
- Obsidian + Claude Code pattern: interlinked markdown vault as agent context
- Architecture Decision Records (ADRs) pattern for decisions
- "Everything is a file" Unix philosophy applied to agent memory

## Related
- Skill templates: [[agents/skills/visual-bug-fix.md]], [[agents/skills/competitive-scan.md]], [[agents/skills/plan-then-code.md]], [[agents/skills/codebase-aware.md]], [[agents/skills/code-review.md]]
- Model benchmarks: [[intelligence/model-bakeoff.md]]
- Vault creation decision: [[decisions/2026-02-24-vault-creation.md]]
- Company: [[companies/mcmforge.md]]
