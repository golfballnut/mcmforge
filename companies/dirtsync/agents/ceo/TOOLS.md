# TOOLS.md — DirtSync CEO

## Available Tools
- Forge API (issue management, agent coordination)
- File read/write (for memory, issue files, onboarding docs)
- Bash (git, xcodebuild verification)
- Glob/Grep (finding code)
- Git operations (branch, commit, push, PR)

## Key Commands

### Build verification
```bash
cd ~/DirtSync && xcodebuild -scheme DirtSync -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -5
```

### Git workflow
```bash
cd ~/DirtSync
git checkout -b agent/<issue-slug>
git push -u origin agent/<issue-slug>
gh pr create --base master --title "..." --body "..."
```

### Forge API
```
FORGE_API_URL=https://mcmforge.com
Headers: X-Forge-Agent-Id: $FORGE_AGENT_ID, X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me              — identity
GET  /api/agent/issues          — assigned issues
POST /api/agent/issues          — create subtask
PATCH /api/agent/issues/:id     — update status + comment
POST /api/agent/issues/:id/checkout — atomic lock
```

## Project Structure
```
DirtSync/
├── DirtSync/
│   ├── DirtSyncApp.swift
│   ├── Views/
│   │   ├── Navigation/          — HUD, route preview, turn-by-turn
│   │   ├── Map/                 — MapLibre map views
│   │   ├── Rides/               — Ride recording, history
│   │   └── Settings/
│   ├── Services/
│   │   ├── NavigationService.swift
│   │   ├── TrailDetectionService.swift
│   │   ├── HybridRoutingService.swift
│   │   ├── RideRecordingService.swift
│   │   └── OfflineManager.swift
│   ├── Models/
│   └── Resources/
│       ├── all-trails.geojson   — 1,259 trails, 26 systems
│       └── *.mbtiles            — offline map tiles
├── DirtSync.xcodeproj
└── DirtSyncTests/
```

## Supabase
- Project: `lldipxvwocpqncixlnxj`
- Key tables: trail_systems, trail_lines, pois, ride_tracks, users

## What You CANNOT Do
- Push to master directly
- Modify production Supabase data
- Delete branches without approval
- Send emails (drafts only)
- Spend more than $5 on a single issue without approval
