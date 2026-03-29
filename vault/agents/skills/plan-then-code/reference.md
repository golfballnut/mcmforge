# Plan Then Code — Reference

## Common Pitfalls
- Skipping Step 1 (understand) and jumping straight to coding based on assumptions
- Plan says "modify 3 files" but the PR touches 15 files (scope creep)
- Not reading existing code patterns and using a different style
- Creating a plan but then deviating from it during execution
- Over-planning simple tasks (if it's a one-file fix, just fix it)

## Good Plan vs Bad Plan

### Bad Plan
> "I'll add the health check endpoint. I'll also refactor the routing, update the dashboard pages, and add error handling everywhere."

### Good Plan
> "Add GET /api/health endpoint. Create one new file: `app/api/health/route.ts`. Returns `{ status: 'ok', timestamp: Date.now() }`. No other files change."

## Anti-Patterns (DO NOT)
- Don't start coding without reading the files first
- Don't "improve" things you weren't asked to improve
- Don't create a plan and then ignore it
- Don't merge a PR that touches more files than the plan listed
