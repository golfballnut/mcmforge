# TOOLS.md — DirtSync QA Rider

## Available Tools
- XcodeBuildMCP (preferred — build, simulator, screenshots, UI snapshot)
- File read/write (issue context, QA reports, screenshots)
- Bash (xcodebuild, simctl, git status)
- Glob/Grep (find test files, check coverage)

## XcodeBuildMCP Commands

### Session defaults — run first every session
```
mcp__XcodeBuildMCP__session_show_defaults
```

### Build and run in simulator
```
mcp__XcodeBuildMCP__build_sim
  projectPath: ~/DirtSync/DirtSync.xcodeproj
  scheme: DirtSync
  simulatorName: iPhone 16

mcp__XcodeBuildMCP__build_run_sim
  projectPath: ~/DirtSync/DirtSync.xcodeproj
  scheme: DirtSync
  simulatorName: iPhone 16
```

### Screenshot and UI inspection
```
mcp__XcodeBuildMCP__screenshot
  simulatorName: iPhone 16

mcp__XcodeBuildMCP__snapshot_ui
  simulatorName: iPhone 16
```

### Run tests
```bash
xcodebuild test -scheme DirtSync \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  2>&1 | tail -30
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox           — assigned issues
GET  /api/agent/issues/:id         — issue detail
GET  /api/agent/issues/:id/context — issue + all comments + parent
POST /api/agent/issues/:id/checkout — lock issue (409 if taken)
PATCH /api/agent/issues/:id        — update status, add comment
POST /api/agent/issues             — create QA subtask
```

### Status values
- `todo` → `in_progress` when starting QA
- `in_progress` → `in_review` when QA report posted (pass)
- `in_progress` → `blocked` if build fails

## Project Structure
```
DirtSync/
├── DirtSync.xcodeproj              — open this project
├── DirtSync/
│   ├── Views/Navigation/           — HUD, route preview, turn-by-turn
│   ├── Views/Map/                  — MapLibre map views
│   ├── Views/Rides/                — ride recording UI
│   └── Services/                   — NavigationService, TrailDetectionService
└── DirtSyncTests/                  — unit tests
    └── DirtSyncUITests/            — UI tests
```

## Visual Verification
- **Mockuuups MCP** — generate device frame mockups for QA reports
- **Playwright MCP** — screenshot reference apps for comparison
  - Capture Waze nav HUD at same zoom → compare with DirtSync screenshot
- Compare screenshots against Gold Star spec measurements

## What You CANNOT Do
- Approve any feature without an attached screenshot
- Mark `in_review` if build fails
- Skip the offline state test
- Push code or create PRs
- Modify Swift source files
