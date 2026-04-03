# Skill: Ferrostar Navigation Specialist

> Last updated: April 2, 2026
> Used by: DirtSync engineers, navigation agents
> Origin: Sessions 63-71 — navigation implementation and field testing

---

## Goal
Build Ferrostar-based turn-by-turn navigation features for the DirtSync trail riding app.

## DirtSync Ferrostar Setup
- **Package:** `stadiamaps/ferrostar` (Swift, via SPM)
- **Location provider:** ALWAYS use `CoreLocationProvider` (feeds both MapLibre AND Ferrostar)
- **Route source:** Valhalla routes converted via `convertToFerrostarRoute()`
- **Voice:** Ferrostar handles voice during navigation. TrailNavigationState voice is fallback only.

## Critical Rules

### GPS Provider: CoreLocationProvider ONLY
- `CoreLocationProvider` reads from `CLLocationManager` which gets real GPS (device) or simctl (simulator)
- `SimulatedLocationProvider` feeds Ferrostar INTERNALLY only — MapLibre's map view does NOT receive these updates
- Using SimulatedLocationProvider creates dual GPS streams that diverge → nav exits immediately
- For simulator testing: use `simctl location start` with waypoints → feeds CLLocationManager → drives BOTH map AND Ferrostar

### Voice Navigation
- Ferrostar has its own `AVSpeechSynthesizer`
- TrailNavigationState has its own `AVSpeechSynthesizer`  
- JunctionDetectionService has its own voice manager
- **3 synthesizers can overlap!** Only Ferrostar speaks during active navigation.
- Set `trailNavState.voiceManager.isNavigationActive = true` when Ferrostar starts

### Dark Theme
- Navigation uses CARTO Dark Matter basemap
- `mapStyleManager.useNavDarkTheme = true` when nav starts
- `mapStyleManager.useNavDarkTheme = false` when nav stops
- Free riding also uses dark theme via `useFreeRiderDarkTheme`

### Camera During Navigation
- `.followWithCourse` mode — map rotates to direction of travel (GPS course, not compass)
- z18 zoom, pitch 45°
- Pan cooldown: 5 seconds after user pan, then auto-recenter
- State machine controls camera: approaching→onRoute→offRoute→arriving→complete

### Reroute Flow
- Ferrostar detects deviation → `onReroute` callback
- NavStateMachine transitions to `.rerouting`
- Hybrid routing recalculates: Valhalla trails + Mapbox roads
- If hybrid fails, pure Valhalla fallback
- Voice: "Make a U-turn" on wrong direction detection

## Simulator Testing
```bash
# Feed GPS along a route (speed=6.7 m/s ≈ 15 MPH)
cat waypoints.txt | xcrun simctl location $DEVICE start --speed=6.7 --interval=1 -
```
- Waypoints file: lat,lon per line (from Valhalla route export or all-trails.geojson)
- MUST use CoreLocationProvider path (not SimulatedLocationProvider)
- `--uitesting` launch arg: throttles MapLibre to low-power FPS, auto-login

## Distance Formatting (Waze-style)
- 500+ feet: round to nearest 100
- 100-500 feet: round to nearest 50
- <100 feet: exact
- Implemented in `TurnCardView.formatDistance()` and `FerrostarNavigationService.formattedDistanceToManeuver`

## Anti-Patterns
1. NEVER use SimulatedLocationProvider for visual testing — only CoreLocationProvider
2. NEVER run both Ferrostar voice AND TrailNavigationState voice simultaneously
3. NEVER set camera zoom/pitch without checking navState (state machine controls camera)
4. NEVER skip the coordinator.parent = self update in updateUIView
