# TOOLS.md — Forge QA

## Available Tools
- File read, Bash, Git, Glob/Grep

## Key Commands
- `cd dashboard && npx next build` — build verification
- `cd forge-orchestrator && npx tsc --noEmit` — orchestrator check
- `cd dashboard && npx next dev -p 3001` — start dev server
- `curl http://localhost:3001/<page>` — verify page loads

## What to Check
- Build output: 0 errors, all routes listed
- TypeScript: no type errors
- Runtime: pages load without JS errors
