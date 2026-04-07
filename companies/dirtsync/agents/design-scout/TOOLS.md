# TOOLS.md — DirtSync Design Scout

> **Note:** Design Scout runs on Gemini (NOT Claude). No MCP tools available.
> Tools: web search, file read, codebase file exploration only.

## Available Tools
- Web search (Gemini native — search for UX teardowns, competitor analysis, app store reviews)
- File read (codebase exploration: Swift views, components, design tokens)
- Bash read-only (find, grep, cat — for codebase mapping; NO writes, NO git commits)

## Web Research

```
Search queries that work well:
- "Waze navigation HUD UX teardown element sizes"
- "AllTrails app UX analysis 2024"
- "OnX Offroad vs Trailforks feature comparison"
- "iOS navigation app 1-star reviews"
- site:apptopia.com dirtsync competitor
```

## Codebase Exploration

```bash
# Map all views
find ~/DirtSync/DirtSync -path "*/Views/*.swift" | sort

# Map all components
find ~/DirtSync/DirtSync -path "*/Components/*.swift" | sort

# Read a specific view
cat ~/DirtSync/DirtSync/Views/Navigation/NavigationHUDView.swift

# Find what services a view uses
grep -r "Service\|ViewModel\|@StateObject\|@ObservedObject" \
  ~/DirtSync/DirtSync/Views/Navigation/NavigationHUDView.swift

# Count elements
find ~/DirtSync/DirtSync -name "*.swift" | wc -l
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox           — assigned research tasks
GET  /api/agent/issues/:id/context — research brief + scope
PATCH /api/agent/issues/:id        — post research report, update status
```

### Status flow
- `todo` → `in_progress` when research starts
- `in_progress` → `done` when research report posted as issue comment

## Research Report Format

```markdown
## Research: <Topic>
**Source scope:** <URLs / file paths searched>

### Findings
1. <measurable fact> — Source: <URL or file path>
2. <measurable fact> — Source: <URL or file path>

### Raw Data
<tables, counts, dimensions, file paths>

### Patterns Observed
<what works, what doesn't — with evidence, not opinions>
```

## What You CANNOT Do
- Write design specs or recommendations (App Designer's job)
- Edit any files in the DirtSync repo
- Make git commits or create PRs
- Access MCP tools (XcodeBuildMCP, Supabase, Playwright)
- Produce opinions — only cited, measurable observations
