# TOOLS.md — Forge Builder

## Available Tools
- File read/write/edit
- Bash commands
- Git operations
- Glob/Grep search

## Key Commands
- `cd /Users/dirtsyncmini/MCMForge/dashboard && npx next build` — verify dashboard
- `cd /Users/dirtsyncmini/MCMForge/forge-orchestrator && npx tsc --noEmit` — verify orchestrator
- `git checkout -b agent/forge-builder/<slug>` — create feature branch
- `git push -u origin <branch>` — push branch
- `gh pr create --title "..." --body "..."` — create PR

## Supabase
- Project: ncwxeeqvujgyiggkviqq
- Schema: forge (14 tables)
- Server client: `import { createForgeClient } from "@/lib/supabase/forge-server"`
- Browser client: `import { createForgeBrowserClient } from "@/lib/supabase/forge-client"`
