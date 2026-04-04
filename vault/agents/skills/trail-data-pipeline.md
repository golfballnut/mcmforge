# Skill: Trail Data Pipeline Specialist

> Last updated: April 2, 2026
> Used by: DirtSync engineers, data pipeline agents, trail import agents
> Origin: Sessions 64-71 — trail data architecture and field testing

---

## Goal
Manage DirtSync's trail data from source to rendering. Understand the pipeline: Supabase → GeoJSON → MBTiles → MapLibre rendering → trail detection.

## Data Pipeline

### Source of Truth
- **Supabase table:** `trail_lines` (columns: trail_name, difficulty, trail_system, coordinates (JSONB), distance_miles, is_outlaw, etc.)
- **Gold-verified systems:** Burning Rock (96 trails, 67+29 outlaw) and Kidds Dairy Farm (11 trails)

### Pipeline Flow
```
Supabase trail_lines → export → all-trails.geojson → tippecanoe → trails.mbtiles → bundled in app
```

### Key Files
| File | Purpose | Size |
|------|---------|------|
| `DirtSync/tiles/all-trails.geojson` | Source GeoJSON for MBTiles | ~5MB |
| `DirtSync/DirtSyncApp/Resources/trails.mbtiles` | Bundled vector tiles | ~5MB |
| `valhalla_tiles.tar` | Routing graph tiles | varies |

### MBTiles Specifications
- **Zoom range:** z8-z16 (MapLibre overzooms beyond z16)
- **Layer name:** `trails` (from tippecanoe `-l trails`)
- **Build command:** `tippecanoe -o trails.mbtiles -z 16 -Z 8 --force --no-feature-limit --no-tile-size-limit -l trails all-trails.geojson`
- **Properties:** name, system, difficulty, distance_miles, is_connector, is_outlaw, ref, route_type

## Trail Detection Architecture (Session 71 — CORRECT approach)

### Primary: In-Memory GeoJSON Nearest-Point-on-Line
1. Trail data loaded at app launch: `TrailDataService.shared.trails` (1112 features)
2. Each GPS update → bounding box pre-filter (skip trails >200m away)
3. For each candidate → iterate every line segment → project GPS onto segment → clamp t∈[0,1]
4. Minimum distance < 100m = "on trail"
5. Extract: trail name, difficulty, system from TrailFeature.properties

### Nearest-Point-on-Segment Math
```swift
func nearestPointOnSegment(point, segStart, segEnd) -> (coordinate, distance):
    dx = segEnd.lon - segStart.lon
    dy = segEnd.lat - segStart.lat
    lengthSq = dx*dx + dy*dy
    t = clamp(((point.lon - segStart.lon)*dx + (point.lat - segStart.lat)*dy) / lengthSq, 0, 1)
    nearest = (segStart.lat + t*dy, segStart.lon + t*dx)
    return (nearest, CLLocation.distance)
```

### Fallback: CLGeocoder Road Names
- When no trail within 100m, reverse geocode for road name
- Rate limited: 1 call per 5 seconds, 50m minimum movement
- Returns `thoroughfare` (street name like "Route 16")

### DO NOT USE: MapLibre visibleFeatures
- Depends on screen coordinates (breaks when map not centered)
- MLNPolyline.coordinate returns MIDPOINT of polyline, not nearest point
- Only returns rendered/visible features

## Coordinate Gotchas

### Supabase vs MBTiles Coordinates DIVERGE
- Supabase `trail_lines.coordinates` and MBTiles geometry can be 100m+ offset
- Root cause: different processing pipelines, geometry simplification in tippecanoe
- GPX test tracks MUST use coordinates from `all-trails.geojson` (the MBTiles source)
- Trail detection uses in-memory TrailDataService data (from all-trails.geojson), NOT Supabase

### Test Coordinates
- **Burning Rock:** 37.68, -81.30 (MBTiles has trail data here)
- **Kidds Dairy Farm:** 37.818, -78.387 (MBTiles has trail data here)
- **UITesting coords:** 37.818, -78.386 (near Kidds Dairy)
- **DO NOT test at random coordinates** — no trail data = blank results

## Tile Building Scripts
| Script | Purpose | When to use |
|--------|---------|-------------|
| `build-trail-only-tiles.sh` | Trail routing tiles for Valhalla | Default for routing |
| `build-system-tiles.sh` | Trail + road tiles | Small systems needing road alternatives |

### CRITICAL: Tile builds OVERWRITE other systems
Always back up existing tiles before rebuilding. Need a merge script for multi-system builds.

## Anti-Patterns
1. NEVER use Supabase coordinates for GPS simulation — use all-trails.geojson
2. NEVER set zoom > z16 expecting trail data — MBTiles max is z16 (MapLibre overzooms)
3. NEVER use a 48KB stub MBTiles for testing — real file is ~5MB
4. NEVER test trail detection at random coordinates — must be at gold-verified systems
5. NEVER use feature.coordinate for distance — it's the polyline midpoint
