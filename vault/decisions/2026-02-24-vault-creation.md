# Decision: Create MCMForge Vault (Brain Infrastructure)

- **Date:** 2026-02-24
- **Status:** Building (initial files created, integration pending)
- **Decision maker:** COO + Steve
- **Category:** Infrastructure / Knowledge Management

---

## Context
Agent memory is a single `MEMORY.md` file in the Claude projects directory, manually updated. There is no:
- Automated learning from task execution
- Cross-session context for agents
- Competitive intelligence accumulation
- Structured knowledge about companies, competitors, or decisions
- Reusable patterns for common task types

When an agent starts a new session, it has to re-discover everything from scratch or rely on the manually maintained MEMORY.md.

## Problem
- Single MEMORY.md file is becoming unwieldy (growing list of facts, no structure)
- No way for agents to accumulate and share knowledge over time
- No competitive intelligence system
- No decision records (why did we make this choice?)
- No reusable execution patterns (every task reinvents the wheel)
- Agent output quality suffers from lack of context

## Decision
Create a structured vault of interlinked markdown files in the MCMForge repository at `vault/`. The vault serves as the COO's persistent brain -- the single source of truth for all companies, competitors, agents, and decisions.

## Architecture

### Directory Structure
```
vault/
  INDEX.md              # Master index, entry point for all agents
  companies/            # One file per company (5 companies)
  competitors/          # One file per competitor
  agents/
    skills/             # Reusable skill templates
    bakeoff/            # Model comparison results
  intelligence/         # Accumulated research and findings
  decisions/            # ADR-style decision records
```

### Design Principles
1. **Markdown first** -- agents read markdown natively, no parsing overhead
2. **Interlinked** -- `[[wiki-links]]` create a knowledge graph
3. **Version controlled** -- vault lives in the MCMForge repo, changes tracked via git
4. **Agent-writable** -- agents can update vault files as they learn
5. **INDEX.md is the entry point** -- every session starts by loading INDEX.md
6. **Flat-ish hierarchy** -- max 2 levels deep, easy to navigate

### Naming Conventions
| Type | Pattern | Example |
|------|---------|---------|
| Companies | `companies/{slug}.md` | `companies/dirtsync.md` |
| Competitors | `competitors/{slug}.md` | `competitors/onx.md` |
| Skills | `agents/skills/{skill-name}.md` | `agents/skills/visual-bug-fix.md` |
| Bakeoffs | `agents/bakeoff/{description}.md` | `agents/bakeoff/gemini-vs-claude-code.md` |
| Intelligence | `intelligence/{topic}.md` | `intelligence/seo-findings.md` |
| Decisions | `decisions/YYYY-MM-DD-{topic}.md` | `decisions/2026-02-24-vault-creation.md` |

## Consequences

### Positive
- Agents have structured, comprehensive context for every task
- Knowledge accumulates over time (intelligence files grow richer)
- Decision records prevent repeating mistakes
- Competitive intelligence feeds directly into feature prioritization
- Skill templates standardize agent execution quality
- Version control means we can see how knowledge evolves
- Steve can review vault changes in PRs just like code changes

### Negative
- Initial effort to create all vault files
- Vault files can become stale if not updated
- More files to maintain in the repository
- Risk of vault becoming a dumping ground for unstructured notes

### Mitigations
- Cron jobs will auto-update intelligence files
- Agents should update vault files after significant task completions
- Regular vault review (weekly) to prune stale content
- Strict naming conventions prevent disorganization

## Migration Path
1. **Phase 1 (now):** Create initial vault files manually based on MEMORY.md knowledge
2. **Phase 2:** Wire dispatcher to load vault context before task execution
3. **Phase 3:** Add cron jobs to auto-update intelligence files (competitive scans, SEO checks)
4. **Phase 4:** Agents auto-update vault after task completion (learning loop)
5. **Phase 5:** MEMORY.md becomes a pointer to the vault ("everything is in vault/INDEX.md")

## Alternatives Considered
1. **Keep using MEMORY.md** -- rejected (doesn't scale, no structure, no agent-writability)
2. **Database-backed knowledge system** -- rejected (too complex, markdown is version-controlled and agent-native)
3. **Notion/Confluence** -- rejected (external dependency, not version-controlled, harder for agents to read/write)
4. **RAG over documents** -- rejected for now (overkill at current scale, vault is sufficient)
5. **Supabase tables for knowledge** -- rejected (markdown is more flexible, easier to review in PRs)

## Inspiration
- **Obsidian vault pattern** -- interlinked markdown files as a knowledge graph
- **Architecture Decision Records (ADRs)** -- for the decisions/ directory
- **Claude Code project instructions** -- markdown files as agent context
- **"Everything is a file" Unix philosophy** -- applied to agent memory

## Success Metrics
- Agent PRs require fewer revision rounds (target: 1 round or less)
- Tasks route to correct company 100% of the time
- Competitive intelligence is updated weekly without manual effort
- New agent sessions load full context in <30 seconds
- Steve spends less time explaining context to agents

## Related
- Architecture: [[decisions/2026-02-24-skills-architecture.md]]
- All company profiles: [[companies/]]
- All competitor profiles: [[competitors/]]
- All intelligence files: [[intelligence/]]
- All skill templates: [[agents/skills/]]
