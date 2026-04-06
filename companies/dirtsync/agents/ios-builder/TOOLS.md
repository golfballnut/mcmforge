# TOOLS.md — DirtSync iOS Builder

## Available Tools
- Xcode Build MCP (preferred for builds, simulator, screenshots)
- File read/write/edit
- Bash (git, xcodebuild, swift commands)
- Glob/Grep (code search)

## Key Commands

### Xcode Build MCP (preferred for ALL builds)
- `mcp__XcodeBuildMCP__session_show_defaults` — check current config (run this first every session)
- `mcp__XcodeBuildMCP__session_set_defaults` — set project/scheme/sim (project=DirtSync/DirtSync.xcodeproj, scheme=DirtSync, simulator=iPhone 16)
- `mcp__XcodeBuildMCP__build_sim` — build for simulator
- `mcp__XcodeBuildMCP__build_run_sim` — build + launch in simulator
- `mcp__XcodeBuildMCP__test_sim` — run tests on simulator
- `mcp__XcodeBuildMCP__screenshot` — capture simulator screen
- `mcp__XcodeBuildMCP__snapshot_ui` — get UI hierarchy with coordinates
- `mcp__XcodeBuildMCP__list_sims` — list available simulators
- `mcp__XcodeBuildMCP__boot_sim` — boot a simulator

### Git
```bash
cd ~/DirtSync
git checkout -b agent/<slug>
git push -u origin agent/<slug>
gh pr create --base master --title "..." --body "..."
```

## Project Structure
```
DirtSync/DirtSync/
├── Views/
│   ├── Navigation/NavigationHUDView.swift    — main HUD during nav
│   ├── Navigation/RoutePreviewView.swift     — route selection
│   ├── Map/MapContainerView.swift            — MapLibre wrapper
│   └── Rides/RideRecordingView.swift         — active ride UI
├── Services/
│   ├── NavigationService.swift               — nav state machine
│   ├── TrailDetectionService.swift           — on-trail/off-trail detection
│   ├── HybridRoutingService.swift            — Valhalla + road routing
│   ├── RideRecordingService.swift            — GPX track recording
│   └── OfflineManager.swift                  — tile/data caching
├── Models/
│   ├── Trail.swift
│   ├── POI.swift
│   └── RideTrack.swift
└── Resources/
    ├── all-trails.geojson                    — 1,259 trails
    └── *.mbtiles                             — offline tiles
```

## What You CANNOT Do
- Push to master
- Modify all-trails.geojson (trail data pipeline only)
- Change routing endpoints without CEO approval
- Disable offline features
