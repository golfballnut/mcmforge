# TOOLS.md — Auto-PR Writer

Diff parsing, branch management, gh CLI patterns.

---

## Diff Parsing

Issue body has a `## Proposed fix` section. Inside it, look for blocks like:

```markdown
File: `path/to/file.ts:LINE`
Old:
\`\`\`<lang>
<exact existing content>
\`\`\`
New:
\`\`\`<lang>
<exact replacement>
\`\`\`
```

Or sometimes just:

```markdown
File: `path/to/file.ts`
Old:
\`\`\`
<existing>
\`\`\`
New:
\`\`\`
<replacement>
\`\`\`
```

Parser:
1. Split section into "## Proposed fix" through next "##" header
2. Match each `File:` line as the start of an edit block
3. Capture lang-tagged code blocks as Old/New
4. Resulting list: `[{filepath, old, new}, ...]`

If parsing produces 0 edits, the issue is malformed — skip and report.

---

## Path Allowlist (Strict)

These paths are SAFE to edit:
- `forge-orchestrator/src/**/*.ts`
- `dashboard/src/**/*.tsx`
- `dashboard/src/**/*.ts`
- `companies/*/agents/*/*.md`
- `vault/agents/skills/*.md`
- Test files under `*/__tests__/**`

These paths are FORBIDDEN:
- `supabase/migrations/**`
- `.env*`
- `**/credentials*`
- `**/secrets*`
- `package.json` (lockfiles only via npm install, not direct edit)
- `tsconfig.json`
- `next.config.js`
- `forge-orchestrator/.env*`

If ANY file in the proposed diff matches a forbidden path, skip the issue.

---

## Branch Hygiene

```bash
# Always start from clean main
cd /Users/dirtsyncmini/MCMForge
git fetch origin
git checkout main
git reset --hard origin/main  # discard any leftover state

# Create branch
git checkout -b agent/auto-pr-<id-lowercase>

# After failure
git checkout main
git branch -D agent/auto-pr-<id-lowercase>
```

If a branch with the same name already exists from a prior failed attempt, delete it before recreating.

---

## Test Commands

```bash
# Dashboard typecheck
cd /Users/dirtsyncmini/MCMForge/dashboard && npx tsc --noEmit

# Orchestrator typecheck
cd /Users/dirtsyncmini/MCMForge/forge-orchestrator && npx tsc --noEmit

# Vitest (one file)
cd /Users/dirtsyncmini/MCMForge/dashboard && npx vitest run <file>

# Vitest (full)
cd /Users/dirtsyncmini/MCMForge/dashboard && npx vitest run

# Orchestrator tests
cd /Users/dirtsyncmini/MCMForge/forge-orchestrator && npm test
```

Capture stdout + stderr to a file, grep for "error" or "FAIL" patterns.

Pass criteria:
- `tsc --noEmit` exit code 0
- `vitest run` exit code 0
- No `error TS` lines in stderr

---

## gh CLI

```bash
gh pr create \
  --title "auto-pr: <title>" \
  --body "$(cat /tmp/auto-pr-body.md)" \
  --base main \
  --head agent/auto-pr-<id>
```

If gh requires auth: that's a fatal error. Append a LESSONS.md entry "gh CLI not authenticated" and exit. Don't try to auth.

---

## Cost Targets

- Codex is cheap (~$0.10 per issue processed)
- 3 issues/day max = $0.30/day
- Plus typecheck/tests = system commands, no token cost

Target: $0.50/day.
Hard cap: $1.50/day.
