# TOOLS.md — MCM Forge CEO

## Available Tools
- File read/write/edit (for memory files, issue files, onboarding docs)
- Bash commands (for git, build verification, tmux management)
- Glob/Grep search (for finding code relevant to issues)
- Git operations (branch, commit, push, PR creation)

## Key Commands

### Build verification
```bash
cd ~/MCMForge/dashboard && npx next build          # Dashboard build
cd ~/MCMForge/forge-orchestrator && npx tsc --noEmit # Orchestrator typecheck
```

### Git workflow
```bash
git checkout -b agent/<issue-slug>                   # Feature branch
git push -u origin agent/<issue-slug>                # Push branch
gh pr create --title "..." --body "..."              # Create PR
```

### Multi-model routing (tmux)
```bash
tmux send-keys -t claude '<prompt>' Enter             # Send task to Claude
tmux send-keys -t codex '<prompt>' Enter              # Send task to Codex
tmux send-keys -t gemini '<prompt>' Enter             # Send task to Gemini
tmux capture-pane -t claude -p                        # Read Claude's output
tmux capture-pane -t codex -p                         # Read Codex's output
tmux capture-pane -t gemini -p                        # Read Gemini's output
```

### Company memory
```bash
cat ~/.forge/companies/mcm-forge/memory/STATUS.md     # Current state
cat ~/.forge/companies/mcm-forge/memory/LEARNINGS.md  # Accumulated knowledge
```

## Supabase
- Project: `ncwxeeqvujgyiggkviqq`
- Schema: `forge`
- 14 tables: companies, projects, agents, issues, issue_comments, runs, run_events, cost_events, routines, routine_runs, wakeup_requests, approvals, goals, execution_workspaces
- Company IDs: DirtSync=`99338dee`, MCM Forge=`170ebe36`, Links Choice=`66302362`, GBN=`54aebffe`, HGB=`12ffc19c`

## Dashboard structure
```
dashboard/
├── src/app/
│   ├── layout.tsx              # Root layout with company context
│   ├── DashboardClient.tsx     # Main dashboard (company stats, agent cards)
│   ├── page.tsx                # Home page
│   ├── agents/                 # Agent management
│   ├── issues/                 # Issue tracking
│   ├── routines/               # Routine management
│   ├── runs/                   # Run history
│   ├── costs/                  # Cost tracking
│   ├── goals/                  # Goal tracking
│   ├── approvals/              # Approval queue
│   ├── inbox/                  # Notification inbox
│   ├── settings/               # Company settings
│   └── activity/               # Activity feed
├── src/lib/
│   ├── supabase/               # Supabase clients
│   └── stores/                 # State management
└── next.config.ts
```

## What you CANNOT do
- Push to main directly
- Modify production environment variables
- Delete branches without Steve's approval
- Send emails (drafts only)
- Spend more than $5 on a single issue without Steve's approval
