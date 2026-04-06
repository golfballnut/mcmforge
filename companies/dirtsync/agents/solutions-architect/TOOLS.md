# TOOLS.md — DirtSync Solutions Architect

## Available Tools
- File read/write/edit (implementation plans, architecture docs)
- Glob/Grep (codebase exploration, dependency mapping)
- Bash (git status, swift package resolve, file counts)

## Codebase Exploration

```bash
# Count files by type
find ~/DirtSync/DirtSync -name "*.swift" | wc -l

# Find all services
find ~/DirtSync/DirtSync -path "*/Services/*.swift" | sort

# Search for usage of a service
grep -r "NavigationService.shared" ~/DirtSync/DirtSync --include="*.swift" -l

# Check imports (dependency map)
grep -r "^import" ~/DirtSync/DirtSync/Services/NavigationService.swift
```

## Technology Stack Reference

```
iOS:        Swift 6, SwiftUI, MVVM
Maps:       MapLibre GL Native iOS v6.x — MLNMapView, custom styles, annotations
Navigation: Ferrostar — NavigationState, RouteAdapter, custom HUD views
Routing:    Valhalla on Fly.io (trail tiles only) + HybridRoutingService (roads)
Backend:    Supabase (lldipxvwocpqncixlnxj) — Auth, Realtime, Storage, Postgres
Offline:    MBTiles (map tiles), bundled GeoJSON (trail data), SQLite (local state)
Testing:    XCTest (unit), XCUITest (UI), iOS Simulator (iPhone 16)
```

## Project File Structure
```
DirtSync/
├── DirtSync.xcodeproj
├── DirtSync/
│   ├── DirtSyncApp.swift
│   ├── Views/
│   │   ├── Navigation/NavigationHUDView.swift
│   │   ├── Navigation/RoutePreviewView.swift
│   │   ├── Map/MapContainerView.swift
│   │   └── Rides/RideRecordingView.swift
│   ├── Services/
│   │   ├── NavigationService.swift           — nav state machine
│   │   ├── TrailDetectionService.swift        — on/off trail detection
│   │   ├── HybridRoutingService.swift         — Valhalla + road routing
│   │   ├── RideRecordingService.swift         — GPX track recording
│   │   └── OfflineManager.swift              — tile/data caching
│   ├── Models/
│   │   ├── Trail.swift
│   │   ├── POI.swift
│   │   └── RideTrack.swift
│   └── Resources/
│       ├── all-trails.geojson               — 1,259 trails, 26 systems
│       └── *.mbtiles                        — offline map tiles
└── DirtSyncTests/
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox             — assigned architecture issues
GET  /api/agent/issues/:id/context   — design spec + all comments
PATCH /api/agent/issues/:id          — post implementation plan, update status
POST /api/agent/issues               — create builder subtasks from the plan
```

### Status flow
- `todo` → `in_progress` when analyzing design spec
- `in_progress` → `in_review` when implementation plan posted (awaits CEO approval)

## Architecture Constraints

- **Fly.io Valhalla** has trail tiles only. Use `HybridRoutingService` for any road segments.
- **Singletons:** `NavigationService.shared`, `TrailDetectionService.shared`, `OfflineManager.shared`
- **Offline-first:** all core data bundled. Supabase sync is background-only, never blocking.
- **No new frameworks** without CEO approval in writing.

## What You CANNOT Do
- Write Swift implementation code
- Modify `all-trails.geojson` (trail data pipeline only)
- Approve your own implementation plans — CEO approves
- Assign two agents to the same file in any plan
