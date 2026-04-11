# TOOLS.md — DirtSync Offline Routing Engineer

You inherit all Feature Builder tools.
Full reference: `../feature-builder/TOOLS.md`

---

## Specialist Tools

### Ferrostar RouteStep Patch (MANDATORY on Mini)

Every `RouteStep` initializer on Mini requires two nil arguments that newer Ferrostar versions make optional. Without these the build fails silently on the Mini's version.

```swift
// CORRECT — Mini-compatible
RouteStep(
    geometry: coordinates,
    distance: distance,
    duration: duration,
    roadName: roadName,
    instruction: instruction,
    visualInstructions: [],
    utterances: [],
    drivingSide: nil,                // REQUIRED on Mini
    roundaboutExitNumber: nil        // REQUIRED on Mini
)

// WRONG — compiles on laptop, breaks on Mini
RouteStep(
    geometry: coordinates,
    distance: distance,
    duration: duration,
    roadName: roadName,
    instruction: instruction,
    visualInstructions: [],
    utterances: []
    // Missing drivingSide + roundaboutExitNumber → Mini build failure
)
```

Apply this patch immediately after fetching code on Mini. Check it on every build.

---

### Valhalla Costing JSON Schemas

#### Primary — Motorcycle (trail riding)
```json
{
  "locations": [
    {"lon": -81.3140, "lat": 37.6628, "type": "break"},
    {"lon": -81.3180, "lat": 37.6650, "type": "break"}
  ],
  "costing": "motorcycle",
  "costing_options": {
    "motorcycle": {
      "use_trails": 1.0,
      "use_tracks": 1.0,
      "use_highways": 0.0,
      "service_penalty": 500,
      "service_factor": 5.0,
      "use_living_streets": 0.0
    }
  },
  "directions_options": {
    "units": "miles"
  },
  "alternates": 2
}
```

**CRITICAL:** `use_trails` MUST be `1.0`. The default is `0.0`, which causes routes to use roads exclusively. Verify in raw JSON before every request.

#### Fallback — Auto (road segment when trail unavailable)
```json
{
  "locations": [...],
  "costing": "auto",
  "costing_options": {
    "auto": {
      "use_highways": 0.3,
      "use_tolls": 0.0
    }
  }
}
```

Used by Mapbox Directions for road legs in hybrid routing. NOT sent to Fly.io Valhalla.

#### Last Resort — Pedestrian (very slow, any surface)
```json
{
  "locations": [...],
  "costing": "pedestrian",
  "costing_options": {
    "pedestrian": {
      "use_ferry": 0.0,
      "use_living_streets": 0.0
    }
  }
}
```

Only used when motorcycle profile produces no route (edge case: trail is a narrow footpath only).

#### Family Ride Profile (difficulty filter)
```json
{
  "costing": "motorcycle",
  "costing_options": {
    "motorcycle": {
      "use_trails": 0.5,
      "use_tracks": 0.5,
      "use_highways": 0.5
    }
  },
  "linear_cost_factors": [
    {
      "type": "Feature",
      "geometry": { "<expert-trail-linestring>" },
      "properties": { "factor": 5.0 }
    }
  ]
}
```

`linear_cost_factors` penalizes expert/black trails at request time — no graph rebuild required.

---

### HTTP Request to Fly.io Valhalla

```bash
# Trail-only routing (DO NOT send road destinations here)
curl -s -X POST https://dirtsync-valhalla.fly.dev/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lon": -81.3140, "lat": 37.6628, "type": "break"},
      {"lon": -81.3180, "lat": 37.6650, "type": "break"}
    ],
    "costing": "motorcycle",
    "costing_options": {
      "motorcycle": {
        "use_trails": 1.0,
        "use_tracks": 1.0,
        "use_highways": 0.0
      }
    }
  }' | python3 -m json.tool | head -60

# Confirm trail surface in response
curl -s -X POST https://dirtsync-valhalla.fly.dev/route \
  -d '<same payload>' | python3 -c "
import json, sys
r = json.load(sys.stdin)
legs = r['trip']['legs']
print('Legs:', len(legs))
for i, leg in enumerate(legs):
    print(f'Leg {i}: {leg[\"summary\"][\"length\"]:.2f} mi')
"
```

**Reminder:** Fly.io has trail tiles ONLY. Road-only destinations will fail or return degenerate routes.

---

### Embedded Valhalla Tile Inspection

```bash
# Confirm tile file exists and has correct size
ssh dirtsyncmini@100.125.184.57 'ls -lh /Users/dirtsyncmini/DirtSync/DirtSync/Resources/valhalla_tiles.tar'
# Expected: ~136KB for trail-only tiles. If >1MB, likely built with build-system-tiles.sh (wrong)

# Check tile count
ssh dirtsyncmini@100.125.184.57 'tar -tf /Users/dirtsyncmini/DirtSync/DirtSync/Resources/valhalla_tiles.tar | wc -l'
# Expected: ~177 tiles for Kidds Dairy area
```

---

### Graph Traversal Pseudocode — "Bail Out" Routing

The bail-out feature (rider critic #3) does NOT use a single Valhalla route call. It enumerates road junctions and evaluates each one:

```
func findBailOutRoute(riderPosition: CLLocation, vehiclePosition: CLLocation) async -> [BailOutCandidate] {
    // 1. Load road junctions from bundled intersections JSON
    let junctions = loadRoadJunctions(system: currentSystem)
    // Expect: junctions where type == "road_junction"

    // 2. Filter by Haversine distance — only junctions within 10km
    let nearby = junctions.filter { haversine($0.coordinate, riderPosition) <= 10_000 }

    // 3. Evaluate each junction
    var candidates: [BailOutCandidate] = []
    for junction in nearby {
        // Pre-filter: skip if junction is more than 2x the straight-line distance
        let straightLine = haversine(riderPosition.coordinate, vehiclePosition.coordinate)
        let viaDistance = haversine(riderPosition.coordinate, junction.coordinate)
                        + haversine(junction.coordinate, vehiclePosition.coordinate)
        guard viaDistance <= 2 * straightLine else { continue }

        // Leg 1: Valhalla trail route → junction
        let trailLeg = try? await valhallaRoute(from: riderPosition, to: junction.coordinate)

        // Leg 2: Mapbox road route junction → vehicle
        let roadLeg = try? await mapboxRoute(from: junction.coordinate, to: vehiclePosition)

        if let trail = trailLeg, let road = roadLeg {
            candidates.append(BailOutCandidate(
                trailLeg: trail,
                roadLeg: road,
                junctionName: junction.name,
                totalDistance: trail.totalDistance + road.totalDistance
            ))
        }
    }

    // 4. Sort by least total distance, return up to 3
    return candidates.sorted { $0.totalDistance < $1.totalDistance }.prefix(3)
}
```

Key constraints:
- **Haversine, not Euclidean** — coordinates are not on a flat plane
- **Pre-filter ratio check** — prevents absurd detours (2x straight-line max)
- **Valhalla trail leg FIRST** — rider exits on trail, enters road at junction
- **Mapbox road leg SECOND** — road segment to vehicle is internet-only
- **Up to 3 candidates** — matches the route selection carousel capacity

---

### Ferrostar Route Adapter Integration

```swift
// Convert Valhalla raw JSON → Ferrostar Route
func convertToFerrostarRoute(valhallaJSON: String) throws -> Route {
    guard let data = valhallaJSON.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let trip = json["trip"] as? [String: Any],
          let legs = trip["legs"] as? [[String: Any]] else {
        throw RoutingError.parseFailure
    }

    var steps: [RouteStep] = []
    for leg in legs {
        guard let maneuvers = leg["maneuvers"] as? [[String: Any]] else { continue }
        for maneuver in maneuvers {
            let instruction = maneuver["instruction"] as? String ?? ""
            let distance = maneuver["length"] as? Double ?? 0
            let beginShapeIndex = maneuver["begin_shape_index"] as? Int ?? 0
            let endShapeIndex = maneuver["end_shape_index"] as? Int ?? 0

            // Extract geometry for this step
            let coords = extractCoordinates(from: leg, start: beginShapeIndex, end: endShapeIndex)

            steps.append(RouteStep(
                geometry: coords,
                distance: distance * 1609.34,  // miles → meters
                duration: maneuver["time"] as? Double ?? 0,
                roadName: maneuver["street_names"] as? [String] ?? [],
                instruction: instruction,
                visualInstructions: [],
                utterances: [],
                drivingSide: nil,              // MANDATORY on Mini
                roundaboutExitNumber: nil      // MANDATORY on Mini
            ))
        }
    }

    return Route(steps: steps, waypoints: [], bbox: .zero)
}
```

---

### GPX Test Track Library (Routing Validation)

```bash
# List available GPX files
ssh dirtsyncmini@100.125.184.57 'ls /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/'

# Key files for routing tests:
# kidds-dairy-loop.gpx          — full loop, use for bail-out start positions
# kidds-dairy-approach-exit.gpx — approaches road junction at known coordinate
# burning-rock-full-route.gpx   — longer system, use for hybrid routing tests

# Generate a new GPX from trail geometry if needed
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && python3 scripts/generate_gpx_routes.py --system "Kidds Dairy Farm" --output DirtSync/DirtSyncUITests/GPXRoutes/kidds-dairy-bail-out-test.gpx'
```

---

### Routing Test Suite Commands

```bash
# Full routing regression
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarRoutingTests \
  2>&1 | tail -80'

# Single test (iterating on one routing bug)
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarRoutingTests/testBailOut_ReturnsTrailSegmentFirst \
  2>&1 | tail -40'

# Regression gate (run after every routing change)
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync \
  -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarNavTests \
  -only-testing:DirtSyncUITests/GoldStarMapHomeTests \
  2>&1 | tail -60'
```

---

### Budget Rationale

Routing logic is NOT Flash territory. A wrong costing parameter silently breaks trail-first routing across the entire system. Every bad routing decision cascades into wrong turn cards, wrong junction detection, and wrong bail-out candidates. Sonnet ($2–5/day) is the minimum safe model for this domain.

Do NOT attempt routing changes on Gemini Flash or Codex without explicit Feature Builder approval.
