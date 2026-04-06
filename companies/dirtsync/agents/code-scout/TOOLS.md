# TOOLS.md — DirtSync Code Scout

> **Note:** Code Scout runs on Codex (GPT-5.4, NOT Claude). No MCP tools available.
> Tools: bash (read-only), file read, grep, git log/diff only.

## Available Tools
- Bash read-only (find, grep, cat, git log, git diff — NO writes, NO commits)
- File read (Swift source files, test files, package manifests)
- Grep (dependency mapping, pattern detection across codebase)

## Code Analysis Commands

```bash
# Read a specific file
cat ~/DirtSync/DirtSync/Services/NavigationService.swift

# Find all imports (dependency map)
grep "^import" ~/DirtSync/DirtSync/Services/NavigationService.swift

# Find callers of a service
grep -rn "NavigationService.shared" ~/DirtSync/DirtSync --include="*.swift"

# Map service-to-service dependencies
grep -rn "\.shared\." ~/DirtSync/DirtSync/Services --include="*.swift"

# Find all @Published properties in a ViewModel
grep -n "@Published" ~/DirtSync/DirtSync/ViewModels/NavigationViewModel.swift

# List all Swift files in a directory
find ~/DirtSync/DirtSync/Services -name "*.swift" | sort

# Check test coverage gaps
find ~/DirtSync/DirtSyncTests -name "*.swift" | sort
```

## Git Analysis (read-only)

```bash
# Recent changes to a file
git -C ~/DirtSync log --oneline -10 -- DirtSync/Services/NavigationService.swift

# Diff of recent changes
git -C ~/DirtSync diff HEAD~1 -- DirtSync/Services/NavigationService.swift

# Who last changed a file
git -C ~/DirtSync log --format="%h %an %s" -5 -- DirtSync/Services/TrailDetectionService.swift
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox           — assigned analysis tasks
GET  /api/agent/issues/:id/context — analysis brief + design spec
PATCH /api/agent/issues/:id        — post analysis report, update status
```

### Status flow
- `todo` → `in_progress` when analysis starts
- `in_progress` → `done` when analysis report posted as issue comment

## Project Structure
```
~/DirtSync/DirtSync/
├── Views/          — SwiftUI views (Navigation, Map, Rides, Settings)
├── Components/     — Reusable UI components
├── ViewModels/     — MVVM view models (@Published, @ObservableObject)
├── Services/       — Business logic singletons (.shared pattern)
├── Models/         — Data models (Swift structs/classes)
└── Resources/
    ├── all-trails.geojson    — 1,259 trails, READ-ONLY
    └── *.mbtiles             — offline map tiles, READ-ONLY

~/DirtSync/DirtSyncTests/     — XCTest unit tests
```

## Analysis Report Format

```markdown
## Analysis: <File or Feature>
**File:** `~/DirtSync/DirtSync/<path>`

### Purpose
<one sentence>

### Dependencies
- `<ServiceName>.shared` — <why it's used>

### Data Flow
View → ViewModel → Service → DataSource

### Key Methods
| Method | Purpose | Calls |
|--------|---------|-------|
| `methodName()` | <what it does> | `ServiceA.method()` |

### Issues Found
- <potential bug or tech debt with line reference>

### Reusable Components
- `<ComponentName>` at `<path>` — could be reused for <use case>
```

## What You CANNOT Do
- Write or edit any Swift source files (iOS Builder's job)
- Create git commits or branches
- Access MCP tools (XcodeBuildMCP, Supabase, Playwright)
- Produce design specs or implementation plans (Architect's job)
- Run xcodebuild or simulator commands
