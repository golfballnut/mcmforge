# Skill: Valhalla Routing Specialist

> Last updated: April 2, 2026
> Used by: DirtSync engineers, routing agents, navigation agents
> Origin: Session 71 — official Valhalla documentation research

---

## Goal
Build Valhalla-based routing features using documented APIs. The DirtSync app uses valhalla-mobile (Swift) with locally bundled tiles for offline trail routing.

## DirtSync Valhalla Setup
- **Package:** `Rallista/valhalla-mobile` v0.3.1 (latest: 0.5.0)
- **Tiles:** `valhalla_tiles.tar` bundled in app (177 tiles, Kidds Dairy area)
- **Config:** Created at runtime via `createValhallaConfig(tilesTarPath:)`
- **Instance:** Shared via `RoutingService.shared.valhalla` → `HybridRoutingService.shared.setValhalla()`
- **Costing:** Uses `auto` and `bicycle` profiles. `motorcycle` profile available but untested.

## Swift API (Current — v0.3.1)

The wrapper exposes ONLY `route`:
```swift
public func route(request: RouteRequest) throws -> RouteResponse  // typed
public func route(rawRequest: String) -> String                    // raw JSON
```

No `locate`, `trace_route`, `trace_attributes`, `matrix`, `isochrone`, or `status`.

### Raw JSON Routing
Use `route(rawRequest:)` for features not in the typed API:
- Alternates (typed RouteResponse drops them — must parse raw JSON)
- Custom costing options
- Exclude locations/polygons

## Valhalla C++ Actor Endpoints (available in C++, NOT in Swift wrapper)
| Endpoint | Purpose | In Swift? |
|----------|---------|-----------|
| `route` | A→B routing | ✅ Yes |
| `locate` | "What road/trail am I on?" | ❌ No — need fork |
| `trace_route` | Map match GPS trace to roads | ❌ No |
| `trace_attributes` | Detailed edge attributes along trace | ❌ No |
| `matrix` | Time/distance matrix | ❌ No |
| `isochrone` | Reachability polygons | ❌ No |
| `height` | Elevation profile | ❌ No |
| `status` | Server/tile health check | ❌ No |

### Adding `locate` (Future — 6 files, ~30 lines)
Fork `Rallista/valhalla-mobile`, add to:
1. `valhalla_actor.h` — `std::string locate(const std::string& request);`
2. `valhalla_actor.cpp` — `return actor.locate(std::string(request));`
3. `main.h` — `std::string locate(const char *request, void* actor);`
4. `main.cpp` — clone route(), call ->locate()
5. `ValhallaWrapper.h/.mm` — `- (NSString*)locate:(NSString*)request;`
6. `Valhalla.swift` — `public func locate(rawRequest:) -> String`
Requires rebuilding the xcframework (C++ static library).

### `locate` Response (what it returns)
- `edge_info.names` — street/trail name(s)
- `edge_info.way_id` — OSM way ID
- `edge.classification` — road class (motorway→service_other)
- `edge.surface` — surface type (paved_smooth→impassable)
- `edge.speed` — posted speed
- `correlated_lat/lon` — snapped position
- `percent_along` — position along edge (0-1)

## Route Preference Parameters (Motorcycle Costing)

### Soft Avoidance (0-1 range, influences but doesn't guarantee)
| Parameter | 0 = avoid | 1 = favor | Default |
|-----------|-----------|-----------|---------|
| `use_trails` | Stay on major roads | Prefer trails/tracks | 0.0 |
| `use_highways` | Avoid highways | Prefer highways | 0.5 |
| `use_tolls` | Avoid tolls | Use tolls | 0.5 |
| `use_ferry` | Avoid ferries | Use ferries | 0.5 |
| `use_tracks` | Avoid tracks | Use tracks | 0.5 |

### Hard Exclusions (boolean, requires `allow_hard_exclusions = true`)
`exclude_tolls`, `exclude_highways`, `exclude_bridges`, `exclude_tunnels`, `exclude_ferries`

### DirtSync Mapping (Waze-style toggles)
| DirtSync Toggle | Valhalla Parameter |
|----------------|-------------------|
| Prefer trails over roads | `use_trails = 0.8` |
| Avoid expert trails | `linear_cost_factors` on expert geometry, factor=5.0 |
| Avoid outlaw trails | `linear_cost_factors` on outlaw geometry, factor=10.0 |
| Prefer roads | `use_trails = 0.0` |

### `linear_cost_factors` (Per-Edge Custom Costs at Request Time)
Pass GeoJSON LineString features with a `factor` property:
- factor > 1.0 = penalized (avoided)
- factor < 1.0 = favored (preferred)
- factor = 1.0 = no change
No graph rebuild needed — applied at request time via geometry matching.

## Battle Learnings

### Alternates Parsing
- Typed `RouteResponse` drops alternates. Must parse raw JSON from `route(rawRequest:)`.
- Raw JSON has `alternates` array alongside the primary trip.

### OSM Trail Pollution
- WV roads PBF has OSM trail data mixed in. Filter to road-class highways before merging.
- Use `highway` tag filtering: only `motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `residential`, `unclassified`.

### Reroute Strategy
- Hybrid routing (Valhalla trails + Mapbox roads) fails on public roads.
- Need pure Valhalla fallback when hybrid fails.
- Multiple reroute strategies: hybrid → pure Valhalla → straight line.

### Tile Building
- Trail-only tiles: `build-trail-only-tiles.sh` (for routing)
- System tiles with roads: `build-system-tiles.sh` (for small systems like Kidds Dairy)
- Tile rebuilds OVERWRITE other systems. Back up first.

## Anti-Patterns
1. NEVER assume typed RouteResponse has all data — use raw JSON for alternates
2. NEVER call locate/trace through route() — they are separate C++ methods
3. NEVER merge road PBF without filtering OSM trails out
4. NEVER rebuild tiles without backing up existing ones
