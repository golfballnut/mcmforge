# TOOLS.md — DirtSync App Designer

## Xcode Build MCP (PRIMARY — screenshot the app)
```
mcp__XcodeBuildMCP__build_sim           — build for simulator
mcp__XcodeBuildMCP__build_run_sim       — build + launch
mcp__XcodeBuildMCP__screenshot          — capture screen
mcp__XcodeBuildMCP__snapshot_ui         — UI hierarchy with coordinates
mcp__XcodeBuildMCP__list_sims           — available simulators
mcp__XcodeBuildMCP__boot_sim            — boot a simulator
```

### Build Command
```bash
xcodebuild -scheme DirtSync -destination 'platform=iOS Simulator,name=iPhone 16' build
```

## Visual Design Tools (NEW)
- **Excalidraw MCP** — create wireframes and flow diagrams for screen specs
  - `mcp__excalidraw__create` — create new diagram
  - Use for: user flow diagrams, screen layout sketches, state transition diagrams
- **Mockuuups MCP** — generate professional device mockups
  - Put simulator screenshots into iPhone frames for presentations
- **Figma MCP** — create/edit Figma design files (when API key is configured)
  - Create actual visual mockups, not just text specs

## Research Tools
- **Playwright MCP** — browse competitor apps and take screenshots
  - `mcp__plugin_playwright_playwright__browser_navigate` → browse Waze/Strava/AllTrails web
  - `mcp__plugin_playwright_playwright__browser_take_screenshot` → capture for comparison
  - Use for: side-by-side Waze comparison screenshots
- **Context7 MCP** — query official documentation
  - `mcp__plugin_context7_context7__resolve-library-id` → find library
  - `mcp__plugin_context7_context7__query-docs` → query docs
  - Use for: iOS HIG guidelines, SwiftUI component docs, MapLibre style specs

## Playwright (study reference apps)
```
mcp__plugin_playwright_playwright__browser_navigate — go to URL
mcp__plugin_playwright_playwright__browser_take_screenshot — capture
mcp__plugin_playwright_playwright__browser_snapshot — DOM inspection
```

### Reference App URLs
- Waze: https://www.waze.com (limited web version)
- Strava: https://www.strava.com
- AllTrails: https://www.alltrails.com
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/

## Context7 (official documentation)
```
mcp__plugin_context7_context7__resolve-library-id — find library
mcp__plugin_context7_context7__query-docs — query documentation
```

### Key Libraries
- SwiftUI (Apple)
- MapLibre GL Native iOS
- Ferrostar (navigation)

## Google Workspace (deliver presentations)
```bash
/opt/homebrew/bin/gws slides create --title "DirtSync — <Feature> Design"
/opt/homebrew/bin/gws slides add-slide --presentation-id <ID> --layout TITLE_AND_BODY
/opt/homebrew/bin/gws drive share --file-id <ID> --email steve@linkschoice.com --role writer
```

## Forge API
```
FORGE_API_URL=http://127.0.0.1:3200
Headers: X-Forge-Agent-Id: $FORGE_AGENT_ID

GET  /api/agent/me/inbox           — assigned issues
PATCH /api/agent/issues/:id        — update status + comment
POST /api/agent/issues             — create subtask
```

## Codebase (read-only reference)
```
~/DirtSync/DirtSync/DirtSyncApp/
├── Views/          — 67 SwiftUI views
├── Components/     — 36 reusable components
├── ViewModels/     — 8 view models
├── Services/       — 39 services
├── Models/         — 30 data models
├── ThemeManager.swift
└── Components/PremiumModifiers.swift — design system tokens
```
