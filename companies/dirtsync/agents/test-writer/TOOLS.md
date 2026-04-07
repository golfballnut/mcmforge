# TOOLS.md — DirtSync Test Writer

## Available Tools
- File read/write (create test files)
- Bash (verify compilation, git operations)
- Glob/Grep (find existing tests, accessibility IDs, view structure)
- Forge API (read issues, post comments)

## Key Files to Reference
- `DirtSyncUITests/NavHUDGoldStarTests.swift` — REFERENCE: 8 tests, Gold Star pattern
- `DirtSyncUITests/NavigationFlowUITests.swift` — REFERENCE: 6 nav state tests
- `DirtSyncUITests/WazeFlowUITests.swift` — REFERENCE: 5 Waze flow tests
- `DirtSyncUITests/AuthFlowUITests.swift` — REFERENCE: login/signup tests
- `DirtSyncApp/Services/UITestingRouteFactory.swift` — factory routes for --uitesting-navigate

## Accessibility ID Discovery
```bash
# Find all accessibility identifiers in the codebase
grep -rn 'accessibilityIdentifier' DirtSync/DirtSyncApp/ | grep -v '.build/'
```

## Compilation Check
```bash
cd DirtSync/DirtSync
xcodebuild build-for-testing -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 16" \
  2>&1 | grep -E "SUCCEEDED|FAILED|error:"
```

## Forge API
```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox
GET  /api/agent/issues/:id/context
PATCH /api/agent/issues/:id
```

## What You CANNOT Do
- Modify production Swift code (only test files)
- Run tests on Mini (Test Runner does that)
- Approve or reject features (Critique Agent does that)
- Push directly to master
