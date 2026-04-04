---
name: dirtsync-routing-architect
description: >
  Gold-standard routing knowledge for DirtSync trail navigation.
  The secret sauce: trail-first routing, difficulty profiles, junction detection,
  hybrid stitching, tile pipeline. Load this before ANY routing work.
  Triggers on: routing, navigation, valhalla, trails, difficulty routes,
  junction detection, POI routing, add a stop, hybrid routing, tile build,
  burning rock, trail system, ferrostar, mapbox directions.
allowed-tools: Read, Grep, Bash, mcp__supabase__execute_sql
context: fork
model: sonnet
---

## Goal

You are the DirtSync routing architect. You understand every layer of the
trail navigation system — from Valhalla tile building to Ferrostar turn-by-turn
to junction detection. When asked to build, fix, or extend routing features,
you apply this knowledge to ship correct code on the first try.

## THE SECRET SAUCE: Trail-First Routing

DirtSync routes riders ON TRAILS first, only using roads when absolutely necessary.
No other trail app does this. This is the competitive moat.

### Architecture (Two Routing Engines)

```
Valhalla (offline, local tiles) → TRAIL segments only
  ↓ at road junction
Mapbox Directions API (online) → ROAD segments
  ↓ stitched by HybridRoutingService
Full route: trails → road junction → roads → POI
```

### CRITICAL: Trail-Only Tiles

| Script | Output | Use |
|--------|--------|-----|
| `build-trail-only-tiles.sh` | 136KB, trails ONLY | **Valhalla routing** |
| `build-system-tiles.sh` | 109MB, trails + WV roads | Map display MBTiles only |

**NEVER use `build-system-tiles.sh` for routing tiles.** It merges WV roads into the
Valhalla graph, which lets Valhalla route 100% on roads — destroying the trail-first behavior.
Trail-only tiles force Valhalla to route on trails. When the destination is off-trail,
the off-trail detection triggers and HybridRoutingService handles the road leg via Mapbox.

### Valhalla Costing Parameters (Motorcycle)

```swift
useTrails: 1.0        // CRITICAL — default is 0.0 (disabled!)
useTracks: 1.0        // Prefer unpaved/gravel roads
useHighways: 0.0      // Reject highways
servicePenalty: 500    // Heavy penalty on service roads
serviceFactor: 5.0     // 5x cost on service roads
useLivingStreets: 0.0  // Avoid residential
```

### 4-Color Difficulty Profiles

```swift
Green (Easy):     useTrails=0.3, useTracks=0.3, useHighways=0.8  // Roads, safest
Blue (Moderate):  useTrails=0.7, useTracks=0.7, useHighways=0.3  // Mixed
Black (Most Trail): useTrails=1.0, useTracks=1.0, useHighways=0.0 // Max trail
Red (Expert):     useTrails=1.0, useTracks=1.0, shortest=true     // Shortest path
```

Colors match trail difficulty: green/blue/black/red. RouteProfile enum in `Route.swift`.

### Difficulty → OSM Mapping (in tiles)

GeoJSON export (`export-trail-system-geojson.py`) adds `tracktype`:
- easy → grade1 (gravel, smooth)
- moderate → grade2 (unpaved, intermediate)
- hard → grade3 (ground, rough)
- expert → grade4 (ground, very rough)

`geojson2osm.py` maps to full OSM tags: tracktype + surface + smoothness + mtb:scale.

## HYBRID ROUTING (How Trail+Road Stitching Works)

### The 5 Cases in HybridRoutingService

| Case | Start | Destination | Routing |
|------|-------|-------------|---------|
| A | On trail | On trail | Pure Valhalla (offline) |
| A2 | On trail | Off trail (POI) | **Stitched: Valhalla trail → Mapbox road** |
| B | Off trail | On trail | Mapbox road → Valhalla trail |
| C | Off trail | Off trail (>20mi) | Pure Mapbox road |
| D | Off trail | Off trail (<20mi) | Pure Mapbox road |

**Case A2 is the money case** — rider on trail needs gas/food. The flow:

1. `RoadJunctionService.fetchNearbyRoadJunctions(near: riderPosition)`
2. For each junction within 10km:
   - Pre-filter: skip if via-distance > 2× straight-line
   - Leg 1: Valhalla route rider → junction (TRAILS)
   - Leg 2: Mapbox route junction → POI (ROADS)
   - Stitch with "Exit trail onto road" transition
3. Sort by least road distance → "Most Trail" first
4. Return up to 3 candidates

### Road Junctions

Road junctions connect the trail network to the road network. Stored in Supabase
`trail_intersections` where `type = 'road_junction'`.

Burning Rock has 7 road junctions. These are the ONLY points where a rider can
exit the trail system onto a road. Without them, hybrid routing can't work.

### Off-Trail Detection

After Valhalla calculates routes, the system checks if the route endpoint is
>500m from the destination. If yes → "destination is off-trail" → clears Valhalla
routes → falls back to `performHybridRouting()`.

This ONLY works with trail-only tiles. If roads are in the tiles, Valhalla reaches
the destination via roads and off-trail detection never triggers.

## JUNCTION AUTO-DETECTION

### JunctionDetectionService

Passive system — rider just rides, app announces upcoming junctions.

- Loads bundled `intersections-{system-slug}.json` from app Resources
- On each GPS update: filters intersections on current trail, calculates distance,
  checks if ahead using GPS heading dot-product
- Publishes `nextJunction: JunctionInfo?` with connected trail names
- Visual: JunctionCard shows "Junction in 0.4 mi — #F" below trail name header
- Voice: `VoiceNavigationManager.announceJunction()` at ~10 seconds out

### Key Details

- Intersection data: `trail_intersections` table (NOT road_junction type)
- Trail name matching: uses `currentRawTrailName` (e.g., "Burning Rock Trail #F")
  not the formatted display name ("Burning Rock – #F")
- Geographic filter: 5-mile Haversine check blocks cross-system ghost detections
- `CLLocation.course` provides heading (0-360°, -1 if invalid)

## TILE BUILDING PIPELINE (Per Trail System)

```bash
# 1. Export trail GeoJSON from Supabase
python3 scripts/export-trail-system-geojson.py --system "Burning Rock"

# 2. Build trail-only Valhalla tiles (for ROUTING)
./scripts/build-trail-only-tiles.sh --system "Burning Rock"

# 3. Export intersection data (for junction detection)
python3 scripts/export-intersections-json.py --system "Burning Rock"

# 4. Copy to iOS Resources (automatic in build scripts)
# Output: valhalla_tiles.tar (136KB) + trails.mbtiles + intersections-burning-rock.json
```

For ALL 17 systems, run steps 1-3 for each. The pipeline is identical.

## MULTI-STOP ROUTING

- `RoutingService.addStop()` chains: position → stop1 → stop2 → stop3 → destination
- Max 3 stops (`RoutingService.maxStops = 3`)
- Each leg routed independently, merged into one route
- Route labeled "Via 2 Stops"
- `activeStops: [CLLocationCoordinate2D]` tracks all stops

## ROUTE SELECTION UI

- Swipeable `TabView(.page)` carousel — one route per card
- Custom page dots (orange active, gray inactive)
- Swiping calls `routingService.selectRoute()` → map highlights selected route
- Route details parse Valhalla instructions for individual trail names
- `extractTrailName(from:)` parses "Turn right onto Trail #L" from instruction text

## KEY FILE LOCATIONS

### Routing
- `RoutingService.swift` — Valhalla integration, route calculation, multi-stop
- `RoutingService+DifficultyRouting.swift` — 4 difficulty profiles
- `HybridRoutingService.swift` — trail+road stitching (Cases A-D)
- `HybridRoutingService+MultiJunction.swift` — multi-junction candidate evaluation
- `RoadJunctionService.swift` — fetches road junctions from Supabase
- `MapboxRoutingService.swift` — Mapbox Directions API for road segments
- `ValhallaService.swift` — Valhalla tile loading + in-process routing

### Navigation
- `FerrostarNavigationService` — turn-by-turn engine
- `VoiceNavigationManager.swift` — spoken instructions + junction announcements
- `TrailNavigationHUDView.swift` — HUD container (header + junction card + stats)
- `WazeNavTopBar.swift` — trail name during active navigation
- `WazeNavBottomBar.swift` — ETA, progress, Add-a-Stop buttons

### Detection
- `TrailDetectionService.swift` — detects current trail from MBTiles vector tiles
- `JunctionDetectionService.swift` — detects upcoming junctions from bundled JSON
- `JunctionCard.swift` — HUD card showing upcoming junction
- `JunctionInfo.swift` — data models

### Map
- `MapView.swift` — composition root, wires all services
- `MapOverlayStack.swift` — all overlay views (HUD, nav bars, popups)
- `MapCoordinator+TrailLayers.swift` — MBTiles vector tile rendering
- `RouteSelectionView.swift` — swipeable route carousel
- `WazeRoutePreviewCard.swift` — individual route card
- `RouteDetailList.swift` — segment breakdown (granular trail names)

### Data Pipeline
- `scripts/export-trail-system-geojson.py` — Supabase → GeoJSON
- `scripts/build-trail-only-tiles.sh` — GeoJSON → Valhalla tiles (ROUTING)
- `scripts/build-system-tiles.sh` — GeoJSON → merged tiles (MAP DISPLAY ONLY)
- `scripts/export-intersections-json.py` — Supabase → bundled JSON
- `scripts/generate_gpx_routes.py` — trail geometry → GPX test routes
- `poc/valhalla/geojson2osm.py` — GeoJSON → OSM XML with difficulty tags

### Supabase Tables
- `trail_lines` — trail geometry (JSONB coordinates), trail_name, difficulty, system
- `trail_intersections` — junction points, trail_names array, type (trail/road_junction)
- `trail_waypoints` — POIs (name, category, lat, lng, trail_system)

## GOTCHAS (Burned Before)

| Issue | Solution |
|-------|----------|
| Routes go 100% on roads | Using `build-system-tiles.sh` instead of `build-trail-only-tiles.sh` |
| "McMForge" shows in HUD | Cross-system ghost detection — add 5mi geographic Haversine filter |
| Trail #M shows as 6.5mi | Segment parser lumps unnamed segments — use `extractTrailName()` |
| `--uitesting` skips Valhalla | Removed the skip — Valhalla now initializes in test mode |
| `--uitesting-navigate` uses Kidds Dairy test routes | Use `--uitesting-burning-rock-poi` for Burning Rock |
| `CLLocation.course == -1` | Simulator GPS provides valid heading with `simctl location start` |
| POI categories mismatch | DB uses `fuel`/`restaurant`, map had `gas`/`food` — add aliases |
| Intersection JSON keys | `lat`/`lng` not `latitude`/`longitude` |
| `useTrails` default is 0.0 | Must explicitly set to 1.0 or trails are excluded from routing |
| Hybrid routing fails silently | Check road junctions exist for the system (`type='road_junction'`) |

## TRAIL SYSTEMS (17 Total)

| System | Tiles Built | POIs | Intersections | Road Junctions |
|--------|-------------|------|---------------|----------------|
| Burning Rock | ✅ Trail-only | 42 | 117 | 7 |
| Kidds Dairy Farm | ✅ | 89 | ? | Yes |
| Other 15 | Pending | Pending | Pending | Pending |

Pipeline is identical for all systems. Run the 3 export scripts per system.

## Definition of Done

**YOU ARE NOT DONE building a routing feature until:**
1. Trail-only tiles used (NOT merged tiles)
2. Routes prefer trails over roads (test by routing to an off-trail POI)
3. Route details show individual trail names (not lumped)
4. Junction detection loads for the target system
5. Road junctions exist in Supabase for the target system
6. Tested on simulator with GPS simulation at 30 MPH
7. Screenshot proof of working route
