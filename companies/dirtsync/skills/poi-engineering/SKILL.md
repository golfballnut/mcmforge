---
name: poi-engineering
description: Domain knowledge for DirtSync POI system — search services, route stops, map display, NavigationDetailSheet wiring
---

# DirtSync POI Engineering Domain Skill

You own the Points of Interest system in DirtSync. This skill gives you the full API surface so you can wire features without exploratory code reads.

## The Architecture (Already Built)

```
NavigationDetailSheet (Add a stop buttons)
  → POISearchView (category search UI)
    → NearbySearchService (Apple MapKit Local Search — free, no API key)
      → Returns [POIResult] (name, address, coordinate, distance, phone, rating)
        → User taps "Add stop"
          → MapNavigationHelpers.navigateToPOI()
            → RoutingService.addStop() (splits route into 2 Valhalla legs)
              → Route updates, ETA recalculates
```

## Key Files

| File | Purpose |
|------|---------|
| `Views/NavigationDetailSheet.swift` | Bottom sheet during nav — "Add a stop" buttons HERE |
| `Views/POISearchView.swift` | Category search UI — Gas/Food/Lodging/Camping/Parking/Hospital/Store |
| `Services/NearbySearchService.swift` | Apple MapKit search — searchByCategory(), searchText(), calculateETA() |
| `Services/MapboxSearchService.swift` | Mapbox proxy search (alternative) |
| `Services/TrackPOIService.swift` | CRUD for user-created POIs on tracks |
| `Services/RoutingService.swift` | addStop(), removeStop() — route modification |
| `Views/MapNavigationHelpers.swift` | navigateToPOI(), addStopToPOI() — glue code |
| `Components/POIInfoPopupView.swift` | POI tap popup with Navigate/Add Stop buttons |
| `Models/TrackPOI.swift` | TrackPOI model + POICategory enum (12 types) |
| `Models/POITapInfo.swift` | Tapped POI info for popup display |

All paths relative to `DirtSync/DirtSyncApp/`.

## NearbySearchService API

```swift
// Search by category — uses Apple MapKit Local Search (free)
func searchByCategory(_ category: POIType, near location: CLLocationCoordinate2D, radiusMeters: Double = 25_000) async throws -> [POIResult]

// Text search
func searchText(_ query: String, near location: CLLocationCoordinate2D, radiusMeters: Double = 25_000) async throws -> [POIResult]

// ETA from point A to B
func calculateETA(from origin: CLLocationCoordinate2D, to destination: CLLocationCoordinate2D) async -> TimeInterval?
```

**POIType enum:** `restaurant`, `gasStation`, `lodging`, `camping`, `parking`, `hospital`, `store`

**POIResult struct:**
```swift
struct POIResult: Identifiable, Equatable {
    let id: String
    let name: String
    let address: String
    let coordinate: CLLocationCoordinate2D
    let category: POIType
    let distance: Double // meters
    let phone: String?
    let rating: Double?
}
```

## POISearchView Init

```swift
POISearchView(
    userLocation: CLLocationCoordinate2D,
    hasActiveRoute: Bool,               // true = show "Add stop", false = show "Navigate"
    onNavigateTo: (POIResult) -> Void,  // user taps Navigate
    onAddStop: ((POIResult) -> Void)?,  // user taps Add Stop (only when hasActiveRoute)
    onDismiss: () -> Void
)
```

When `hasActiveRoute: true`, result cards show orange "Add stop" button.
When `false`, they show "Navigate" button.

## RoutingService.addStop()

```swift
func addStop(stop: CLLocationCoordinate2D, from: CLLocationCoordinate2D, destination: CLLocationCoordinate2D) async
```

Runs two Valhalla legs concurrently: `from→stop` and `stop→destination`. Merges coordinates, sums distance/duration, combines instructions. Sets `activeStop` and `originalDestination`.

```swift
func removeStop(from: CLLocationCoordinate2D) async
```

Clears stop and recalculates original route.

## NavigationDetailSheet — Current State

Lines 166-183: The "Add a stop" section:
```swift
// CURRENT: Empty handlers — these do NOTHING
Button { /* POI search — deferred */ } label: {
    stopCategoryButton(icon: "fuelpump.fill", label: "Gas")
}
Button { /* POI search — deferred */ } label: {
    stopCategoryButton(icon: "fork.knife", label: "Food")
}
Button { /* POI search — deferred */ } label: {
    stopCategoryButton(icon: "p.square.fill", label: "Parking")
}
Button { /* POI search — deferred */ } label: {
    stopCategoryButton(icon: "magnifyingglass", label: "Search")
}
```

**These need to present POISearchView with the correct category pre-selected.**

## MapNavigationHelpers Glue

```swift
// Navigate TO a POI (no active route)
func navigateToPOI(_ poi: POIResult)

// Add POI as stop to active route
func addStopToPOI(_ poiInfo: POITapInfo)

// Navigate to POI waypoint
func navigateToPOIWaypoint(_ poiInfo: POITapInfo)
```

## POICategory Enum (User POIs — 12 types)

```swift
enum POICategory: String, CaseIterable, Codable {
    case hazard, gate, water_crossing, parking, viewpoint, sharp_turn
    case intersection, fuel, rest_area, trailhead, landmark, custom

    var displayName: String
    var iconName: String    // SF Symbol
    var voiceLabel: String
}
```

## Supabase Tables

**track_pois:** id, track_id, user_id, name, description, latitude, longitude, category, photo_url, distance_along_track, is_public, created_at, updated_at

**trail_reports:** id, user_id, trail_id, report_type, title, description, severity (1-5), latitude, longitude, photo_url, votes_up, votes_down, created_at

## Build & Test

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync
xcodebuild -scheme DirtSync -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -20
```

## Rules

1. Read existing code BEFORE changing it.
2. Every change must compile — run xcodebuild before committing.
3. POISearchView, NearbySearchService, RoutingService are ALREADY BUILT. Do NOT rewrite them.
4. Use existing SwiftUI patterns from the codebase.
5. The "Add a stop" buttons just need to be WIRED to existing code, not rebuilt.
