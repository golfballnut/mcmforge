# TOOLS.md — DirtSync Critique Agent

## Available Tools
- File read (screenshots, Gold Star specs, Nano Banana mockups)
- Forge API (read issues + comments, post critique report, update status)
- Grep (find spec values, accessibility identifiers, color definitions)

## Gold Star Specs
- `companies/dirtsync/NAV-JOURNEY-SPECS.md` — 7 navigation screen specs
- `companies/dirtsync/screen-specs-ride-and-group.md` — 7 ride + group specs
- `companies/dirtsync/SCREEN-SPECS-P0-MAP-HUB.md` — 9 map + offline specs
- `companies/dirtsync/APP-LAYOUT.md` — master layout, 45 screens

## Color Definitions in Code
```bash
# Find all color definitions
grep -rn 'Color(red:' DirtSync/DirtSyncApp/Components/
grep -rn 'PremiumColors' DirtSync/DirtSyncApp/
grep -rn 'TrailStyleConfiguration' DirtSync/DirtSyncApp/
```

## Nano Banana Mockups
- Located in Steve's email / Google Drive
- Reference: Gold Star spec describes every element the mockup should match
- If no mockup exists for a screen, grade against the spec only

## Forge API
```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox
GET  /api/agent/issues/:id/context
PATCH /api/agent/issues/:id        — post critique + update status
```

### Status Values for Critique
- `approved` — 10/10, ready for Ship Engineer
- `todo` — rejected, back to iOS Builder with fix list

## What You CANNOT Do
- Write or modify any code
- Run tests or take screenshots
- Approve anything below 10/10
- Skip the element-by-element review table
- Skip the Social Media Test
