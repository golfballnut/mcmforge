# Screen Recording Notes — FORGE-252

Playwright MCP does not support `.webm` video recording directly.
The walkthrough was executed via `browser_run_code` and verified via screenshots.

## Verified walkthrough steps (executed at 2026-04-18 ~22:31 ET)

1. Navigate to `/issues` — list view shows Stage column with "Executing" / "Filed" pills
2. Click "All" tab — all 267 issues visible including done/shipped ones
3. Click Card view toggle — 3-column grid renders with identifier, title, stage pill, priority badge, counts
4. Scroll through cards — Executing / Filed / Shipped / Blocked stages visible
5. Click List view toggle — reverts to list with Stage column intact
6. Resize to 414px — single column card layout, no horizontal scroll

## Static screenshot evidence

- `after-list-view.png` — list with Stage column + toggle icons
- `after-card-view.png` — 3-column card grid with stage pills
- `mobile-card-414.png` — 414px single column, no overflow
