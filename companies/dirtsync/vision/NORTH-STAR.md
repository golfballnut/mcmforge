# DirtSync — North Star Vision

**Author:** Steve McMillian
**Date:** 2026-04-05
**Status:** Living document — updated as vision evolves

---

## The Soul

Waze for off-road. Mainly Hatfield trails and Outlaw trails — the trails our users crowdsource by riding. Clean, simple, accurate.

## Core Features

### 1. Navigation
- Full accurate navigation to any POI, on or off trails
- Pick alternate routes
- Add stops along a route
- Works like Waze — you tap where you want to go, it gets you there

### 2. Trail Maps
- All trails laid out and accurate
- Crowdsourced by riders — every ride improves the map
- Hatfield and Outlaw trails as the launch systems

### 3. Ride Tracking
- Tracks the ride in real-time
- Gives trail stats (distance, speed, elevation, time)

### 4. Community — DS Badge
- Every rider gets a DS badge
- Badge riders update trail conditions in real-time
- Share group rides with other users
- Share previous good trails with the community

### 5. Trail Discussions
- Riders can discuss trails
- Conditions, tips, warnings, recommendations

### 6. Group Rides
- Share group ride routes
- Other users can join or follow the same route

## Reference Apps
- **Waze** — navigation UX, crowdsourced data, clean simplicity
- **Strava** — ride tracking, stats, social sharing
- **Trailforks** — trail maps, conditions reporting
- **AllTrails** — POI discovery, route planning

## Deal-Breakers
- Navigation must be accurate — wrong turn on a trail is dangerous
- Trails must be laid out correctly — if the map is wrong, trust is gone
- Must work in low/no signal areas — trails don't have cell towers

## Anti-Patterns
- Don't overcomplicate the UI — Waze is simple, copy that
- Don't require constant internet — riders lose signal on trails
- Don't make users manually report everything — riding IS the data collection
- Don't ignore the social layer — riders want to share and connect

---

## What Matters Most (priority order)
1. Accurate trails and navigation (trust)
2. Ride tracking and stats (utility)
3. Offline capability (reliability)
4. Community features — badges, discussions, group rides (stickiness)
5. Alt routes and stops (power user)

---

## Technical Decisions

### Offline Mode — Full
Download an entire trail system (map tiles, trail data, POIs, routing graph). Ride all day with zero signal. Sync ride data, conditions, and community updates when signal returns.

### Community Backend — Supabase
Trail discussions, group rides, condition reports, DS badges — all stored in Supabase. In-app only. Apple wants users on-platform, and we own the data.

### Crowdsourcing — Passive
Every rider improves the app just by riding. Like Waze — the act of using IS the contribution. No manual effort required. DS badge = every rider is a contributor.

### Trail Data Reality (2026-04-05)
- **197 trail systems** in pipeline, all at `trails_loaded` status
- **No system has gold star yet** — all fail G10 (Valhalla tiles not built, route tests not passed)
- **Most mature:** Burning Rock (99 trails, 31 outlaws), Brimstone (622 trails), Spearhead (73 trails)
- **Hatfield-McCoy:** placeholder only — 0 trails in DB, needs full data load
- **V1 launch candidates:** Burning Rock, Brimstone, Spearhead (most complete data)
- **Gold pipeline:** 14 gates (G1-G14), must all pass before a system goes live

### Stack
- **iOS:** Swift/SwiftUI, MapLibre, Ferrostar (navigation), Valhalla (routing)
- **Backend:** Supabase (Postgres + Realtime + Auth + Storage)
- **Trail tiles:** Valhalla custom tiles on Fly.io
- **Repo:** `golfballnut/DirtSync` (uses `master`, not `main`)
- **Xcode project:** `DirtSync/DirtSync.xcodeproj`
