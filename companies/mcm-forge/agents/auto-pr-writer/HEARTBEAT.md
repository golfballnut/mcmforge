# HEARTBEAT.md — MCM Forge Auto-PR Writer

Run this on every wake. You bridge "issue filed" to "PR opened" autonomously.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons about diffs that failed to apply, test commands that don't work, or false-positive "high confidence" issues.

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Query Eligible Issues

```sql
SELECT id, identifier, title, description, priority
FROM forge.issues
WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd'
  AND status = 'todo'
  AND priority IN ('high', 'critical')
  AND assignee_agent_id IS NULL
  AND execution_locked_at IS NULL
  AND (title ILIKE '[harness]%' OR title ILIKE '[cost]%')
  AND created_at > now() - interval '24 hours'
ORDER BY priority DESC, created_at ASC
LIMIT 5;
```

## 2. Filter by Confidence + Scope

For each candidate issue, parse the description and check:

- ✅ Contains `## Proposed fix` section
- ✅ Contains `**Confidence: high**` OR `**Confidence: medium**`
- ✅ The proposed fix has a specific file path
- ✅ The proposed fix has an "Old:" or `Old block:` code block
- ✅ The proposed fix has a "New:" or `New block:` code block
- ✅ Total file count in the proposed fix is ≤ 5
- ✅ NO file path matches `supabase/migrations/`, `.env`, `*credentials*`, `*secret*`

If any check fails, skip this issue. Add to digest "skipped" list with the reason. Do NOT claim it.

## 3. Pick Top Issue to Act On

Take the FIRST eligible issue (highest priority, oldest). Process it. If you have time/budget, do up to 3 issues per run, but in serial — finish one before starting the next.

## 4. Claim the Issue

```sql
UPDATE forge.issues
SET assignee_agent_id = '<your uuid>',
    execution_locked_at = now(),
    updated_at = now()
WHERE id = '<issue-id>'
  AND assignee_agent_id IS NULL
  AND execution_locked_at IS NULL
RETURNING id;
```

If `RETURNING` returns 0 rows, someone else claimed it between query and update. Skip this issue, try the next.

## 5. Create Feature Branch

```bash
cd /Users/dirtsyncmini/MCMForge
git fetch origin
git checkout main
git pull --rebase
git checkout -b agent/auto-pr-<identifier-lowercase>
```

If branch already exists from a prior failed attempt, delete it and recreate.

## 6. Apply the Diff

Parse the issue's `## Proposed fix` section. For each file:

1. Read the current file
2. Verify the "Old:" block matches the current file content exactly
3. If match: replace Old with New
4. If no match: the file has changed since the issue was filed — REVERT all changes, comment on the issue "diff stale, file content has drifted", set assignee back to null, exit

Use Codex for the actual edits — it's reliable for surgical replacements.

## 7. Typecheck

Determine which package the change touched:
- Touched `dashboard/`? → `cd dashboard && npx tsc --noEmit`
- Touched `forge-orchestrator/`? → `cd forge-orchestrator && npx tsc --noEmit`
- Touched both? → run both

If typecheck fails, capture the first 30 lines of error output, revert, and exit per Rule 7 (cleanup on failure).

## 8. Run Tests (if applicable)

If the issue body mentions specific test commands or test files, run them:
- `vitest run <file>` for vitest
- `npx vitest run` for full vitest suite
- `npm test` if defined in package.json

If tests fail, capture output, revert, exit per cleanup rule.

## 9. Commit + Push

```bash
git add <changed files>
git commit -m "auto-pr: <issue title>

Source issue: <forge issue uuid>
Confidence: <high|medium> per source issue
Files changed: <list>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push -u origin agent/auto-pr-<identifier>
```

## 10. Open PR

```bash
gh pr create \
  --title "auto-pr: <issue title>" \
  --body "<issue description + footer per AGENTS.md template>" \
  --base main
```

Capture the PR URL.

## 11. Mark Issue in_review

```sql
UPDATE forge.issues
SET status = 'in_review',
    updated_at = now()
WHERE id = '<issue-id>';
```

Post a comment on the issue:

```
PR opened: <pr url>
Branch: agent/auto-pr-<id>
Tests: PASS
Files changed: <list>
Awaiting review.
```

## 12. Cleanup on Failure (per-issue)

If anything in steps 6-10 failed:

```bash
git checkout main
git branch -D agent/auto-pr-<identifier> 2>/dev/null
```

```sql
UPDATE forge.issues
SET assignee_agent_id = NULL,
    execution_locked_at = NULL,
    updated_at = now()
WHERE id = '<issue-id>';
```

Post a comment on the issue:

```
Auto-PR attempt failed:
- Step that failed: <step name>
- Output: <first 20 lines>

Reverting and unclaimming for human review.
```

## 13. Repeat (if budget allows)

If you have more eligible issues AND time AND budget, go to step 3 and process the next one. Max 3 per run.

## 14. Post Daily Digest

Post per AGENTS.md format to your routine issue.

## 15. Append Lessons Learned (MANDATORY — before exit)

For every non-trivial gotcha (diff didn't apply because of whitespace, test command not found, gh CLI auth failure), append to `companies/mcm-forge/agents/auto-pr-writer/LESSONS.md`. Commit with your work.

## 16. Exit

Clean exit. PRs opened + digest are your deliverables.
