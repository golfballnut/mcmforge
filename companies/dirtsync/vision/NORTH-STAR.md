# DirtSync — North Star Vision

**Author:** Steve McMillian
**Date:** 2026-04-20
**Status:** Living document — updated as vision evolves

---

## Pivot — 2026-04-20

Previous vision assumed road and trail navigation would develop in parallel. That assumption is retired.

**Why roads-first:**
1. Road navigation is solved technology — 15 years of Waze documentation, clear HUD patterns, measurable bar.
2. Trail navigation is novel — shipping it in parallel masks road bugs and splits QA effort.
3. Steve drives roads daily → fast iteration loop, real-world feedback every session.
4. Today's field drive proved road nav is currently ZERO capabilities, not 50%. No maneuver card. No voice. No ETA. No reroute. Just a route line drawn on the map over ride tracking.

**Field data (2026-04-20):**
- Screen recording: `/Users/stevemcmillian/Downloads/ScreenRecording_04-20-2026 11-49-32_1.MP4` (1.2 GB)
- GPX: `https://lldipxvwocpqncixlnxj.supabase.co/storage/v1/object/public/ride-gpx/32a43c49-d6d3-4a17-945b-b8ede45d352a/7F3D30F8-9BC1-4887-AAA9-A0C9327CB468.gpx`
- 9 bugs documented from that drive

**New scope:** Phase 1 = Waze-quality road navigation. Phase 2 = trail navigation as new routable subdivisions.

---

## The Soul

Waze for off-road. Crowdsourced by riders — riding IS the contribution, no manual effort required. Offline-first because trails don't have cell towers.

Phase 1 makes road navigation indistinguishable from Waze. Phase 2 extends that same HUD and routing confidence onto trail systems, treating trails as new routable graph subdivisions.

---

## Core Features

### Phase 1 — V1 Ship (Road Navigation)
- **Maneuver card** — top-left, shows next turn with street name
- **"And then…" card** — secondary lookahead maneuver
- **ETA ribbon** — arrival time, elapsed time, remaining distance
- **Speed + posted limit** — stacked display (current mph / sign mph)
- **Route pill** — road/highway identifier attached to route line
- **Simplified vector basemap** — clean during active nav (NOT satellite — satellite is Explore mode only)
- **Voice at 3-announce cadence** — early, approaching, at-the-turn
- **Multi-route planning** — 2-3 route options before Go
- **Add-a-stop mid-route**
- **Reroute on deviation** — silent, to same destination
- **Arrival detection** — clear "You have arrived" state

### Phase 2 — Post-V1
- Trail navigation (trails as routable graph subdivisions)
- Ride tracking with stats (distance, speed, elevation, time)
- Hazard reporting with image
- DS Badge community layer
- Group rides
- Trail discussions

---

## Ship Definition (V1 Wow Moment)

The 5-step sequence that proves road nav is real:

1. Search destination → see 2-3 route options
2. Tap Go → Waze-style HUD engages (voice + maneuver card + ETA + speed + posted limit)
3. Add-a-stop mid-route
4. Deviate from route → reroute silently to same destination
5. Arrive → clear "You have arrived" state

All 5 must work on-device before V1 ships.

---

## Reference for the Waze HUD

Steve provided a reference photo 2026-04-20 showing Waze active in a truck dashboard. Elements DirtSync must match:

- **Maneuver card** — top-left corner, next turn with icon + street name
- **"And then…" secondary card** — smaller, below or beside primary
- **Speed + posted limit** — stacked: current speed (73 mph) over posted sign (70)
- **Route pill** — road identifier ("I-64 E") visually attached to the route line
- **ETA ribbon** — bottom bar: arrival time ("6:50 ETA") · elapsed ("56 min") · distance ("52 mi")
- **Basemap** — simplified vector during active nav. Satellite only in Explore mode.

---

## V1 Launch Corridor

V1 launch = **Fluvanna → DC / Richmond / Charlottesville corridors** (roads Steve drives daily).

Trail systems deferred to Phase 2:
- Burning Rock
- Kidds Dairy
- Hatfield-McCoy
- Outlaw trails

---

## What Matters Most (priority order)

1. Road navigation accuracy and trust (maneuver card, voice, reroute)
2. Offline capability (reliability — trails, rural roads)
3. Speed + posted limit display (safety signal)
4. Arrive state + ETA (utility)
5. Multi-route + add-a-stop (power user)
6. Trail navigation (Phase 2)
7. Community features — badges, discussions, group rides (Phase 2 stickiness)

---

## Reference Apps
- **Waze** — navigation UX, crowdsourced data, clean simplicity
- **Strava** — ride tracking, stats, social sharing
- **Trailforks** — trail maps, conditions reporting
- **AllTrails** — POI discovery, route planning

---

## Deal-Breakers
- Navigation must be accurate — wrong turn on a trail is dangerous
- Trails must be laid out correctly — if the map is wrong, trust is gone
- Must work in low/no signal areas — trails don't have cell towers

---

## Anti-Patterns
- Don't overcomplicate the UI — Waze is simple, copy that
- Don't require constant internet — riders lose signal on trails
- Don't make users manually report everything — riding IS the data collection
- Don't ignore the social layer — riders want to share and connect

---

## Technical Decisions

### Offline Mode — Full
Download an entire trail system (map tiles, trail data, POIs, routing graph). Ride all day with zero signal. Sync ride data, conditions, and community updates when signal returns.

### Community Backend — Supabase
Trail discussions, group rides, condition reports, DS badges — all stored in Supabase. In-app only. Apple wants users on-platform, and we own the data.

### Crowdsourcing — Passive
Every rider improves the app just by riding. Like Waze — the act of using IS the contribution. No manual effort required. DS badge = every rider is a contributor.

### Stack
- **iOS:** Swift/SwiftUI, MapLibre, Ferrostar (navigation), Valhalla (routing)
- **Backend:** Supabase (Postgres + Realtime + Auth + Storage)
- **Trail tiles:** Valhalla custom tiles on Fly.io
- **Repo:** `golfballnut/DirtSync` (uses `master`, not `main`)
- **Xcode project:** `DirtSync/DirtSync.xcodeproj`

---

## Trail Data Reality — Phase 2 Reference

- **197 trail systems** in pipeline, all at `trails_loaded` status
- **No system has gold star yet** — all fail G10 (Valhalla tiles not built, route tests not passed)
- **Most mature:** Burning Rock (99 trails, 31 outlaws), Brimstone (622 trails), Spearhead (73 trails)
- **Hatfield-McCoy:** placeholder only — 0 trails in DB, needs full data load
- **Gold pipeline:** 14 gates (G1-G14), must all pass before a system goes live
- Trail systems activate in Phase 2 after road nav ships
