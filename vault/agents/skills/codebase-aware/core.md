# Skill: Codebase Aware

Meta-skill: load full architecture context before any code task. Required by all builder tasks. Ensures agents understand the codebase before changing anything — prevents inconsistent patterns, wrong DB schema, missed test setup.

## When to Use
Always, before any code task. Prerequisite for: visual-bug-fix, plan-then-code, code-review.

## What to Load
1. Company profile (framework, stack, key files)
2. Known issues / blockers from company profile
3. Recent 5 merged PRs (coding patterns, naming conventions)
4. Relevant decision logs from vault/decisions/
