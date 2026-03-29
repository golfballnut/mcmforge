# Codebase Aware — Context Loading Checklist

## Context Files to Load (in order)

### 1. Company Profile (required)
- `vault/companies/{company}.md` — tech stack, architecture, key files, current status
- This tells you: what framework, what language, what patterns, where files live

### 2. Known Issues (required)
- Check the "Blockers" and "Opportunities" sections of the company profile
- Avoid re-introducing known bugs or conflicting with in-progress work

### 3. Recent PRs (recommended)
- Last 5 merged PRs from the company's GitHub repo
- Command: `gh pr list --repo golfballnut/{repo} --state merged --limit 5`
- Shows: recent coding patterns, active codebase areas, naming conventions

### 4. Relevant Decision Logs (if applicable)
- Check `vault/decisions/` for decisions related to the task
- Important for architectural decisions that constrain implementation

### 5. Related Competitor Intelligence (if applicable)
- If feature development, check `vault/competitors/` for competitive context

## Architecture Checklist

Before any code change, confirm you can answer:
- [ ] What framework/language is this project using?
- [ ] Where do components/pages/routes live in the file structure?
- [ ] What CSS/styling approach is used? (Tailwind, CSS modules, etc.)
- [ ] What state management is used? (React context, Zustand, etc.)
- [ ] What database/backend is used? (Supabase, Firebase, etc.)
- [ ] Are there existing tests? Where do they live? How are they run?
- [ ] What are the deployment patterns?
- [ ] What naming conventions are used?

If you cannot answer these questions, read more code before proceeding.

## Dispatcher Integration

The dispatcher prepends this context automatically to every code task prompt:

```
Before starting this task, read the following context files:
## Company Context
- vault/companies/{company}.md
## Recent Activity
- Recent PRs: {list from GitHub API}
- Known issues: {from company profile}
## Constraints
- Follow existing code patterns
- Do NOT refactor unrelated code
- Keep changes minimal and focused
{original task description}
```

## Anti-Patterns to Prevent
- Starting to code without reading any existing files
- Assuming file structure based on "typical" frameworks instead of reading the actual project
- Not checking for existing patterns → inconsistent code style
- Not knowing Supabase/DB schema → incompatible queries
