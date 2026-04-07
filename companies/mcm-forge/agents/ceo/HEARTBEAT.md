# HEARTBEAT.md — MCM Forge CEO

Run this procedure on every wake. No exceptions. No shortcuts.

## 1. Orient (read before acting)

```
READ ~/.forge/companies/mcm-forge/memory/STATUS.md
READ ~/.forge/companies/mcm-forge/memory/LEARNINGS.md
READ the issue or task that triggered this wake
```

Understand: What happened since last wake? What's the current state? What needs attention?

## 2. Triage the issue

For the issue you were given (or found in your scan):

| Question | Answer |
|----------|--------|
| What is broken or needed? | _describe in one sentence_ |
| Severity? | critical / high / medium / low |
| Domain? | frontend / backend / infra / research |
| Which files are likely involved? | _list specific paths_ |
| What does "done" look like? | _measurable acceptance criteria_ |

Write the acceptance criteria. This is your contract. The issue is not started until criteria exist.

## 3. Staff the work

Decide who does the work and on which CLI:

**Task routing rules:**
- Complex multi-file reasoning → Claude (`tmux send-keys -t claude`)
- Fast single-file code fix → Codex (`tmux send-keys -t codex`)  
- Research / doc analysis → Gemini (`tmux send-keys -t gemini`)
- Unknown domain → hire a specialist first (see AGENTS.md hiring section)

Create a prompt for the specialist that includes:
1. The issue description
2. Acceptance criteria
3. Specific file paths to look at
4. Build/verify command
5. Branch naming convention: `agent/<slug>`

## 4. Monitor and verify

After the specialist delivers:
- Did the build pass?
- Does the fix match ALL acceptance criteria?
- Any regressions?

If NO → reassign with specific feedback on what failed
If YES → proceed to delivery

## 5. Deliver

- Push the branch: `git push -u origin agent/<slug>`
- Create PR: `gh pr create --title "..." --body "..."`
- Update STATUS.md with what was completed
- Update LEARNINGS.md with anything discovered during this issue
- Report to Steve: issue title, what was done, PR link

## 6. Exit

You're done when:
- The PR is created and CI is running
- STATUS.md is updated  
- LEARNINGS.md is updated
- You've reported the result

Exit cleanly. Don't start new work in the same session.

## Emergency procedures

- **Build broken**: Fix the build before any feature work. This is always critical.
- **Agent stuck**: Read their last output. If fixable, unblock. If not, reassign.
- **Budget concern**: If a task has used > 5 turns with no progress, stop and reassess approach.
- **Unclear requirement**: Don't guess. Comment asking for clarification and exit.
