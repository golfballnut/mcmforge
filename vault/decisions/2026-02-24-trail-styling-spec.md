# Decision: DirtSync Trail Styling Spec (APPROVED)
- **Date**: 2026-02-24
- **Status**: Approved by Steve
- **Design Review**: vault/agents/design-reviews/trail-styling-v2.html

## Trail Line Styling

### Official Trails (Solid Line)
- Thin white casing (stroke-width ~4.5px, rgba(255,255,255,0.3))
- Hard trails get brighter casing (rgba(255,255,255,0.55)) for visibility on dark satellite
- Colored center line (stroke-width ~2.8px, solid):
  - Easy: #0f6b1f (dark forest green)
  - Moderate: #1D4ED8 (deep blue)
  - Hard: #333 (dark gray, needs white casing contrast)
  - Expert: #D9342E (vivid red)

### Outlaw Trails (Dashed Line)
- SAME difficulty colors as official trails (NOT gold — gold was old spec)
- SAME thin white casing as official trails
- Center line is DASHED (stroke-dasharray: 7 5) — the dash is the ONLY visual difference from official
- Visible at the SAME zoom level as official trails (minzoom: 9, NOT 12)

### Key Principle
- Solid line = official
- Dashed line = outlaw
- Color = difficulty (both trail types)
- User can toggle outlaw trails off via the Outlaw Trails toggle

## Badge Styling

### Official Trail Badge (unchanged)
- Dark pill: rgba(20, 22, 28, 0.92)
- Border: 1px solid rgba(255,255,255,0.12)
- Left: difficulty color dot (6px circle)
- Right: trail code in white text (9px, font-weight 600)
- Example: [green dot] PC 20

### Outlaw Trail Badge (APPROVED: Split Badge — Variation F)
- Two-tone split pill design:
  - LEFT HALF: gold background (rgba(212,148,10,0.3)), contains "OL" text in gold (#D4940A), 7px JetBrains Mono bold, letter-spacing 1px
  - RIGHT HALF: dark background (rgba(20,22,28,0.92)), contains difficulty color dot (6px) + trail name in white (9px)
- Border: 1px solid rgba(255,255,255,0.08)
- Border-radius: 10px with overflow hidden
- Example: [gold "OL" | green dot Barkers Creek]

### Badge Visibility
- ALL badges (official + outlaw) visible at same zoom level (minzoom: 10)
- Outlaw badges only show when outlaw toggle is ON

## Waypoint HUD (Speed Display)
- When on outlaw trail: show "OUTLAW" in gold + difficulty in color
- When on official trail: show difficulty only
- Format: speed | trail name / OUTLAW · EASY

## Related Files
- [[companies/dirtsync.md]] — TrailMap.tsx lines 815-913 (outlaw layer), 1001-1034 (badge system)
- [[competitors/onx.md]] — reference for badge style (HMRH-22 pills)
