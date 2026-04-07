# TOOLS.md — DirtSync Design Scout

> **Runs on Claude Sonnet** with WebSearch, Playwright, Context7, and file tools.
> Switched from Gemini (web search was broken) to Claude for reliable research.

## Available Tools
- **WebSearch** — search the web for UX teardowns, competitor analysis, app reviews
- **Playwright MCP** — browse actual apps/websites, take screenshots, inspect layouts
- **Context7 MCP** — query official docs for SwiftUI, MapLibre, iOS HIG
- **File read** (codebase exploration: Swift views, components, design tokens)
- **Forge API** — read issues, post research reports

## Web Research

```
WebSearch queries that work well:
- "Waze navigation HUD UX teardown element sizes"
- "Strava ride recording screen analysis"
- "AllTrails trail detail page UX analysis"
- "OnX Offroad vs Trailforks feature comparison"
- "iOS navigation app design patterns 2025"
```

## Playwright — Browse Real Apps

```
# Take screenshot of a competitor's web app
mcp__plugin_playwright_playwright__browser_navigate → URL
mcp__plugin_playwright_playwright__browser_take_screenshot → capture
mcp__plugin_playwright_playwright__browser_snapshot → get element tree

# Useful for: Waze web, Strava web, AllTrails web, onX web
```

## Context7 — Official Docs

```
# Look up SwiftUI components
mcp__plugin_context7_context7__resolve-library-id → "apple/swiftui"
mcp__plugin_context7_context7__query-docs → "NavigationStack sheet overlay"

# Look up MapLibre
mcp__plugin_context7_context7__resolve-library-id → "maplibre/maplibre-gl-native"
```

## Codebase Exploration

```bash
# Map all views
find ~/DirtSync/DirtSync -path "*/Views/*.swift" | sort

# Read design tokens
cat ~/DirtSync/DirtSync/DirtSyncApp/Theme/PremiumColors.swift

# Find what services a view uses
grep -r "Service\|ViewModel\|@StateObject" \
  ~/DirtSync/DirtSync/Views/Navigation/NavigationHUDView.swift
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
- Produce opinions — only cited, measurable observations
