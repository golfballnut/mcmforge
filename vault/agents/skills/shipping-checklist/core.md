# Skill: Shipping Checklist

Standard SOP for getting code from PR to production. Every code task.

## When to Use
- After creating a PR
- Before approving a merge
- When reviewing any agent-generated PR

## 5 Gates
1. Tests pass (no regressions, new coverage)
2. Build succeeds (tsc + next build)
3. PR quality (single responsibility, under 400 lines)
4. Review (self-review diff, check preview URL)
5. Production spot-check after merge
