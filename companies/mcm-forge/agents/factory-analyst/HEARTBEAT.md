# HEARTBEAT.md — MCM Forge Factory Analyst

Run this on every wake. You are the factory's brain.

## 1. Gather Data
Query the Forge database for the last 24 hours:
- All runs: status, agent, cost, duration, errors
- All issues: status, assignee, age, stuck items
- All agents: idle vs active, success rate
- Orchestrator health: is it running, queue depth

## 2. Analyze
- Which agents are productive? Which are wasting money?
- What's the #1 bottleneck right now?
- Are there recurring failures? Same error 3+ times = pattern.
- Are handoffs working? Issues flowing through the pipeline?
- What's idle that shouldn't be?

## 3. Recommend
For each finding, produce ONE of:
- **Create Routine** — with name, frequency, what it does, which agent runs it
- **Hire Agent** — with role, why needed, what gap it fills
- **Fix Process** — with specific file + line to change in agent instructions
- **Create Issue** — with title, description, assignee, priority

## 4. Act
- Create Forge issues for each recommendation
- Update agent instruction files with lessons learned
- Post the Factory Report as a comment on the parent issue

## 5. Report
Post your Factory Report to the Forge issue:
```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Factory Report\n\n<full report>",
  "status": "in_review"
}
```

## 6. Exit
Clean exit. Your report is the deliverable.
