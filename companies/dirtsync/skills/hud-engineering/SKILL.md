---
name: hud-engineering
description: Domain knowledge for DirtSync navigation HUD — Ferrostar API, SwiftUI patterns, component architecture, urgency system, trail state
---

# DirtSync HUD Engineering Domain Skill

You are a specialist in the DirtSync navigation HUD. This skill gives you full API surface knowledge so you can make changes confidently without exploratory code reads.

## Navigation State APIs

### FerrostarNavigationService (Ferrostar turn-by-turn)

**Location**: `DirtSyncApp/Services/FerrostarNavigationService.swift`

```swift
// Published state
@Published private(set) var navigationState: NavigationState?
@Published private(set) var isNavigating: Bool
@Published private(set) var isRerouting: Bool
@Published private(set) var ferrostarRoute: FerrostarCoreFFI.Route?

// Key computed properties
var currentVisualInstruction: VisualInstruction?
var currentProgress: TripProgress?
var currentStep: RouteStep?
var currentRoadName: String?
var distanceToNextManeuver: Double?    // meters
var distanceRemaining: Double?         // meters
var durationRemaining: Double?         // seconds

// Formatted output
var formattedDistanceToManeuver: String // "0.5 mi" or "150 ft"
var formattedRemainingDistance: String  // "2.3 mi"
var formattedRemainingTime: String     // "15 min" or "1h 23m"
var formattedETA: String               // "2:45 PM"
```

**VisualInstruction structure**:
```swift
primaryContent.text: String                    // "Turn left onto Trail 42"
primaryContent.maneuverType: ManeuverType      // .turn, .arrive, .depart
primaryContent.maneuverModifier: ManeuverModifier? // .left, .right, .sharpRight
triggerDistanceBeforeManeuver: Double
```

### TrailNavigationState (trail-only navigation)

**Location**: `DirtSyncApp/Models/NavigationModels.swift`

```swift
@MainActor final class TrailNavigationState: ObservableObject {
    @Published var isActive: Bool
    @Published var route: TrailNavigationRoute?
    @Published var currentTurnIndex: Int
    @Published var distanceToNextTurn: Double       // miles
    @Published var remainingDistance: Double         // miles

    var currentTurn: TrailTurn?                     // computed
    var nextTurn: TrailTurn?                        // computed
    var formattedDistanceToNext: String
    var formattedRemainingDistance: String
}
```

**TrailTurn**:
```swift
struct TrailTurn: Identifiable, Equatable {
    let coordinate: CLLocationCoordinate2D
    let direction: TurnDirection       // .left, .right, .sharpLeft, etc.
    let bearingChange: Double          // degrees
    let instruction: String            // "Turn left onto Trail 42"
    let trailName: String?
    var formattedDistance: String
}
```

**TurnDirection enum**:
```swift
enum TurnDirection: String, CaseIterable {
    case straight, slightLeft, slightRight, left, right
    case sharpLeft, sharpRight, uTurn

    var iconName: String               // SF Symbol
    var label: String                  // "Turn left"
    static func classify(bearingChange: Double) -> TurnDirection
}
```

## HUD Component Architecture

### File Ownership Map

All paths relative to `DirtSync/DirtSyncApp/`:

| File | Purpose |
|------|---------|
| `Views/MapOverlayStack.swift` | Master overlay compositor — composes all HUD layers |
| `Views/NavigationHUDView.swift` | Compact top nav bar (trail-only navigation) |
| `Views/TrailNavigationHUDView.swift` | Full HUD container with header + turn card + stats |
| `Views/Components/TurnCardView.swift` | Turn instruction with urgency colors |
| `Views/Components/WazeNavTopBar.swift` | Trail name + difficulty dot (Ferrostar mode) |
| `Views/Components/WazeNavBottomBar.swift` | ETA/distance + controls (Ferrostar mode) |
| `Views/Components/SpeedDisplay.swift` | Floating 74px speed badge |
| `Views/Components/RideStatsBarView.swift` | Duration/distance/elevation bar |
| `Views/Components/NavigationDetailSheet.swift` | ETA + route detail sheet |
| `Views/Components/ProceedToRouteView.swift` | "Proceed to route" banner |
| `Views/Components/HazardReportButton.swift` | Amber hazard report FAB |
| `Views/Components/TrailNameHeaderView.swift` | Trail detection + difficulty badge |

### MapOverlayStack Rendering Order

```
VStack(spacing: 0) {
  IF ferrostarNavService.isNavigating:
    WazeNavTopBar          → trail name + difficulty
    TurnCardView           → if distanceToManeuver < 152m
    RideStatsBarView       → if recording
  ELSE:
    TrailNavigationHUDView → trail detection HUD

  SpeedBadgeView           → bottom-left (zIndex=6)
  WazeNavBottomBar         → if navigating (zIndex=10)
  MapControlsPanel         → always
}
```

### Z-Index Layering
```
zIndex=10  WazeNavBottomBar (tap targets)
zIndex=6   SpeedBadgeView (visual only)
default    TurnCardView, TrailNavigationHUDView
bottom     Map controls, trail/POI popups
```

## Urgency System (TurnCardView)

| Level | Distance | Color | Behavior |
|-------|----------|-------|----------|
| Green | > 804m (0.5mi) | `#22C55E` | Static display |
| Yellow | 161–804m | `#F59E0B` | Black text |
| Red | < 161m (0.1mi) | `#DC2626` | Pulse animation |
| Critical | < 61m (200ft) | `#DC2626` | Pulse + haptic |

**Turn card appears**: `distanceToTurn < 152m` (500ft, Waze standard)

**Distance formatting**:
- >= 0.1mi → "0.5 mi"
- < 0.1mi → "200 ft"

## Trail Difficulty Colors

| Difficulty | Color | Icon |
|------------|-------|------|
| Easy | `#34C759` | circle.fill |
| Moderate | `#007AFF` | square.fill |
| Hard | `#1C1C1E` | diamond.fill |
| Expert | `#FF3B30` | star.fill |

## Turn Icon Background Colors (NavigationHUDView)

```swift
.straight          → white @ 0.15
.slightLeft/Right  → orange @ 0.6
.left/right        → #F59E0B @ 0.7
.sharpLeft/Right   → #EF4444 @ 0.7
.uTurn             → #DC2626 @ 0.8
```

## SwiftUI Patterns Used

**State management**: `@ObservedObject` for services, `@State` for local UI, `@Binding` from parent.

**Animation pattern**:
```swift
// Entrance
.opacity(hasAppeared ? 1 : 0)
.offset(y: hasAppeared ? 0 : 20)
.animation(.easeOut(duration: 0.6).delay(0.1), value: hasAppeared)

// Urgency pulse
withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
    pulseScale = 1.1
}
```

**Callback pattern**: Parent passes closures (`onStop`, `onRecenter`, etc.) down to child views.

## Key Constants

```
Turn card threshold:     152m  (500ft)
Proceed-to-route:        30m
Route deviation reroute:  50m
POI proximity announce:   61m  (200ft)
SpeedBadge size:          74pt
```

## Key Types

```swift
// Route model
struct Route: Identifiable, Equatable {
    let coordinates: [CLLocationCoordinate2D]
    let distance: Double              // meters
    let duration: Double              // seconds
    let difficulty: TrailDifficulty?
    let instructions: [RouteInstruction]
}

// ManeuverType (from Route.swift) — 30+ cases
// Key ones: .none, .start, .continue, .turn, .arrive
// .slightRight, .right, .sharpRight, .uTurnRight
// .slightLeft, .left, .sharpLeft, .uTurnLeft

// TrailFeature (trail data model)
struct TrailFeature: Codable {
    let properties: TrailProperties   // name, difficulty, system, osmId, etc.
    let geometry: TrailGeometry       // coordinates array
}
```

## Imports You Need

```swift
import SwiftUI                       // All HUD views
import CoreLocation                  // CLLocationCoordinate2D
import FerrostarCore                 // Navigation core
import FerrostarCoreFFI              // FFI types (Route, VisualInstruction)
```

## Rules

1. Read existing code BEFORE changing it.
2. Every change must compile — run xcodebuild before committing.
3. Preserve all existing functionality — reorganize, don't remove.
4. Use existing SwiftUI patterns from the codebase.
5. No dead parameters, unused imports, or commented-out code.
6. Urgency system thresholds are UX-tested — don't change without approval.
