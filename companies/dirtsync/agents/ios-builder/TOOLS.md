# TOOLS.md — DirtSync iOS Builder

## Available Tools
- Xcode Build MCP (preferred for builds, simulator, screenshots)
- File read/write/edit
- Bash (git, xcodebuild, swift commands)
- Glob/Grep (code search)

## Key Commands

### Build
```bash
cd ~/DirtSync
xcodebuild -scheme DirtSync -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -20
```

### Test
```bash
xcodebuild test -scheme DirtSync -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -30
```

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
