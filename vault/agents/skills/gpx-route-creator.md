---
name: gpx-route-creator
description: >
  Generate GPX test routes from trail geometry in Supabase for simulator testing.
  Triggers on: create GPX route, generate test track, build GPX, simulator route,
  test route for burning rock, trail simulation, gpx test file.
argument-hint: "[trail-system-name] [route-type: trail-only|poi-stop]"
allowed-tools: Read, Write, Bash(python3), mcp__supabase__execute_sql
context: fork
model: sonnet
---

## Goal

Generate realistic GPX test route files from actual trail geometry stored in Supabase. Routes simulate a rider moving at 15 MPH along real trails. Two route types: trail-only (stay on trails) and poi-stop (trail → road to POI → back to trail). Output .gpx files that load directly into the iOS Simulator for DirtSync QA testing.

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. .gpx file created with valid GPX 1.1 XML
2. Route follows actual trail geometry from `trail_lines` table (NOT straight lines between random points)
3. Waypoints spaced at 15 MPH intervals (~0.004167° per second at WV latitudes)
4. Route length is 5mi ± 1mi (unless specified otherwise)
5. File placed in `DirtSync/DirtSyncUITests/GPXRoutes/`
6. GPX validates: has `<gpx>`, `<trk>`, `<trkseg>`, `<trkpt>` with lat/lon/time attributes
7. For poi-stop routes: includes road segment from trail to POI and back

## Pre-Made Decisions
**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Speed | 15 MPH simulated (1 waypoint per second = ~22ft spacing) |
| GPX version | 1.1 |
| Output dir | `/Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSyncUITests/GPXRoutes/` |
| Trail data source | Supabase `trail_lines` table, `geometry` column (PostGIS LineString) |
| Intersection data | Supabase `trail_intersections` table for connected route planning |
| Time format | ISO 8601: `2026-01-01T12:00:00Z` (start time arbitrary, intervals matter) |
| Naming convention | `{system-slug}-{route-type}-{number}.gpx` (e.g., `burning-rock-trail-only-1.gpx`) |
| Supabase project | `lldipxvwocpqncixlnxj` |

## Context

Trail geometry is stored as JSONB arrays of `[lng, lat]` pairs in `trail_lines.coordinates`. Extract with:
```sql
SELECT trail_name, difficulty, distance_miles, coordinates,
       jsonb_array_length(coordinates) as num_points
FROM trail_lines
WHERE trail_system = 'Burning Rock' AND coordinates IS NOT NULL
ORDER BY trail_name;
```

Intersections connect trails (trail_names is a text array):
```sql
SELECT trail_names, lat, lng, trail_count
FROM trail_intersections
WHERE trail_system = 'Burning Rock'
ORDER BY trail_count DESC;
```

**Pre-built script:** `scripts/generate_gpx_routes.py` handles the full pipeline.
```bash
python3 scripts/generate_gpx_routes.py --system "Burning Rock" --type all --count 5 --poi-categories fuel restaurant
```

## Gotchas

| Issue | Solution |
|-------|----------|
| Trail coordinates are [lng, lat] in PostGIS | GPX needs `lat` and `lon` attributes — swap the order |
| Some trails are very short (<0.1mi) | Chain multiple connected trails via intersections to reach 5mi target |
| Coordinate density varies | Some trails have points every 10ft, others every 100ft. Interpolate to consistent 22ft spacing |
| poi-stop routes need road segments | For POI detours: straight-line from trail exit to POI, then back. Real road routing is a stretch goal. |
| GPX time must be monotonically increasing | Each waypoint gets +1 second from previous. Never duplicate timestamps. |
| Empty geometry | Some trail_lines rows may have NULL geometry. Skip them, log warning. |

## Route Building Algorithm

### Trail-Only
1. Query all trails for the system with geometry
2. Pick a starting trail (prefer one near a trailhead POI)
3. Follow connected trails via intersection table until reaching ~5mi
4. Extract coordinate arrays, concatenate in traversal order
5. Interpolate to 15 MPH waypoint spacing
6. Write GPX with timestamps

### POI-Stop
1. Build a trail-only base route (~3mi)
2. At the midpoint, find the nearest POI of the requested category
3. Insert a detour: trail exit point → POI location → back to trail
4. Continue trail route for remaining ~2mi
5. Total should be ~5mi including detour

## Output

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DirtSync Route Generator">
  <trk>
    <name>Burning Rock Trail-Only Route 1</name>
    <trkseg>
      <trkpt lat="37.7312" lon="-81.3456">
        <time>2026-01-01T12:00:00Z</time>
      </trkpt>
      <trkpt lat="37.7314" lon="-81.3458">
        <time>2026-01-01T12:00:01Z</time>
      </trkpt>
      <!-- ... -->
    </trkseg>
  </trk>
</gpx>
```

## Checklist

### Before Starting
- [ ] trail_lines table has geometry for target system
- [ ] Output directory exists
- [ ] trail_intersections available for route chaining

### During Execution
- [ ] Coordinates extracted in correct [lat, lon] order (NOT PostGIS [lng, lat])
- [ ] Waypoint spacing consistent (~22ft / 1 second intervals)
- [ ] Route length within 5mi ± 1mi
- [ ] Timestamps monotonically increasing

### After Running
- [ ] .gpx file written to output dir
- [ ] File is valid XML (parseable)
- [ ] Total waypoint count reported
- [ ] Route distance reported
