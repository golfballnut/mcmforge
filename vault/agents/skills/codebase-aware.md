# Skill: Codebase Aware

## Purpose
Load full architecture context before any code task. This is a **meta-skill** that other skills depend on. It ensures agents understand the codebase before they start changing things.

## When to Use
- **Always.** This skill should be invoked (or its context injected) before any code task.
- It is a prerequisite for: [[agents/skills/visual-bug-fix.md]], [[agents/skills/plan-then-code.md]], [[agents/skills/code-review.md]]

## Context Files to Load

For each company, load from vault:

### 1. Company Profile (required)
- `vault/companies/{company}.md` -- tech stack, architecture, key files, current status
- This tells the agent: what framework, what language, what patterns, where files live

### 2. Known Issues (required)
- Check the "Blockers" and "Opportunities" sections of the company profile
- Avoid re-introducing known bugs or conflicting with in-progress work

### 3. Recent PRs (recommended)
- Last 5 merged PRs from the company's GitHub repo
- Command: `gh pr list --repo golfballnut/{repo} --state merged --limit 5`
- This shows: recent coding patterns, active areas of the codebase, naming conventions

### 4. Relevant Decision Logs (if applicable)
- Check `vault/decisions/` for any decisions related to the task
- Especially important for architectural decisions that constrain implementation choices

### 5. Related Competitor Intelligence (if applicable)
- If the task is feature development, check `vault/competitors/` for competitive context
- Example: building offline maps for DirtSync? Check [[competitors/onx.md]] for how OnX does it

## Company-to-Repo Mapping

| Company Slug | Repo | Framework | Key Directories |
|-------------|------|-----------|-----------------|
| `dirtsync` | `golfballnut/DirtSync` | React Native / Vercel | TBD -- needs architecture audit |
| `mcmforge` | `golfballnut/mcmforge` | Next.js + Supabase + Vercel | `app/`, `supabase/`, `lib/`, `vault/` |
| `linkschoice` | N/A (Shopify) | Liquid templates | Shopify theme editor |
| `golfballnut` | N/A (Shopify) | Liquid templates | Shopify theme editor |
| `hotgolfbrands` | N/A (Shopify, not built yet) | Liquid templates | N/A |

## Dispatcher Integration

The dispatcher should prepend this context to every code task prompt automatically:

```
Before starting this task, read the following context files:

## Company Context
- vault/companies/{company}.md -- company profile, tech stack, architecture

## Recent Activity
- Recent PRs: {list from GitHub API}
- Known issues: {extracted from company profile}

## Relevant Decisions
- {any matching decision logs from vault/decisions/}

## Constraints
- Follow existing code patterns (check recent PRs for style)
- Do NOT refactor unrelated code
- Keep changes minimal and focused
- Create clear PR descriptions

Now, with this full context, proceed with the task:
{original task description}
```

## Architecture Checklist

Before any code change, the agent should be able to answer:

- [ ] What framework/language is this project using?
- [ ] Where do components/pages/routes live in the file structure?
- [ ] What CSS/styling approach is used? (Tailwind, CSS modules, styled-components, etc.)
- [ ] What state management is used? (React context, Zustand, Redux, etc.)
- [ ] What database/backend is used? (Supabase, Firebase, custom API, etc.)
- [ ] Are there existing tests? Where do they live? How are they run?
- [ ] What are the deployment patterns? (Vercel auto-deploy, manual, CI/CD?)
- [ ] What naming conventions are used? (camelCase, kebab-case, PascalCase for files?)

If the agent cannot answer these questions, it should read more code before proceeding.

## Context Quality = Output Quality

This is the core insight behind the vault system:
- A raw prompt like "fix the outlaw trail badges" produces unfocused, context-free PRs
- The same prompt with company profile, file paths, acceptance criteria, and architecture context produces dramatically better results
- The 5 minutes spent loading context saves hours of PR revision and merge conflict resolution

## Anti-Patterns to Prevent
- Agent starts coding without reading any existing files
- Agent assumes file structure based on "typical" frameworks instead of reading the actual project
- Agent doesn't check for existing patterns and introduces inconsistent code style
- Agent doesn't know about Supabase/database schema and writes incompatible queries

## Related Skills
- Used by: [[agents/skills/visual-bug-fix.md]]
- Used by: [[agents/skills/plan-then-code.md]]
- Used by: [[agents/skills/code-review.md]]
- Related: [[intelligence/model-bakeoff.md]] (which models handle context loading best)
