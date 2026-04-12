---
name: dirtsync-frameworks
description: Deep framework knowledge for DirtSync — Ferrostar nav engine, MapLibre GL, HybridRoutingService, TrailDetection, NavigationStateMachine, CoreLocation, SwiftUI patterns
---

# DirtSync Framework Knowledge

Load this skill when modifying navigation, mapping, routing, or trail detection code.

## Ferrostar Navigation Engine (≥0.46.0)

The ACTIVE navigation engine is `FerrostarNavigationService.swift` (943 lines), NOT the legacy `NavigationService.swift`.

**Key types:**
- `FerrostarCore` — the engine. Created per-navigation session, subscribes to state via Combine
- `SwiftNavigationControllerConfig` — step advance, deviation, arrival thresholds
- `FerrostarCoreDelegate` — receives state updates
- `NavigationStateMachine` (382 lines) — states: idle → approaching → onRoute → offRoute → rerouting → arriving → complete

**Production config (MUST use these values):**
```swift
stepAdvance: .distanceEntryAndExit(entryDistance: 40, exitDistance: 20)
arrivalDistance: 30
deviationThreshold: 50
minimumHorizontalAccuracy: 100
courseFiltering: .snapToRoute
```

**Testing config (wider thresholds):**
```swift
stepAdvance: .distanceEntryAndExit(entryDistance: 50, exitDistance: 30)
deviationThreshold: 75
courseFiltering: .raw
```

**Critical: Instruction merging** — `convertInstructionsToSteps()` merges Valhalla instructions by road name to prevent step-racing at junctions. Only merges trivial continuations (continue/becomes/stayStraight); keeps real decision points as separate steps.

**Wrong-direction detection** (NavigationStateMachine):
- Monitors if `distToManeuver` increases while rider is moving (>1 m/s)
- After 30m backward → `onWrongDirection` ("Make a U-turn")
- After 5 more seconds → `onForceReroute`

**Rerouting:** Uses `DirtSyncRouteProvider` (CustomRouteProvider) — tries HybridRoutingService first, falls back to pure Valhalla.

**Voice:** AVSpeechSynthesizer, triggers at 500ft (152m).

**Distance smoothing:** Monotonic countdown filter prevents distance-remaining from jumping UP at step transitions.

**GPS provider rule:** ALWAYS `CoreLocationProvider`. `SimulatedLocationProvider` feeds Ferrostar internally only — MapLibre does NOT receive those updates.

**Voice conflict:** 3 AVSpeechSynthesizers exist (Ferrostar, TrailNavigationState, JunctionDetection). Only Ferrostar speaks during active navigation. Set `trailNavState.voiceManager.isNavigationActive = true` when Ferrostar starts.

**Camera during nav:** `.followWithCourse`, z18, pitch 45. Pan cooldown: 5s after user pan, then auto-recenter.

**Ferrostar anti-patterns:**
1. NEVER use SimulatedLocationProvider for visual testing
2. NEVER run both Ferrostar voice AND TrailNavigationState voice simultaneously
3. NEVER set camera zoom/pitch without checking navState
4. NEVER skip `coordinator.parent = self` update in updateUIView

---

## MapLibre GL Native (≥6.0.0)

**Architecture:** MLNMapView > MLNStyle > Sources (data) > Layers (rendering).

**Key classes:**
- `MLNMapView` — UIKit map view, wrapped in SwiftUI via UIViewRepresentable
- `MLNVectorTileSource` — for MBTiles trail data (`mbtiles://` URL scheme)
- `MLNShapeSource` — for dynamic GeoJSON overlays (routes, POIs)
- `MLNLineStyleLayer` — trail lines
- `MLNSymbolStyleLayer` — labels and icons
- `MLNCircleStyleLayer` — POI dots

**DirtSync trail layer stack (7 layers):**
1. Dark casing layer
2. Colored trails (difficulty match expression)
3. Connector dashed overlay
4. Expert red/black striped overlay
5. Trail name labels (z10-11)
6. System name labels (z8-12)
7. "Modern Pill" shield badges

**CRITICAL:** Style must be loaded before adding layers. Always check `mapView.style != nil`.

**userTrackingMode (most dangerous API):**
- `.follow` — centers on GPS. Resets to `.none` on user pan.
- `.followWithCourse` — follows + rotates to GPS course. Use for navigation.
- **`setCenterCoordinate` RESETS tracking to `.none`**. Same for `setCenter(_:zoomLevel:animated:)` and `fly(to:)`.
- `setZoomLevel(_:animated:)` does NOT reset tracking. Pinch-to-zoom is safe.

**Correct re-center:**
```swift
mapView.userTrackingMode = .follow  // DO NOT use setCenterCoordinate
```

**Style lifecycle — LOST on style change:** All custom layers, sources, images = GONE. Must re-add in `didFinishLoadingStyle`.

**MLNPolyline.coordinate TRAP:** Returns geographic MIDPOINT, NOT first point. NEVER use for distance calculations.

---

## HybridRoutingService (776 lines)

**5 routing cases:**
| Case | Condition | Strategy |
|------|-----------|----------|
| A | Both near trails | Pure offline Valhalla (motorcycle costing, `use_trails=1.0`) |
| A2 | Start on trail, dest off-trail | Multi-junction stitched routes |
| B | Dest on trail, start far | Hybrid: road to trailhead + trail to dest |
| C | Dest >20mi from trails | Pure road (Mapbox) |
| D/E | Dest off-trail | Pure road |

**CRITICAL — `use_trails` defaults to 0.0 DISABLED:**
```swift
MotorcycleCostingOptions(useHighways: 0.0, useTracks: 1.0, useTrails: 1.0)
```

**Polyline precision:** Valhalla uses 1e6 (6 decimals), NOT 1e5 (Google default).

---

## TrailDetectionService (674 lines)

**Dual detection:** In-memory nearest-point-on-polyline + MapLibre visibleFeatures fallback.
**Thresholds:** On-trail < 30m, near-trail 30-100m, off-trail > 100m.
**Debounce:** 2s between trail name changes. Off-trail requires 3 consecutive empty queries.

---

## Navigation State Machine

```
.idle → .approaching → .onRoute → .offRoute → .rerouting → .onRoute
                         ↓
                    .arriving → .complete → .idle
```

**UI per state:**
- `.approaching`: "Proceed to highlighted route" banner, z15, no HUD
- `.onRoute`: Turn card HUD, z18, pitch 45, followWithCourse
- `.offRoute`: "Proceed to highlighted route", voice "Recalculating..."
- `.arriving`: "Arriving at [name]" green banner
- `.complete`: Auto-dismiss after 5s, ride saved silently

---

## CoreLocation

- `kCLLocationAccuracyBestForNavigation`
- `pausesLocationUpdatesAutomatically = false` — CRITICAL for trail riding
- `allowsBackgroundLocationUpdates = true`
- Distance filter: `kCLDistanceFilterNone`
- GPS testing: `xcrun simctl location <DEVICE_ID> start /path/to/track.gpx`
