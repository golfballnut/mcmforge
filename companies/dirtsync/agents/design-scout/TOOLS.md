# TOOLS.md — DirtSync Framework Scout (Design Scout)

> **Runs on Claude Sonnet** with WebSearch, Context7, and file tools.

## Available Tools
- **WebSearch** — check GitHub releases, search for framework updates, find reference repos
- **Context7 MCP** — query official docs for MapLibre, Ferrostar, SwiftUI, iOS APIs
- **File read** — check our current framework versions, read Package.resolved, scan code patterns
- **Forge API** — read issues, post framework reports
- **Bash** — SSH to Mini for version checks, Drive uploads

## GitHub Research

```
Useful searches:
- "maplibre-native ios swift" — find repos using MapLibre
- "ferrostar navigation ios" — find Ferrostar integrations
- "valhalla routing ios offline" — find offline routing patterns
- "MLNMapView custom style layer" — specific MapLibre patterns
- "site:github.com maplibre swift demo" — narrow to GitHub
```

## Context7 — Official Docs

```
# MapLibre docs
mcp__plugin_context7_context7__resolve-library-id → "maplibre/maplibre-native"
mcp__plugin_context7_context7__query-docs → "MLNMapView offline tiles style layer"

# Ferrostar docs
mcp__plugin_context7_context7__resolve-library-id → "stadiamaps/ferrostar"
mcp__plugin_context7_context7__query-docs → "NavigationState route step SwiftUI"

# Apple SwiftUI
mcp__plugin_context7_context7__resolve-library-id → "apple/swiftui"
mcp__plugin_context7_context7__query-docs → "Map MapKit overlay annotation"
```

## Key Repos to Monitor

| Repo | Stars | What We Learn |
|------|-------|---------------|
| `maplibre/maplibre-native` | 6,500+ | Map rendering, style layers, offline |
| `stadiamaps/ferrostar` | 200+ | Navigation SDK, state machine, HUD |
| `valhalla/valhalla` | 5,600+ | Routing engine, costing, alternates |
| `maplibre/maplibre-navigation-ios` | 60+ | Turn-by-turn nav with MapLibre |
| `maptiler/maptiler-ios-demo` | — | MapLibre integration patterns |
| `nicklama/maplibre-gl-native-distribution` | — | SPM distribution patterns |

## Version Check Commands

```bash
# Check our Package.resolved on Mini
ssh dirtsyncmini@100.125.184.57 'cat ~/DirtSync/DirtSync/DirtSync.xcodeproj/project.pbxproj | grep -A3 "ferrostar\|maplibre\|MapLibre" | head -20'

# Or check Package.resolved
ssh dirtsyncmini@100.125.184.57 'cat ~/DirtSync/Package.resolved 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); [print(p[\"identity\"],p[\"state\"][\"revision\"][:8]) for p in d.get(\"pins\",[])]"'
```

## Google Drive Upload

```bash
# Upload to DirtSync Research folder
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
gws drive +upload --file /tmp/framework-report.md --parent 1gjlNaOpZz-dpk8yOV9AA8CpFPhrgc51r
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox
GET  /api/agent/issues/:id/context
PATCH /api/agent/issues/:id        — post framework report
```

## What You CANNOT Do
- Write or modify any code
- Write agent instruction files (Skills Enhancer does that)
- Make recommendations (just report facts with evidence)
- Skip the version check
