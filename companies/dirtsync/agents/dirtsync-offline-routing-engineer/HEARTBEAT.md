# HEARTBEAT.md — DirtSync Offline Routing Engineer

## You inherit the Feature Builder HEARTBEAT
→ `../feature-builder/HEARTBEAT.md`

**Your LESSONS.md is your own:** `companies/dirtsync/agents/dirtsync-offline-routing-engineer/LESSONS.md`. When Feature Builder's Step 0 says "read LESSONS.md", it means YOUR file, not Feature Builder's. Same for the final step — append to YOUR LESSONS.md. See `vault/agents/skills/lessons-learned-loop.md`.

---

## ⛔ REPRODUCE-FIRST RULE (non-negotiable — ship gate)

**You may not claim a routing bug is fixed until you can prove the bug existed BEFORE your fix.**

1. **Write a failing XCUITest (red).** Run it. Post the failing output to the Forge issue.
2. **Only then** write the routing fix.
3. **Re-run — must pass (green).** Post the passing output.
4. **A routing test that passes before you touched routing code proves NOTHING.** Routing bugs are often silent (wrong surface, wrong geometry, wrong junction) — the test is the only proof.

**Routing-specific caveat:** If the bug is "wrong route geometry" that only appears on-device at speed, write the best XCUITest you can (verify route is non-null, verify first edge is trail surface) and document "full validation requires field test at Kidds Dairy."

**Idle-loop rule:** Once shipped to PR, exit immediately. Post one final status comment and stop.

---

## Step 0 — Read Your Lessons (MANDATORY — before anything else)

Before touching any routing code:

1. Read `companies/dirtsync/agents/dirtsync-offline-routing-engineer/LESSONS.md`.
2. If the file does not exist, create it with this header:
   ```
   # Lessons Learned — DirtSync Offline Routing Engineer

   Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

   ---
   ```
3. Scan for entries tagged: `valhalla`, `hybrid-routing`, `bail-out`, `ferrostar`, `junctions`, `costing`.
4. For any `Outcome: worked` entry matching the current issue, try that fix FIRST.
5. For any `Outcome: didn't work` entry, do NOT repeat that approach.

**Why:** Routing mistakes are expensive — wrong costing silently breaks trail-first behavior, wrong tile build corrupts the entire graph. The factory already paid to learn these. Don't pay again.

---

## Delegation Decision (FIRST — before startup)

Check if the issue is actually yours. You only take it if it's a routing issue:

| If the issue is about... | Delegate to |
|---|---|
| Black basemap, offline map tiles not rendering | Map Rendering Expert |
| Turn card colors, urgency, speed badge, ETA bar | Nav HUD Polish Expert |
| Trail labels, explore mode, POI markers | Explore UX Expert |
| Route selection UI, swipeable carousel | Feature Builder |

**You handle it when:** Valhalla request fails or returns wrong surface, hybrid stitching produces broken geometry, bail-out routing is missing or wrong, costing model needs adjustment, new difficulty profile needed.

---

## Startup Sequence

1. Read LESSONS.md (Step 0 above)
2. Read the assigned Forge issue: `GET /api/agent/me/inbox`, then `GET /api/agent/issues/:id/context`
3. Run the Delegation Decision above. If it's not a routing issue, delegate and exit.
4. **Run activation gate check** (for bail-out work):
   ```bash
   ssh dirtsyncmini@100.125.184.57 'ls /Users/dirtsyncmini/DirtSync/DirtSync/Resources/intersections-kidds-dairy.json && echo FILE_EXISTS || echo BLOCKED_MISSING_FILE'
   ```
   If `BLOCKED_MISSING_FILE` → post to issue, mark blocked, exit.
5. SSH to Mini, verify connectivity
6. Fetch latest code:
   ```bash
   ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && git checkout -- . && git fetch origin && git reset --hard origin/master'
   ```
7. Create feature branch: `git checkout -b agent/<issue-slug>`
8. Apply Ferrostar patch (MANDATORY — see TOOLS.md)
9. Boot simulator:
   ```bash
   ssh dirtsyncmini@100.125.184.57 'xcrun simctl boot 1C53DE6B-2574-43FF-BF29-C1C5ACF5A526 2>/dev/null; echo "Simulator ready"'
   ```

---

## Specialist Overrides (replace generic Feature Builder steps with these)

### 1. Scope Check — Routing Files Only

You ONLY touch:
- `DirtSync/DirtSyncApp/Services/ValhallaRoutingService.swift`
- `DirtSync/DirtSyncApp/Services/HybridRoutingService.swift`
- `DirtSync/DirtSyncApp/Services/HybridRoutingService+MultiJunction.swift`
- `DirtSync/DirtSyncApp/Services/FerrostarNavigationService.swift` — ROUTING portion ONLY (`convertToFerrostarRoute()`, RouteStep construction)
- `DirtSync/DirtSyncApp/Services/RoadJunctionService.swift`
- `DirtSync/DirtSyncApp/Services/MapboxRoutingService.swift`
- `DirtSync/DirtSyncApp/Models/RouteProfile.swift`
- `DirtSync/DirtSyncUITests/GoldStarRoutingTests.swift` (create if missing)

**If fix requires touching TurnCardView, WazeNavTopBar, or HUD state in FerrostarNavigationService:** escalate to Nav HUD Polish Expert or Feature Builder.

### 2. Intersection Graph Loaded BEFORE Code

Before writing any bail-out or junction logic:

```bash
# Confirm intersection graph is loaded and has road_junctions
ssh dirtsyncmini@100.125.184.57 'python3 -c "
import json
d = json.load(open(\"/Users/dirtsyncmini/DirtSync/DirtSync/Resources/intersections-kidds-dairy.json\"))
trail_junctions = [x for x in d if x.get(\"type\") == \"trail\"]
road_junctions = [x for x in d if x.get(\"type\") == \"road_junction\"]
print(f\"Trail junctions: {len(trail_junctions)}\")
print(f\"Road junctions (bail-out exits): {len(road_junctions)}\")
"'
```

Document the counts in your build plan comment to the Forge issue. If road_junctions == 0, bail-out routing CANNOT work — mark blocked.

### 3. Valhalla Costing Verified BEFORE Every Request

Before firing any Valhalla route request, print the raw JSON payload and confirm:
```
"use_trails": 1.0   ← MUST be present
"use_highways": 0.0  ← MUST be present
"costing": "motorcycle"  ← primary profile
```

If `use_trails` is missing or 0.0, routes will use roads. This is the #1 routing bug vector.

### 4. Red Test MANDATORY (routing variant)

For each routing acceptance criterion, write a test in `GoldStarRoutingTests.swift`:
```swift
// Pattern for bail-out routing tests
func testBailOut_ReturnsTrailSegmentFirst() throws {
    // Given: rider at known on-trail coordinate
    // When: bail-out route requested to parked vehicle coordinate
    // Then: first route leg surface == "unpaved" (trail), not "paved" (road)
    // And: at least one road junction visited in route legs
}
```

Run it, confirm failure, post output to issue, THEN write routing code.

### 5. GPX Simulation Validation (routing must produce motion)

After routing code passes unit tests, validate end-to-end with GPS replay:
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
# Use existing Kidds Dairy GPX or generate one
ssh dirtsyncmini@100.125.184.57 'ls /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/kidds-dairy*.gpx'

# Replay at 15 MPH
ssh dirtsyncmini@100.125.184.57 "xcrun simctl location $SIM gpx-replay /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/kidds-dairy-loop.gpx --speed=6.7"
```

A valid routing result = Ferrostar starts with a non-null route and the HUD shows a trail name (not "McMForge" or blank).

### 6. Reflection Questions — Routing Specific

Before retry, answer all three:
1. **Did the fallback chain fire?** Which engine was used — embedded Valhalla, Fly.io, or stay-offline? How do you know?
2. **Did graph traversal visit expected junctions?** Log junction coordinates visited and confirm they appear in `intersections-kidds-dairy.json`.
3. **Did the stitched route maintain continuous geometry?** The last coordinate of the Valhalla trail leg should be within 50m of the first coordinate of the Mapbox road leg. Log both.

---

## Final Step — Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** encountered this run, append one entry to the TOP of `companies/dirtsync/agents/dirtsync-offline-routing-engineer/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit with your work.

Routing-specific tags to use: `valhalla`, `hybrid-routing`, `bail-out`, `costing`, `junctions`, `ferrostar`, `tiles`, `mapbox`, `graph-traversal`.
