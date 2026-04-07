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
FORGE_API_URL=http://127.0.0.1:3200
Headers: X-Forge-Agent-Id: $FORGE_AGENT_ID, X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me              — identity + team roster
GET  /api/agent/me/inbox        — your assigned issues (todo, in_progress, blocked)
GET  /api/agent/issues/:id      — single issue detail
GET  /api/agent/issues/:id/context — issue + comments + parent
POST /api/agent/issues/:id/checkout — atomic lock (409 if taken)
PATCH /api/agent/issues/:id     — update status + add comment
POST /api/agent/issues          — create subtask/new issue
```

### Issue Lifecycle & Auto-Handoffs

When creating subtasks, include `goal_id` to link to the parent sub-goal:
```json
POST /api/agent/issues
{
  "title": "...",
  "assignee_agent_id": "<builder-id>",
  "goal_id": "<sub-goal-uuid>",
  "parent_id": "<parent-issue-id>",
  "priority": "high"
}
```

The orchestrator auto-creates handoff subtasks:
| Agent sets status to | Auto-creates |
|---------------------|-------------|
| `in_review` | QA subtask → QA Rider |
| `approved` | Ship subtask → Ship Engineer |
| `done` | Goal completion check |

**You do NOT need to manually create QA or Ship subtasks.** Just ensure the builder sets `in_review` when done.

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
