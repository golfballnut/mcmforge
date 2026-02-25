# DirtSync

## Overview

Trail navigation app for off-road/ATV/UTV/dirt bike riders. Dual-platform: iOS native (SwiftUI) + Web (Next.js). Heavy on map rendering, trail routing, and group ride features.

| Key | Value |
|-----|-------|
| Repo | [golfballnut/DirtSync](https://github.com/golfballnut/DirtSync) |
| Deploy | Vercel (auto-deploy from `master` branch) |
| Web URL | dirtsync.app |
| Supabase Project | `lldipxvwocpqncixlnxj` (us-east-1) |
| Bundle ID (iOS) | `app.dirtsync.DirtSync` |
| Test User | `test@dirtsync.app` / `TestPass123!` |
| Domain Email | support@dirtsync.app, no-reply@dirtsync.app |
| Branch Protection | Yes -- all changes via PR, CI gates must pass |

---

## Tech Stack

### Web (`/web`)

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.6 | App framework (App Router) |
| React | 19.2.3 | UI library |
| TypeScript | 5.9.3 | Type safety |
| Mapbox GL JS | 3.18.1 | Map rendering, trail visualization |
| Tailwind CSS | 4.x | Styling (PostCSS plugin) |
| Supabase JS | 2.94.1 | Auth, database, realtime |
| @supabase/ssr | 0.8.0 | Server-side Supabase client |
| Turf.js | 7.3.4 | Geospatial calculations (distance, circle, nearest-point-on-line, length, line-slice) |
| @hello-pangea/dnd | 18.0.1 | Drag-and-drop for trip planning |
| Lucide React | 0.563.0 | Icons |
| Resend | 6.9.1 | Transactional email |
| Svix | 1.84.1 | Webhook management |
| Playwright | 1.58.2 | E2E testing |
| Geist Font | - | Typography (Sans + Mono) |

### iOS (`/DirtSync`)

| Technology | Purpose |
|------------|---------|
| SwiftUI | UI framework (iOS 17+) |
| MapLibre GL | Map rendering (native) |
| Ferrostar | Turn-by-turn navigation SDK |
| Valhalla | Trail routing engine (109MB bundled tiles) |
| Supabase Swift | Auth, database, storage |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Vercel | Web hosting, preview deploys, cron jobs |
| Supabase | PostgreSQL DB, Auth, Realtime, Storage |
| Mapbox | Map tiles, geocoding, satellite/terrain styles |
| Resend | Email delivery |

---

## Architecture

### Web Application Structure

```
web/src/
  app/                     # Next.js App Router pages
    page.tsx               # Landing page (marketing, 7 sections)
    layout.tsx             # Root layout (dark theme, Geist fonts)
    map/                   # Full-screen trail map explorer
      _components/
        TrailMap.tsx        # Main map component (Mapbox GL)
        trail-map-types.ts # Types, trail system constants, map config
        SystemSelector.tsx  # Trail system dropdown (grouped by region)
        FilterPills.tsx     # Difficulty filter pills
        MapControls.tsx     # Satellite/terrain toggle, zoom controls
        PoiSearch.tsx       # POI search with Mapbox geocoding
        TrailDetailPanel.tsx# Trail info on click
    plan/                  # Trip planner (route building)
      _components/
        TripMap.tsx         # Interactive map with snap-to-trail
        trailRouter.ts     # Client-side Dijkstra routing on trail graph
        trailInteractions.ts# Trail hover, labels, difficulty colors
        trailConfig.ts     # Active trail systems, vehicle access
        snapToTrail.ts     # Snap waypoints to nearest trail
        RoutePlannerFlow.tsx# Step-by-step route building flow
        RouteComparison.tsx # Compare 3-5 route options
        POISearchModal.tsx  # Search POIs near route
        ElevationProfile.tsx# Elevation chart for route
        WeatherOverlay.tsx  # Weather data overlay
        GPXExportButton.tsx # Export route as GPX
        VehicleSelector.tsx # Dirt bike / ATV / UTV selector
        FuelEstimate.tsx    # Fuel range estimation
        SaveTripModal.tsx   # Save trip to Supabase
        ShareModal.tsx      # Share trip via link/code
    ride/                  # Live group ride tracking
      _components/
        RidePanel.tsx       # Ride session management
        RiderMarkers.tsx    # Real-time rider positions
        CreateRideModal.tsx # Create a group ride session
        JoinRideModal.tsx   # Join via ride code
        NearbyRiderMarkers.tsx # Nearby rider discovery
        ConditionReportModal.tsx # Trail condition reporting
        TrailReportMarkers.tsx # Trail condition markers
    explore/               # Trail system discovery page (SSR metadata)
    waypoints/             # Waypoint browser (sidebar + map)
    trips/                 # Multi-day trip planner
    admin/                 # Admin dashboard (protected by middleware)
      (dashboard)/
        beta/              # Beta signup management
        costs/             # API cost tracking
        roadmap/           # Product roadmap
        agents/            # Agent activity monitoring
    auth/                  # Auth callback, password reset
    beta/                  # TestFlight signup form
    pricing/               # Free / Pro ($4.99/mo) / Sync+ Bundle (coming soon)
    signup/, signin/       # Auth pages
    features/              # Feature showcase page
    blog/, about/, profile/# Standard pages
    settings/vehicle/      # Vehicle configuration
    privacy/, terms/       # Legal pages
    packs/                 # Ride packs/track packs
    api/                   # API routes (see below)
  components/
    trip/                  # Shared trip components
  hooks/
    useNearbyRiders.ts     # Realtime nearby rider subscription
    useRideTracking.ts     # Ride tracking with geolocation
    useTrailReports.ts     # Trail condition reports
  lib/
    supabase.ts            # Client-side Supabase client
    supabase-server.ts     # Server-side Supabase client
    supabase/middleware.ts  # Session management for middleware
    us-states.ts           # State name from coordinates
  types/
    trip.ts                # Trip, TripLeg, TripWaypoint, POISearchResult types
  data/
    trails.json            # Static trail data fallback
  utils/
    format-distance.ts     # Distance formatting helpers
  middleware.ts            # Auth guard for /admin/*, code redirect
```

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/trails/geojson` | GET | Fetch trail GeoJSON from `trail_lines` table with bbox filtering, badge generation, intersection bursts |
| `/api/trails/outlaw` | GET | Fetch outlaw trails from `bobt_trails` (is_outlaw=true) with bbox filtering |
| `/api/trails/hmt` | GET | Hatfield-McCoy specific trail data |
| `/api/trails/record` | POST | Record GPS trail from rider |
| `/api/trail-systems` | GET | List all trail systems with stats (via RPC or fallback query) |
| `/api/trail-systems/[slug]` | GET | Single trail system detail |
| `/api/waypoints` | GET | Trail waypoints with filtering (system, category, radius, outlaw, SxS) |
| `/api/waypoints/systems` | GET | Waypoint systems list |
| `/api/pois` | GET | Points of interest |
| `/api/route` | POST | Server-side routing |
| `/api/rides` | GET/POST | Group ride sessions |
| `/api/rides/[id]/location` | POST | Update rider location |
| `/api/rides/[id]/end` | POST | End a ride session |
| `/api/rides/[id]/leave` | POST | Leave a ride session |
| `/api/rides/join` | POST | Join a ride session |
| `/api/ride/location` | POST | Individual ride location ping |
| `/api/ride/session` | POST | Ride session management |
| `/api/trail-reports` | GET/POST | User trail condition reports |
| `/api/trail-reports/[id]/vote` | POST | Vote on trail report |
| `/api/trips` | GET/POST | Trip CRUD |
| `/api/trips/[id]` | GET/PUT/DELETE | Single trip operations |
| `/api/trips/[id]/days` | GET/POST | Multi-day trip days |
| `/api/trips/[id]/days/[dayId]/legs` | GET/POST | Trip legs per day |
| `/api/trips/[id]/days/[dayId]/legs/[legId]/pois` | GET/POST | POIs per leg |
| `/api/elevation` | GET | Elevation data for coordinates |
| `/api/beta-signup` | POST | Beta waitlist signup |
| `/api/support` | POST | Support ticket submission |
| `/api/health` | GET | Health check |
| `/api/admin/*` | Various | Admin endpoints (tasks, feedback, requests, social, logs, etc.) |
| `/api/webhooks/telegram` | POST | Telegram bot webhook |
| `/api/webhooks/resend` | POST | Resend email webhook |
| `/api/cron/agent-heartbeat` | GET | Agent health check (every 5 min) |
| `/api/cron/daily-costs` | GET | API cost tracking (daily) |
| `/api/cron/weekly-digest` | GET | Weekly digest email (Monday 1pm UTC) |
| `/api/cron/learn-from-failures` | GET | Agent learning from failures (daily 6am) |
| `/api/cron/analyze-failures` | GET | Failure analysis (daily 7am) |

### Map Rendering Architecture

The map uses **Mapbox GL JS v3** with multiple layers:

1. **Base Style**: `satellite-streets-v12` or `outdoors-v12` (toggle)
2. **Trail Sources**: Dynamic GeoJSON from Supabase via `/api/trails/geojson`
   - `all-trails-source` -- primary dynamic trails from `trail_lines` table
   - `hatfield-mccoy` -- legacy static fallback
   - `burning-rock` -- legacy static fallback
3. **Trail Layers** (per source):
   - Casing layer (white outline, 6-8px, provides contrast on satellite)
   - Trail line layer (difficulty-colored, 3-4px)
   - Label layer (symbol, `minzoom: 12`, trail number badges)
4. **Outlaw Trail Layer**: Separate source from `/api/trails/outlaw`, dashed gold lines
5. **POI Layers**: Canvas-rendered circle icons per category (Gas, Camping, Food, etc.)
6. **Badge Layers**: Distance-based badge points at midpoint/half-mile/quarter-mile intervals
7. **Intersection Burst Layers**: Diamond markers + directional arm badges at trail junctions

**Difficulty Color Scheme** (OHV industry standard):
- Easy: Green (`#22c55e` / `#1B7A2B` dark variant)
- Moderate: Blue (`#3b82f6` / `#1D4ED8`)
- Hard: Black (`#1c1c1e` / `#000000`) with white casing for visibility
- Expert: Red (`#dc2626` / `#D9342E`)

### Trail Routing (Client-Side)

The `trailRouter.ts` implements a full client-side trail routing engine:

1. **Graph Building**: Trail GeoJSON features are converted into a graph with nodes (endpoints/intersections) and edges (trail segments)
2. **Spatial Hashing**: O(n) grid-based intersection detection (100m grid cells)
3. **Dijkstra's Algorithm**: Weighted shortest-path with multiple strategies:
   - Shortest Route (standard distance weight)
   - Easy Route (5x penalty on hard, 10x on expert)
   - Challenge Route (3x penalty on easy, 1.5x on moderate)
   - Alternate Route (Yen's-inspired, 3x penalty on shortest route edges)
4. **Vehicle Filtering**: UTV can only use easy/moderate; ATV adds hard; dirt bike can use all
5. **Component Bridging**: Disconnected trail components are connected via road-connector edges (up to 2km)
6. **Graph Caching**: Built once per feature set, warmed up async after trail load

### iOS Architecture

208 Swift files organized as MVVM:

```
DirtSync/DirtSyncApp/
  Views/          # 77 SwiftUI views
  ViewModels/     # 8 view models (Explore, RoutePlanner, TripPlanner, etc.)
  Models/         # 30+ data models
  Services/       # 51 services (routing, auth, map, offline, etc.)
  Components/     # Reusable UI components
```

Key iOS services:
- **HybridRoutingService**: Switches Mapbox (road) -> Valhalla (trail) within 20mi of trail systems
- **ValhallaService**: Bundled Valhalla routing with 109MB trail tiles (`highway=track` OSM format)
- **FerrostarNavigationService**: Turn-by-turn navigation SDK integration
- **OfflineMapService**: Downloadable map regions for no-cell-service areas
- **RideRecordingService**: GPS trail recording
- **RiderPresenceService**: Realtime group ride tracking
- **MapStyleManager**: Trail difficulty styling
- **VoiceNavigationManager**: Voice-guided turn-by-turn

### Data Flow

```
Supabase DB
  -> API Routes (Next.js edge/serverless)
    -> React Components (client-side state)
      -> Mapbox GL JS (visual rendering)
        -> Turf.js (spatial calculations)

iOS: Supabase Swift -> ViewModels -> SwiftUI Views -> MapLibre + Valhalla
```

---

## Key Features

### Trail Systems (17+ Systems)

**Hatfield-McCoy Trail System (WV)** -- 15 subsystems:
Pinnacle Creek (45 trails/147mi), Bearwallow (66/120mi), Ivy Branch (70/95mi), Buffalo Mountain (51/73mi), Rockhouse (42/85mi), Indian Ridge (37/52mi), Devil Anse (39/65mi), Pocahontas (34/48mi), Big Coal (25/38mi), Warrior (19/34mi), Braveheart (20/32mi), Cabwaylingo (18/28mi), Bergoo (68/90mi), East Lynn (53/70mi), Hillbilly/Tornado (97/158mi)

**Spearhead Trails (VA)**: 269 trails / 500 miles
**Breaks Mountain (VA/KY)**: 65 trails / 85 miles

Landing page claims: 895+ trails mapped, 50+ trail systems, 83,000+ trails (including community data)

### Outlaw Trails

Community-submitted unofficial trails stored in `bobt_trails` with `is_outlaw = true`. Visual distinction:
- Dashed gold line style (vs solid colored official trails)
- Separate toggle switch (OutlawToggle component)
- Can be shown/hidden independently

### POI / Waypoints

12 categories with color-coded markers:
- Trailhead (green), Gas Station (red), Restaurant (orange), Lodging (blue)
- Water (cyan), Camping (green), Obstacle (yellow), Viewpoint (purple)
- Parking (gray), Intersection (white), Bail Out (amber), Sign Post (light gray)

Filtering: by trail system, category, radius from point, SxS passability, outlaw status

### Difficulty Badges

Trail difficulty badges are rendered at intervals:
- Midpoint badges (zoom 10-11): one per trail
- Half-mile badges (zoom 12-13): every 0.5 miles
- Quarter-mile badges (zoom 14+): every 0.25 miles
- Intersection burst badges: directional arm indicators at junctions
- Badges suppressed within 1/8 mile of junction centers to avoid clutter

### Satellite / Terrain Toggle

Two Mapbox base styles:
- `satellite-streets-v12` -- aerial imagery with road labels
- `outdoors-v12` -- topographic terrain with contour lines
- Trail text labels hidden on satellite view (PR #168)

### Route Planning

- Click-to-route on trail network with snap-to-trail
- 3-5 route options per query (shortest, easy, challenge, alternate)
- Difficulty breakdown per route (easy/moderate/hard/expert miles)
- Vehicle-type filtering (dirt bike / ATV / UTV)
- Road connector distance calculation
- Trail percentage metric
- Elevation profile
- Fuel range estimation
- GPX export
- Route sharing via link

### Multi-Day Trip Planning

- Create multi-day trips with legs per day
- Drive / Ride / Stop leg types
- POI waypoints per leg
- Drag-and-drop leg reordering
- Trip sharing with unique share codes
- Save/load from Supabase

### Live Group Rides

- Create/join rides with join codes
- Real-time rider position tracking (Supabase Realtime)
- Nearby rider discovery
- Trail condition reporting during rides
- Ride recording and history

### Pricing

- **Free**: Trail browsing, basic routing, trail conditions, 1 saved route
- **Pro ($4.99/mo)**: Offline maps, turn-by-turn navigation, group rides
- **Sync+ Bundle**: Coming soon (premium trail data, advanced analytics)

---

## Database Tables (Supabase)

### Core Trail Data

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `trail_lines` | Official trail geometries (from Bob T GPS data) | trail_name, trail_system, difficulty, coordinates (JSONB), distance_miles, is_connector, trailhead_lat/lng, merged_into |
| `bobt_trails` | All trails including outlaw | name, system, distance_miles, coordinates, is_outlaw |
| `bobt_pois` | Bob T POI data | - |
| `bobt_raw_tracks` | Raw GPS track imports | - |
| `trail_waypoints` | Waypoints/POIs with filtering | name, trail_system, category, difficulty, lat, lng, is_outlaw, is_sxs_passable, trail_width, elevation_ft |
| `trail_ratings` | User trail ratings | - |
| `trail_reports` | Trail condition reports | - |
| `trail_conditions` | Real-time trail conditions | - |
| `trail_regions` | Geographic regions for trails | - |
| `trail_system_pipeline` | Trail system ingestion pipeline | - |

### Trip / Route Data

| Table | Purpose |
|-------|---------|
| `planned_trips` | Saved trip plans |
| `trips` | Active trips |
| `trip_legs` | Route legs per trip |
| `trip_days` | Multi-day trip day containers |
| `trip_pois` | POIs associated with trip legs |
| `trip_stops` | Trip stop points |
| `trip_waypoints` | Waypoints in a trip |
| `trip_shares` | Shared trip access |

### Social / Community

| Table | Purpose |
|-------|---------|
| `rides` | Group ride sessions |
| `ride_sessions` | Active ride sessions |
| `rider_locations` | Real-time rider GPS positions |
| `ride_packs` | Ride pack groups |
| `ride_pack_ratings` | Ride pack ratings |
| `group_rides` | Group ride definitions |
| `group_ride_members` | Members in group rides |
| `group_chat_messages` | In-ride chat |
| `feed_posts` | Community feed |
| `feed_comments` | Comments on posts |
| `feed_likes` | Post likes |
| `follows` | User follow relationships |
| `hazard_reports` | Hazard reporting |

### User Data

| Table | Purpose |
|-------|---------|
| `users` | Supabase auth users |
| `profiles` | User profiles |
| `user_tracks` | Recorded GPS tracks |
| `track_pois` | POIs from user tracks |
| `track_packs` | User track pack collections |
| `track_pack_ratings` | Pack ratings |
| `saved_places` | Bookmarked locations |
| `location_pings` | Location update log |
| `emergency_contacts` | Emergency contact info |
| `subscriptions` | User subscription status |

### Admin / Operations

| Table | Purpose |
|-------|---------|
| `syncboard_tasks` | Agent task queue |
| `syncboard_sessions` | Agent sessions |
| `syncboard_logs` | Agent activity logs |
| `syncboard_costs` | API cost tracking |
| `syncboard_feedback` | User feedback |
| `syncboard_requests` | Feature requests |
| `syncboard_social_posts` | Marketing content |
| `syncboard_settings` | System settings |
| `syncboard_api_usage` | API usage metrics |
| `syncboard_file_locks` | File lock management |
| `syncboard_usage_logs` | Usage analytics |
| `syncboard_sql_logs` | SQL audit log |
| `beta_signups` | Beta waitlist |
| `waitlist` | General waitlist |
| `resend_webhook_events` | Email webhook log |
| `support_tickets` | Support requests |
| `marketing_content` | Marketing assets |
| `marketing_alerts` | Marketing notifications |
| `growth_metrics` | Growth analytics |
| `growth_experiments` | A/B test tracking |
| `ops_health_checks` | System health monitoring |
| `ops_cost_tracking` | Infrastructure costs |
| `knowledge_base` | Internal knowledge |
| `system_reports` | System status reports |
| `presentations` | Investor/sales presentations |
| `presentation_slides` | Slide content |
| `session_handoffs` | Agent session handoff docs |

### Agent / Intelligence

| Table | Purpose |
|-------|---------|
| `agent_memory` | Persistent agent memory |
| `agent_learnings` | Agent learning from failures |
| `skill_metrics` | Agent skill performance tracking |
| `coo_brain` | COO agent knowledge base |
| `coo_roadmap` | Product roadmap items |
| `coo_agent_brief` | Agent briefing docs |
| `competitor_apps` | Competitive intelligence |
| `competitor_research` | Research data |
| `competitor_synthesis` | Competitive analysis |
| `pois` | General POI database |
| `public_lands` | Public land boundaries |
| `points_of_interest` | Extended POI data |
| `trail_pois` | Trail-specific POIs |

---

## Known Issues (Current)

### Outlaw Trails Visibility (CRITICAL)
- Outlaw trails currently only render at zoom 12+ on the map
- Should match official trail visibility starting at zoom 9
- No difficulty badges or labels on outlaw trails
- PR #188 (open) addresses badges, gold styling, and map legend
- PR #185 (merged 2026-02-24) fixed outlaw toggle and basic styling

### Trail Connectivity
- Some trail systems have gaps between segments (50m-2km)
- PR #187 (open) has connectivity analysis and fix migration
- Client-side router bridges disconnected components (up to 2km) as workaround

### Map Legend
- No visual legend distinguishing official vs outlaw trails
- No legend for difficulty colors (users must learn the convention)
- PR #188 (open) adds a legend

### Web Routing Limitations
- Web uses Mapbox Directions for road routing (real roads only)
- Blue trail lines on web are VISUAL overlays, not server-routable
- Client-side Dijkstra works for on-trail routing but cannot do road-to-trail hybrid on web
- iOS has full hybrid routing via Valhalla (20-mile handoff threshold)

### Mobile Responsiveness
- Map toolbar layout issues at narrow viewports (fixed in PR #183)
- Dashboard/kanban not fully mobile-responsive (PR #186 closed, not merged)

---

## Competitive Position

**Current Rating: 4/10** vs OnX Off-Road at **9/10**

### Key Gaps vs OnX

| Feature | DirtSync | OnX Off-Road |
|---------|----------|-------------|
| Offline Maps | iOS only (limited) | Full offline with download regions |
| Weather Overlay | Placeholder component | Real-time weather + forecast |
| Trail Conditions | Basic reporting | Crowdsourced + official data |
| Social Features | Group rides (basic) | Full social network, leaderboards |
| Trail Discovery | System-based browsing | AI recommendations, popularity |
| User Base | Beta stage | Millions of active users |
| Coverage | WV/VA focused (17 systems) | Nationwide (100K+ trails) |
| Turn-by-Turn | iOS via Ferrostar | Full turn-by-turn with rerouting |
| Vehicle Profiles | 3 types (dirt bike/ATV/UTV) | Detailed vehicle profiles |
| Terrain Data | Mapbox base layers | Custom topo + ownership layers |

### 10 Things to Close the Gap (from Steve's assessment)

1. Nationwide trail coverage (not just WV/VA)
2. Full offline map downloads with tile caching
3. Real-time weather overlay with alerts
4. Crowdsourced trail condition updates
5. Social features (follows, feed, achievements)
6. AI-powered trail recommendations
7. Advanced vehicle profiles with clearance data
8. Land ownership / public land overlay
9. Trail popularity heatmaps
10. Richer turn-by-turn with voice rerouting

See [[competitors/onx.md]] for detailed competitive analysis.

---

## Recent Activity (as of 2026-02-24)

### Open PRs

| PR | Title | Status |
|----|-------|--------|
| #188 | feat: outlaw trail badges, gold styling, and map legend | Open |
| #187 | feat: outlaw trail connectivity analysis and fix migration | Open |
| #182 | feat: add worktree isolation to factory builder stage | Open |
| #181 | feat: test factory on rejected PR #172 (trail scraper) | Open |
| #180 | feat: skills cleanup, trim verbose skills | Open |
| #179 | feat: test factory on rejected PR #169 (trail detail panel) | Open |

### Recently Merged PRs

| PR | Title | Merged |
|----|-------|--------|
| #185 | fix: outlaw trails toggle, zoom level, and styling | 2026-02-24 |
| #184 | fix: POI search returns results with dropdown | 2026-02-24 |
| #183 | Fix map toolbar responsive layout at narrow viewports | 2026-02-24 |
| #178 | feat: factory assembly line - 6-stage build pipeline | 2026-02-23 |
| #177 | feat: /api/trails/record endpoint for GPS trail recording | 2026-02-22 |
| #176 | feat: trail_reports table for user-submitted conditions | 2026-02-22 |
| #175 | feat: Explore page with trail system cards and search | 2026-02-22 |
| #174 | feat: fix duplicate trail badges at same zoom level | 2026-02-22 |
| #173 | feat: POI click popup with card-style detail view | 2026-02-22 |
| #171 | feat: POI search bar with 20-mile radius filter | 2026-02-22 |
| #170 | feat: mobile map controls, larger touch targets | 2026-02-22 |
| #168 | feat: hide basemap trail labels on satellite view | 2026-02-22 |
| #167 | fix: restore trail rendering + fix system locations | 2026-02-21 |
| #166 | feat: polish landing page hero for investor demo | 2026-02-21 |
| #165 | feat: import 9 connector roads back into bobt_trails | 2026-02-21 |
| #164 | fix: suppress route error toast on initial map load | 2026-02-21 |

### Rejected/Closed PRs

| PR | Title | Reason |
|----|-------|--------|
| #186 | fix: dashboard mobile-responsive | Closed without merge |
| #172 | feat: scrape trail descriptions from HMT website | Rejected |
| #169 | feat: trail badge -> trail detail panel with AI description | Rejected |

---

## Quality Gates

Code tasks must pass 7 gates (G1-G7) before reporting done. TDD required: test must FAIL before fix, PASS after. Evidence must differ.

CI pipeline:
1. Lint (TypeScript)
2. Type Check (`tsc --noEmit`)
3. Build (`next build`)
4. Playwright E2E tests
5. Vercel preview deploy
6. Steve reviews preview URL
7. Steve approves/rejects

### File Size Limits
- **500 lines**: Warning threshold
- **800 lines**: Hard stop -- must refactor

---

## Cron Jobs (Vercel)

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| Every 5 min | `/api/cron/agent-heartbeat` | Agent health monitoring |
| Daily midnight | `/api/cron/daily-costs` | API cost aggregation |
| Monday 1pm UTC | `/api/cron/weekly-digest` | Weekly digest email |
| Daily 6am | `/api/cron/learn-from-failures` | Agent learning pipeline |
| Daily 7am | `/api/cron/analyze-failures` | Failure analysis |

---

## Key Architectural Decisions

1. **Trails ARE Roads**: `geojson2osm.py` converts trail GeoJSON to OSM XML with `highway=track`. Valhalla routes them as motorcycle roads with `use_trails=1.0`.
2. **20-Mile Handoff**: iOS HybridRoutingService switches from Mapbox (road) to Valhalla (trail) within 20 miles of trail systems.
3. **Web Can't Route Trails Server-Side**: Web uses Mapbox Directions (real roads only). Client-side Dijkstra handles trail routing. Blue trail lines are visual overlays.
4. **Dual Trail Tables**: `trail_lines` for official curated data (with badge generation), `bobt_trails` for all trails including outlaw (raw GPS imports).
5. **Graph Caching**: Trail graph is built once per feature set and cached in memory for instant routing on subsequent clicks.
6. **Badge Deduplication**: Multi-segment trails are grouped by trail_id, coordinates concatenated, badges placed at intervals along the merged polyline.

---

## Relationships

- **Competitor**: [[competitors/onx.md]] -- primary competitive benchmark
- **Platform**: [[companies/mcmforge.md]] -- managed by MCM Forge AI agent infrastructure
- **Skills Needed**: [[agents/skills/visual-bug-fix.md]], [[agents/skills/codebase-aware.md]]
- **Owner**: Steve McMillan (all 5 companies)
- **Data Source**: Bob T (GPS trail data supplier for WV/VA trail systems)

---

## Agent Working Notes

### Before Touching These Areas -- Read First

| Area | Required Reading |
|------|-----------------|
| Map/trails/tiles | `.claude/skills/setup/map-layers/SKILL.md` |
| Auth/deep links | `.claude/skills/shared/auth-architecture.md` |
| Mapbox/POI/search | `.claude/skills/shared/mapbox-integration.md` |
| Routing/navigation | `.claude/skills/shared/trail-routing-architecture.md` |

### Git Workflow (Enforced)

- **Never push to master directly** -- branch protection enforced by GitHub
- Branch naming: `agent/{task-slug}` for executor tasks, `feature/{name}` for local sessions
- All CI checks must pass before merge
- Steve must see Vercel preview URL and confirm the feature works
- COO reviews code quality, Steve has final say

### Context Budget for Agent Spawning

| Agent Type | Model | max_turns | Background? |
|------------|-------|-----------|-------------|
| Scouts/exploration | haiku | 5 | YES |
| Code editing | sonnet | 10 | no |
| Build/test | sonnet | 10 | no |
| Visual grading | haiku | 3 | yes |

**Critical**: Scouts reading large data MUST use `run_in_background: true`. Max 4 spawns per session segment. Write handoff doc before hitting limit.
