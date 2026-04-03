# Skill: MapLibre iOS Specialist

> Last updated: April 2, 2026
> Used by: DirtSync engineers, trail detection agents, map UI agents
> Origin: Session 71 — official MapLibre source code research + 5 days of field testing

---

## Goal
Build MapLibre-based map features correctly the first time by using documented APIs, not trial-and-error. This skill contains the OFFICIAL API behavior (verified against MapLibre Native source code) plus hard-won field lessons from building the DirtSync trail riding app. An agent reading this skill should NEVER need to guess at an API's behavior.

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. Feature uses ONLY APIs documented in this skill (no guessing)
2. No anti-pattern from the list below is present in the code
3. UIViewRepresentable coordinator parent sync is implemented
4. Style change lifecycle is handled (layers re-added in didFinishLoadingStyle)
5. Trail detection uses in-memory geometry, NOT visibleFeatures
6. User tracking mode is never broken by setCenterCoordinate calls

**If any item is false, you are NOT done. Loop back.**

## Pre-Made Decisions
**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Map framework | MapLibre Native iOS (MLNMapView), NOT MapboxMaps |
| SwiftUI integration | UIViewRepresentable wrapper with Coordinator |
| User location display | Custom MLNUserLocationAnnotationView subclass |
| Trail detection method | In-memory GeoJSON nearest-point-on-segment |
| Dark basemap | CARTO Dark Matter (free, no key) |
| Terrain basemap | MapLibre default or custom style.json |
| Offline tiles | MBTiles via `mbtiles:///path/to/file.mbtiles` URL scheme |
| Coordinate system | WGS84 (EPSG:4326) everywhere — MapLibre handles projection |

---

## Official API Reference

### MLNMapView — Core Map View

The main map rendering UIView. Renders vector tiles using OpenGL ES / Metal. All coordinate inputs are WGS84 (latitude/longitude). All pixel/point inputs are UIKit screen coordinates.

**Key Properties:**
```swift
mapView.centerCoordinate: CLLocationCoordinate2D  // Current map center
mapView.zoomLevel: Double                         // 0 (world) to 22 (building)
mapView.direction: CLLocationDirection             // Rotation in degrees (0 = north up)
mapView.pitch: CGFloat                            // Tilt in degrees (0 = top-down, max 60)
mapView.showsUserLocation: Bool                   // Shows/hides blue dot
mapView.userTrackingMode: MLNUserTrackingMode     // Camera tracking behavior
mapView.style: MLNStyle?                          // Current style (nil during style load)
mapView.visibleCoordinateBounds: MLNCoordinateBounds  // Current viewport bounds
```

**Key Methods:**
```swift
// Set center — WARNING: resets userTrackingMode to .none
mapView.setCenter(_ coordinate: CLLocationCoordinate2D,
                  zoomLevel: Double,
                  animated: Bool)

// Fly-to animation — also resets userTrackingMode to .none
mapView.fly(to: MLNMapCamera, completionHandler: (() -> Void)?)

// Convert between screen points and geographic coordinates
mapView.convert(_ point: CGPoint, toCoordinateFrom: UIView?) -> CLLocationCoordinate2D
mapView.convert(_ coordinate: CLLocationCoordinate2D, toPointTo: UIView?) -> CGPoint
```

---

### userTrackingMode (MLNUserTrackingMode)

Controls whether the map camera automatically follows the user's GPS position.

| Mode | Behavior |
|------|----------|
| `.none` | No tracking. User controls map freely. Default. |
| `.follow` | Map centers on user GPS. Auto-resets to `.none` when user pans. This is DOCUMENTED behavior, not a bug. |
| `.followWithHeading` | Follows + rotates to compass heading. Resets to `.follow` on rotation gesture. |
| `.followWithCourse` | Follows + rotates to GPS course (direction of travel). This is the one for navigation. |

**CRITICAL RULES:**

1. **`setCenterCoordinate:` RESETS tracking to `.none`.** MapLibre source code (MLNMapView.mm line 1472) has a literal comment: *"Don't call -setCenterCoordinate:, which resets the user tracking mode."* The internal method `_setCenterCoordinate:` bypasses this, but it is private API.

2. **`setCenter(_:zoomLevel:animated:)` also resets tracking to `.none`.** Same code path.

3. **`fly(to:)` resets tracking to `.none`.** Any programmatic camera movement cancels tracking.

4. **Zooming via pinch does NOT reset `.follow`.** Pinch-to-zoom preserves the current tracking mode.

5. **`setZoomLevel(_:animated:)` does NOT reset tracking mode.** Programmatic zoom without center change is safe.

6. **Style changes (`styleURL = ...`) do NOT reset userTrackingMode.** The tracking mode is stored on the view, not the style. It survives style switches.

7. **User pan gesture resets `.follow` to `.none`.** This is intentional — the user is taking manual control.

**Correct re-center pattern (Waze-style):**
```swift
// On app launch / makeUIView:
mapView.userTrackingMode = .follow

// User pans around → mode auto-resets to .none (expected)

// Re-center button tapped:
mapView.userTrackingMode = .follow  // DO NOT use setCenterCoordinate

// Navigation mode:
mapView.userTrackingMode = .followWithCourse
```

**WRONG re-center pattern:**
```swift
// NEVER DO THIS — kills tracking mode
mapView.setCenter(mapView.userLocation!.coordinate, zoomLevel: 15, animated: true)
// After this line, userTrackingMode == .none, camera is static
```

---

### visibleFeatures (Screen-Coordinate Feature Queries)

Queries features currently rendered at a specific screen point or within a screen rectangle.

```swift
// Query at a single screen point
mapView.visibleFeatures(at: CGPoint,
                        styleLayerIdentifiers: Set<String>?,
                        predicate: NSPredicate?) -> [MLNFeature]

// Query within a screen rectangle
mapView.visibleFeatures(in: CGRect,
                        styleLayerIdentifiers: Set<String>?,
                        predicate: NSPredicate?) -> [MLNFeature]
```

**CRITICAL RULES:**

1. **These are SCREEN-COORDINATE queries.** They return features rendered at specific pixels. If the map is not centered on the user, converting a GPS coordinate to a screen point may give a point outside the viewport, returning zero results.

2. **Only returns features from VISIBLE layers.** If a layer has `isVisible = false` or `layer.isVisible = false`, its features will NOT be returned. This is the #1 cause of "query returns nothing" bugs.

3. **Overzoomed tiles:** Features from overzoomed tiles ARE returned (MapLibre renders them, just at lower fidelity).

4. **Symbol layers:** `visibleFeatures` does not reliably hit symbol layers (icons/text) because they are rendered with collision detection — some symbols may be hidden to avoid overlap.

5. **Performance:** Each call is a GPU readback. Do not call every frame. Debounce to 1-2 times per second maximum.

6. **Return type:** `[MLNFeature]` — each feature has `.attributes` (dictionary of properties from the source data), `.coordinate` (see MLNPolyline.coordinate warning below), and geometry.

---

### querySourceFeatures (Tile-Data Feature Queries)

Queries features loaded in memory from a vector tile source, filtered by predicate. Does NOT depend on screen coordinates.

```swift
// On MLNVectorTileSource:
source.features(inSourceLayersWithIdentifiers: Set<String>,
                predicate: NSPredicate?) -> [MLNFeature]

// On MLNShapeSource:
source.features(matching: NSPredicate?) -> [MLNFeature]
```

**CRITICAL RULES:**

1. **Does NOT take a geographic bounding box.** It returns ALL matching features from tiles currently loaded in the viewport's tile pyramid.

2. **Only returns features from tiles currently loaded.** If the user has scrolled away, features from those tiles may be evicted from memory.

3. **Better than visibleFeatures for detection** — no screen coordinate dependency, no layer visibility requirement. But still viewport-coupled.

4. **Predicate syntax uses NSPredicate:**
```swift
let predicate = NSPredicate(format: "name == %@", "Braveheart Trail")
let predicate = NSPredicate(format: "difficulty == %@ AND system == %@", "hard", "burning-rock")
```

5. **Use for:** Finding specific named features in loaded tiles, filtering by attribute.

6. **Do NOT use for:** Trail detection (still viewport-coupled). Use in-memory GeoJSON instead.

---

### MLNPolyline.coordinate — THE MIDPOINT TRAP

```swift
let feature: MLNFeature = ...
let coord = feature.coordinate  // WHERE IS THIS?
```

**`MLNPolyline.coordinate` returns the geographic MIDPOINT along the polyline.** It walks the line segments, accumulates distance, and interpolates to the halfway mark. It is NOT:
- The first point of the polyline
- The centroid (geographic center of bounding box)
- The nearest point to anything

**For a 7-mile trail, `feature.coordinate` could be 3.5 miles from where the user is standing.**

**NEVER use `feature.coordinate` for distance calculations.** Instead, iterate the polyline's coordinates array and compute nearest-point-on-segment:

```swift
// CORRECT: Nearest point on polyline to user
func nearestDistance(from userLocation: CLLocationCoordinate2D,
                     to polyline: MLNPolyline) -> CLLocationDistance {
    let coords = polyline.coordinates  // Array of CLLocationCoordinate2D
    var minDistance = CLLocationDistance.greatestFiniteMagnitude

    for i in 0..<(coords.count - 1) {
        let segmentStart = coords[i]
        let segmentEnd = coords[i + 1]
        let dist = distanceToSegment(point: userLocation,
                                      segStart: segmentStart,
                                      segEnd: segmentEnd)
        minDistance = min(minDistance, dist)
    }
    return minDistance
}
```

**Access the coordinates array:**
```swift
// MLNPolyline
let count = polyline.pointCount
var coords = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid,
                                      count: Int(count))
polyline.getCoordinates(&coords, range: NSRange(location: 0, length: Int(count)))
```

---

### MLNUserLocationAnnotationView

Custom user location dot. **MUST subclass `MLNUserLocationAnnotationView`, NOT `MLNAnnotationView`.**

```swift
class PulsingLocationAnnotationView: MLNUserLocationAnnotationView {
    override func update() {
        // Called when user location updates
        // Customize appearance here
    }
}

class NavigationArrowAnnotationView: MLNUserLocationAnnotationView {
    override func update() {
        // Rotate arrow to match course
        if let course = userLocation?.heading?.trueHeading {
            transform = CGAffineTransform(rotationAngle: CGFloat(course * .pi / 180))
        }
    }
}
```

**Using `MLNAnnotationView` instead causes `MLNUserLocationAnnotationTypeException` crash at runtime.** No compiler warning — it's a runtime type check.

**Switching between annotation views:**
```swift
// Toggle between pulsing dot and navigation arrow
mapView.showsUserLocation = false  // Remove current
// ... set new annotation view class in delegate ...
mapView.showsUserLocation = true   // Re-add with new view
```

**Delegate method for custom location views:**
```swift
func mapView(_ mapView: MLNMapView,
             viewFor annotation: MLNAnnotation) -> MLNAnnotationView? {
    guard annotation is MLNUserLocation else { return nil }
    let view = PulsingLocationAnnotationView(reuseIdentifier: "user-location")
    // configure...
    return view
}
```

---

### Style Lifecycle

Understanding what survives a style change and what doesn't.

**`setStyleURL:` triggers this sequence:**
1. Sets `self.style = nil` immediately
2. Removes ALL layers, sources, images from the old style
3. Begins async download/parse of new style JSON
4. Fires `mapView(_:didFinishLoading:)` when ready

**Preserved across style change:**
| Property | Survives? |
|----------|-----------|
| `centerCoordinate` | YES |
| `zoomLevel` | YES |
| `direction` (rotation) | YES |
| `pitch` (tilt) | YES |
| `userTrackingMode` | YES |
| `showsUserLocation` | YES |
| `minimumZoomLevel` / `maximumZoomLevel` | YES |

**LOST across style change (must re-add in didFinishLoadingStyle):**
| Property | Lost? |
|----------|-------|
| All custom style layers | YES — gone |
| All custom sources | YES — gone |
| All custom images | YES — gone |
| Annotations (MLNPointAnnotation, etc.) | NO — they are on the view, not the style |

**Correct pattern:**
```swift
func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
    // Re-add ALL custom sources
    addTrailSource(to: style)
    addPOISource(to: style)

    // Re-add ALL custom layers
    addTrailLayers(to: style)
    addPOILayers(to: style)

    // Re-add ALL custom images
    addTrailIcons(to: style)

    // Hide basemap clutter (run once per style load)
    hideBasemapTrailLayers(style: style)
    hideBasemapClutter(style: style)
}
```

---

### MLNStyle — Working with Layers and Sources

**Adding a source:**
```swift
// GeoJSON from data
let shapeSource = MLNShapeSource(identifier: "trails",
                                  shape: geoJSONShape,
                                  options: nil)
style.addSource(shapeSource)

// GeoJSON from URL
let urlSource = MLNShapeSource(identifier: "trails",
                                url: trailGeoJSONURL,
                                options: nil)
style.addSource(urlSource)

// Vector tiles from MBTiles (offline)
let tileSource = MLNVectorTileSource(
    identifier: "trail-tiles",
    configurationURL: URL(string: "mbtiles:///path/to/trails.mbtiles")!
)
style.addSource(tileSource)

// Vector tiles from TileJSON URL
let remoteSource = MLNVectorTileSource(
    identifier: "trails",
    configurationURL: URL(string: "https://example.com/tiles.json")!
)
style.addSource(remoteSource)
```

**Adding layers:**
```swift
// Line layer (trails)
let lineLayer = MLNLineStyleLayer(identifier: "trail-lines", source: shapeSource)
lineLayer.lineColor = NSExpression(forConstantValue: UIColor.orange)
lineLayer.lineWidth = NSExpression(forConstantValue: 3.0)
lineLayer.lineCap = NSExpression(forConstantValue: "round")
lineLayer.lineJoin = NSExpression(forConstantValue: "round")

// Data-driven styling
lineLayer.lineColor = NSExpression(mglJSONObject: [
    "match", ["get", "difficulty"],
    "easy", "#4CAF50",
    "moderate", "#2196F3",
    "hard", "#000000",
    "expert", "#F44336",
    "#FF9800"  // default
])

// Line dashing (outlaw trails)
lineLayer.lineDashPattern = NSExpression(forConstantValue: [2, 2])

style.addLayer(lineLayer)

// Insert layer below another
style.insertLayer(lineLayer, below: existingLayer)

// Insert layer above another
style.insertLayer(lineLayer, above: existingLayer)
```

**Layer visibility:**
```swift
layer.isVisible = false  // Hides layer. visibleFeatures will NOT return its features.
layer.isVisible = true   // Shows layer.
```

**Removing layers/sources:**
```swift
style.removeLayer(layer)
style.removeSource(source)
// MUST remove layers before removing source they reference
```

**Finding existing layers:**
```swift
if let layer = style.layer(withIdentifier: "trail-lines") as? MLNLineStyleLayer {
    layer.lineColor = NSExpression(forConstantValue: UIColor.red)
}
```

**Enumerating all layers:**
```swift
for layer in style.layers {
    print(layer.identifier)
}
```

---

### MLNShapeSource — GeoJSON Data

```swift
// From GeoJSON Data
let geoJSON = try! Data(contentsOf: url)
let shape = try! MLNShape(data: geoJSON, encoding: String.Encoding.utf8.rawValue)
let source = MLNShapeSource(identifier: "my-source", shape: shape, options: nil)

// From MLNShape objects
let polyline = MLNPolyline(coordinates: &coords, count: UInt(coords.count))
let source = MLNShapeSource(identifier: "route",
                             shape: polyline,
                             options: nil)

// Updating data (replace shape):
source.shape = newShape  // Triggers re-render
```

**Options dictionary:**
```swift
let options: [MLNShapeSourceOption: Any] = [
    .clustered: true,           // Enable clustering
    .clusterRadius: 50,         // Cluster radius in points
    .maximumZoomLevelForClustering: 14,
    .lineDistanceMetrics: true  // Enable line-distance for gradients
]
```

---

### MLNMapCamera

Immutable camera state object. Used with `fly(to:)` and delegate methods.

```swift
let camera = MLNMapCamera(
    lookingAtCenter: CLLocationCoordinate2D(latitude: 37.8, longitude: -80.5),
    altitude: 5000,           // meters above ground
    pitch: 45,                // degrees from vertical (0 = top-down)
    heading: 180              // degrees from north (0 = north up)
)

// Fly to camera with animation
mapView.fly(to: camera, withDuration: 2.0, completionHandler: nil)
// WARNING: This resets userTrackingMode to .none

// Set camera without animation
mapView.camera = camera
// WARNING: This also resets userTrackingMode to .none
```

**Camera that fits a bounding box:**
```swift
let bounds = MLNCoordinateBounds(
    sw: CLLocationCoordinate2D(latitude: 37.7, longitude: -80.6),
    ne: CLLocationCoordinate2D(latitude: 37.9, longitude: -80.4)
)
let camera = mapView.cameraThatFitsCoordinateBounds(bounds,
                                                     edgePadding: UIEdgeInsets(top: 50, left: 50,
                                                                               bottom: 50, right: 50))
mapView.fly(to: camera)
```

---

### MLNMapViewDelegate — Key Callbacks

```swift
// Style finished loading — add custom layers here
func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle)

// Map finished rendering a frame
func mapViewDidFinishRenderingFrame(_ mapView: MLNMapView, fullyRendered: Bool)

// Map finished rendering and is idle
func mapViewDidFinishRenderingMap(_ mapView: MLNMapView, fullyRendered: Bool)

// User location updated
func mapView(_ mapView: MLNMapView, didUpdate userLocation: MLNUserLocation?)

// Tracking mode changed (user panned, or programmatically changed)
func mapView(_ mapView: MLNMapView, didChange mode: MLNUserTrackingMode, animated: Bool)

// Tap on annotation
func mapView(_ mapView: MLNMapView, didSelect annotation: MLNAnnotation)

// Camera will change (gesture started, animation started)
func mapView(_ mapView: MLNMapView, regionWillChangeWith reason: MLNCameraChangeReason, animated: Bool)

// Camera did change (gesture ended, animation ended)
func mapView(_ mapView: MLNMapView, regionDidChangeWith reason: MLNCameraChangeReason, animated: Bool)

// Should the camera change? Return false to block.
func mapView(_ mapView: MLNMapView, shouldChangeFrom oldCamera: MLNMapCamera,
             to newCamera: MLNMapCamera) -> Bool
```

**MLNCameraChangeReason values:**
```swift
.none
.programmatic          // Code called setCenter, fly(to:), etc.
.resetNorth            // Compass button tapped
.gesturePan            // User dragged
.gesturePinch          // User pinched
.gestureRotate         // User rotated with two fingers
.gestureZoomIn         // User double-tapped
.gestureZoomOut        // User two-finger tapped
.gestureOneFingerZoom  // User double-tap-dragged
.gestureTilt           // User two-finger vertical drag
.transitionCancelled   // Animation was cancelled
```

---

### Offline Maps (MLNOfflineStorage)

```swift
// Define region to download
let region = MLNTilePyramidOfflineRegion(
    styleURL: styleURL,
    bounds: MLNCoordinateBounds(sw: swCoord, ne: neCoord),
    fromZoomLevel: 8,
    toZoomLevel: 16
)

// Start download
let context = "My Region".data(using: .utf8)!
MLNOfflineStorage.shared.addPack(for: region, withContext: context) { pack, error in
    pack?.resume()  // Start downloading
}

// Monitor progress
NotificationCenter.default.addObserver(
    forName: NSNotification.Name.MLNOfflinePackProgressChanged,
    object: nil,
    queue: .main
) { notification in
    guard let pack = notification.object as? MLNOfflinePack else { return }
    let progress = pack.progress
    let completed = progress.countOfResourcesCompleted
    let expected = progress.countOfResourcesExpected
    print("\(completed)/\(expected)")
}
```

**MBTiles for offline vector tiles (DirtSync pattern):**
```swift
// In style.json sources section — use mbtiles:// URL scheme
let style = """
{
  "version": 8,
  "sources": {
    "trails": {
      "type": "vector",
      "url": "mbtiles:///path/to/trails.mbtiles"
    }
  },
  "layers": [...]
}
"""

// Or add source programmatically
let source = MLNVectorTileSource(
    identifier: "trails",
    configurationURL: URL(string: "mbtiles:///\(bundlePath)/trails.mbtiles")!
)
```

---

### Coordinate Conversions

```swift
// Geographic → Screen point
let screenPoint = mapView.convert(coordinate, toPointTo: mapView)

// Screen point → Geographic
let coordinate = mapView.convert(screenPoint, toCoordinateFrom: mapView)

// Geographic → Meters (CLLocation)
let loc1 = CLLocation(latitude: coord1.latitude, longitude: coord1.longitude)
let loc2 = CLLocation(latitude: coord2.latitude, longitude: coord2.longitude)
let meters = loc1.distance(from: loc2)

// Meters per point at current zoom (for radius calculations)
let metersPerPoint = mapView.metersPerPoint(atLatitude: mapView.centerCoordinate.latitude)
```

---

### NSExpression — Style Expressions

MapLibre iOS uses NSExpression for all style property values. This is the most confusing API.

```swift
// Constant value
layer.lineColor = NSExpression(forConstantValue: UIColor.red)
layer.lineWidth = NSExpression(forConstantValue: 3.0)

// Data-driven (match expression)
layer.lineColor = NSExpression(mglJSONObject: [
    "match", ["get", "difficulty"],
    "easy", "#4CAF50",
    "moderate", "#2196F3",
    "hard", "#000000",
    "expert", "#F44336",
    "#FF9800"  // default (required)
] as [Any])

// Interpolate by zoom
layer.lineWidth = NSExpression(mglJSONObject: [
    "interpolate", ["linear"], ["zoom"],
    8, 1.0,    // At zoom 8: width 1
    12, 2.0,   // At zoom 12: width 2
    16, 4.0    // At zoom 16: width 4
] as [Any])

// Step expression
layer.circleColor = NSExpression(mglJSONObject: [
    "step", ["get", "rank"],
    "#cccccc",  // default
    10, "#ff0000",   // rank >= 10: red
    20, "#00ff00",   // rank >= 20: green
    50, "#0000ff"    // rank >= 50: blue
] as [Any])

// Boolean condition (case expression)
layer.iconImage = NSExpression(mglJSONObject: [
    "case",
    ["==", ["get", "type"], "gas"], "gas-icon",
    ["==", ["get", "type"], "food"], "food-icon",
    "default-icon"
] as [Any])
```

**Common mistakes with NSExpression:**
- Forgetting the default value at the end of `match` → crash
- Using Swift arrays without `as [Any]` cast → type inference failure
- Mixing `NSExpression(forConstantValue:)` with `NSExpression(mglJSONObject:)` → one or the other per property

---

## UIViewRepresentable Integration (SwiftUI)

The correct pattern for wrapping MLNMapView in SwiftUI:

```swift
struct MapViewRepresentable: UIViewRepresentable {
    @Binding var trackingMode: MLNUserTrackingMode
    var styleURL: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> MLNMapView {
        let mapView = MLNMapView(frame: .zero, styleURL: styleURL)
        mapView.delegate = context.coordinator
        mapView.showsUserLocation = true
        mapView.userTrackingMode = .follow  // Initial centering
        return mapView
    }

    func updateUIView(_ mapView: MLNMapView, context: Context) {
        // CRITICAL: Sync coordinator parent reference
        context.coordinator.parent = self

        // SAFE: Update tracking mode if changed
        if mapView.userTrackingMode != trackingMode {
            mapView.userTrackingMode = trackingMode
        }

        // SAFE: Update style URL if changed
        if mapView.styleURL != styleURL {
            mapView.styleURL = styleURL
        }

        // NEVER call setCenterCoordinate here — it fires every SwiftUI state change
        // NEVER set .follow unconditionally — it prevents user exploration
    }

    class Coordinator: NSObject, MLNMapViewDelegate {
        var parent: MapViewRepresentable

        init(_ parent: MapViewRepresentable) {
            self.parent = parent
        }

        func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
            // Add custom layers/sources HERE
        }

        func mapView(_ mapView: MLNMapView, didChange mode: MLNUserTrackingMode, animated: Bool) {
            // Sync tracking mode back to SwiftUI state
            DispatchQueue.main.async {
                self.parent.trackingMode = mode
            }
        }
    }
}
```

**CRITICAL: `context.coordinator.parent = self`** must be set at the top of `updateUIView`. Without this, delegate callbacks reference stale SwiftUI state. This causes bugs where:
- Tapping a trail shows the wrong trail's info
- Style switch callback uses the old style URL
- Tracking mode binding doesn't update

---

## Battle Learnings (Sessions 66-71)

### Trail Detection (The Right Way)

**Problem:** Detecting which trail a rider is on requires comparing GPS position to trail geometry. MapLibre's query APIs are all wrong for this.

**Why each MapLibre API fails for trail detection:**

| API | Problem |
|-----|---------|
| `visibleFeatures(at:)` | Screen coordinate — breaks when map not centered on user |
| `visibleFeatures(in:)` | Screen rect — same problem, plus performance hit for large rects |
| `querySourceFeatures` | Viewport-coupled — features evicted when user scrolls away |
| `feature.coordinate` | Returns midpoint, not nearest point — says you're 3.5 miles away when you're standing on the trail |

**Correct approach: In-memory GeoJSON nearest-point-on-line**
1. Load trail GeoJSON into memory at app start (not from MapLibre)
2. On each GPS update, compute nearest-point-on-segment for each trail
3. Threshold: < 30 meters = on trail. > 30 meters = off trail.
4. This has ZERO dependency on MapLibre viewport, layer visibility, or zoom level.

```swift
struct TrailDetector {
    let trails: [Trail]  // Loaded from GeoJSON file, NOT from MapLibre

    func detectTrail(userLocation: CLLocationCoordinate2D) -> Trail? {
        var closest: (trail: Trail, distance: CLLocationDistance)?
        for trail in trails {
            let dist = nearestDistance(from: userLocation, to: trail.coordinates)
            if dist < 30.0 {  // 30 meter threshold
                if closest == nil || dist < closest!.distance {
                    closest = (trail, dist)
                }
            }
        }
        return closest?.trail
    }
}
```

**Why 30 meters?** Field-tested at Burning Rock and Kidds Dairy. GPS accuracy on trails under canopy is 5-15m. A 30m threshold catches legitimate on-trail positions without false positives from nearby parallel trails. The 1-mile threshold used in earlier sessions caused false positives in Steve's basement.

### Centering and Tracking

- NEVER call `setCenterCoordinate` while `.follow` is active — it silently kills tracking
- Set `.follow` in `makeUIView` for initial centering on app launch
- Re-center button: set `mapView.userTrackingMode = .follow` (not setCenterCoordinate)
- Waze pattern: `.follow` on launch -> user pans -> `.none` (automatic) -> re-center button -> `.follow`
- During navigation: `.followWithCourse` for heading-up view
- Do NOT set `.follow` unconditionally in `updateUIView` — it fires on every SwiftUI state change and prevents the user from ever panning

### Dark Basemap

- CARTO Dark Matter: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`
- Free, no API key, production-grade CDN
- Call `hideBasemapTrailLayers()` to remove basemap trail data that conflicts with our trails
- Call `hideBasemapClutter()` to remove road labels, place names, POI symbols for clean rider view
- Our own trail labels/shields should be hidden during free riding for clean map

### Ghost Layer Spam Fix

`hideBasemapTrailLayers()` was firing on every render callback (hundreds of times per second during navigation). Fix:

```swift
private var ghostLayersHidden = false

func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
    ghostLayersHidden = false  // Reset on new style
    hideBasemapTrailLayers(style: style)
}

func hideBasemapTrailLayers(style: MLNStyle) {
    guard !ghostLayersHidden else { return }
    // ... hide layers ...
    ghostLayersHidden = true
}
```

Run once per style load, NOT per frame.

### Trail Styling

```swift
// Trail casing (outline behind the trail line for contrast)
// White casing is INVISIBLE on terrain basemap
// Use dark gray (opacity 0.15) for BOTH terrain and satellite basemaps
casingLayer.lineColor = NSExpression(forConstantValue: UIColor(white: 0.15, alpha: 1.0))
casingLayer.lineWidth = NSExpression(forConstantValue: 6.0)  // Wider than trail line

// Trail line on top
trailLayer.lineColor = NSExpression(forConstantValue: UIColor.orange)
trailLayer.lineWidth = NSExpression(forConstantValue: 3.0)
trailLayer.lineCap = NSExpression(forConstantValue: "round")

// Outlaw trails: dashed line
outlawLayer.lineDashPattern = NSExpression(forConstantValue: [2, 2])
```

### Route Overlay Styling

During route selection, the overlay MUST be transparent so trail colors and numbers stay visible:

```swift
// CORRECT: Transparent glow overlay
routeLayer.lineColor = NSExpression(forConstantValue: UIColor.systemBlue.withAlphaComponent(0.4))
routeLayer.lineWidth = NSExpression(forConstantValue: 8.0)

// WRONG: Opaque overlay that hides trail info
routeLayer.lineColor = NSExpression(forConstantValue: UIColor.systemBlue)  // Hides trails
```

### Annotations vs Style Layers

| Use Case | Approach |
|----------|----------|
| User location dot | `MLNUserLocationAnnotationView` subclass |
| POI markers (< 50) | `MLNPointAnnotation` + delegate |
| POI markers (> 50) | Symbol style layer from GeoJSON source |
| Trail lines | Line style layers from GeoJSON/MBTiles source |
| Route overlay | Line style layer from MLNShapeSource |
| Geofence circles | Fill style layer or `MLNPolygon` annotation |

Style layers are GPU-rendered and handle thousands of features. Annotations are UIViews and get expensive above ~50.

---

## MBTiles Integration (DirtSync Offline Pattern)

DirtSync serves trail tiles from local MBTiles files for fully offline operation.

**Style JSON with MBTiles source:**
```json
{
  "version": 8,
  "sources": {
    "trails": {
      "type": "vector",
      "url": "mbtiles:///path/to/bundle/trails.mbtiles"
    }
  },
  "layers": [
    {
      "id": "trail-lines",
      "type": "line",
      "source": "trails",
      "source-layer": "trail-data",
      "paint": {
        "line-color": "#FF6600",
        "line-width": 3
      }
    }
  ]
}
```

**Programmatic MBTiles source:**
```swift
func addMBTilesSource(to style: MLNStyle) {
    guard let mbtilesPath = Bundle.main.path(forResource: "trails", ofType: "mbtiles") else {
        print("ERROR: MBTiles file not found in bundle")
        return
    }
    let source = MLNVectorTileSource(
        identifier: "trail-tiles",
        configurationURL: URL(string: "mbtiles:///\(mbtilesPath)")!
    )
    style.addSource(source)
}
```

**Common MBTiles gotcha:** The `source-layer` name must match what's inside the MBTiles file (set during tile generation). If you get zero features rendered, the source-layer name is wrong. Inspect with: `sqlite3 trails.mbtiles "SELECT DISTINCT name FROM metadata;"`

---

## Anti-Patterns (NEVER DO THESE)

| # | Anti-Pattern | Why It Breaks | Correct Approach |
|---|-------------|---------------|------------------|
| 1 | Call `setCenterCoordinate` to center on user | Resets `userTrackingMode` to `.none` — camera becomes static | Set `mapView.userTrackingMode = .follow` |
| 2 | Use `feature.coordinate` for distance to trail | Returns polyline midpoint, not nearest point | Iterate coordinates array, compute nearest-point-on-segment |
| 3 | Use `visibleFeatures` for trail detection | Screen coordinate dependency — breaks when map not centered | In-memory GeoJSON nearest-point-on-line |
| 4 | Set `.follow` in `updateUIView` unconditionally | Fires every SwiftUI state change, prevents user exploration | Set `.follow` only in `makeUIView` and re-center button |
| 5 | Hide layers then query them with `visibleFeatures` | Hidden layers return zero features | Query source features instead, or keep layers visible |
| 6 | Subclass `MLNAnnotationView` for user location | Runtime crash: `MLNUserLocationAnnotationTypeException` | Subclass `MLNUserLocationAnnotationView` |
| 7 | Add layers/sources outside `didFinishLoadingStyle` | Style may be nil, layers lost on style change | Always add in the delegate callback |
| 8 | Call `visibleFeatures` every frame | GPU readback, causes jank | Debounce to 1-2 calls per second max |
| 9 | Skip `context.coordinator.parent = self` in updateUIView | Delegate callbacks reference stale SwiftUI state | First line of updateUIView, every time |
| 10 | Use 1-mile trail detection threshold | False positives in buildings, parallel trails | Use 30 meters (field-tested) |
| 11 | Run `hideBasemapTrailLayers` on every render callback | Hundreds of calls per second during nav | Guard with boolean flag, run once per style load |

---

## Gotchas

| Issue | Solution |
|-------|----------|
| `style` is nil when adding layers | Wait for `didFinishLoadingStyle` delegate callback |
| Custom layers disappear after basemap switch | Re-add all layers/sources in `didFinishLoadingStyle` |
| `visibleFeatures` returns empty array | Check: layer visible? Point in viewport? Tiles loaded at zoom? |
| Trail detection says user is far from trail they're standing on | You're using `feature.coordinate` (midpoint). Use nearest-point-on-segment. |
| Map jumps back to user after panning | You're setting `.follow` in `updateUIView`. Move to `makeUIView` only. |
| User location dot disappears after style change | `showsUserLocation` survives but annotation view may need re-creation |
| MBTiles source shows no features | Check `source-layer` name matches the MBTiles metadata |
| Line dash pattern not visible | Dashes only visible at certain zoom levels. Check `minzoom`/`maxzoom` on layer. |
| NSExpression crash on match | Missing default value at end of match array |
| Performance drops with many annotations | Switch from MLNPointAnnotation to symbol style layer for > 50 features |
| `fly(to:)` breaks tracking mode | Any programmatic camera movement resets tracking. Restore `.follow` in completion handler if needed. |
| Predicate filter returns nothing | NSPredicate string format — check attribute name case sensitivity and value types |

---

## Quick Reference Card

```
CENTERING:         mapView.userTrackingMode = .follow (NEVER setCenterCoordinate)
TRAIL DETECTION:   In-memory GeoJSON nearest-point (NEVER visibleFeatures)
DISTANCE:          Iterate polyline.coordinates (NEVER feature.coordinate)
CUSTOM LOCATION:   Subclass MLNUserLocationAnnotationView (NEVER MLNAnnotationView)
STYLE CHANGE:      Re-add layers in didFinishLoadingStyle (they are LOST)
SWIFTUI:           context.coordinator.parent = self in updateUIView (ALWAYS)
GHOST LAYERS:      Guard flag + run once per style load (NEVER per frame)
OFFLINE TILES:     mbtiles:///path scheme in source URL
DARK BASEMAP:      CARTO Dark Matter (free, no API key)
TRAIL THRESHOLD:   30 meters (field-tested at Burning Rock + Kidds Dairy)
```
