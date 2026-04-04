# Tonight's Battle Plan — Burning Rock Ship Night (2026-03-30)

**Riders are waiting at Burning Rock. Ship tonight.**

## The Flywheel

```
COO writes skill → Agent plans from skill → COO rejects until 10/10 plan →
Engineer executes plan → COO reviews output → If perfect →
Agent plans Paperclip hire → COO rejects until 10/10 → PC agent goes live →
PC agent gets issue → Ships it → COO checks → Repeat
```

**Rule: No plan ships under 10/10. Fix the skill, not the plan.**

---

## STATUS (as of session 61 end)

### What's Done
- [x] 42 Burning Rock POIs in Supabase `trail_waypoints`
- [x] POI coordinates geocoded via Google API (all 42 updated, avg 1.9mi correction)
- [x] `trail_waypoints_category_check` constraint expanded (11 new categories)
- [x] 6 feature pipeline agents terminated
- [x] POI research skill upgraded (A+ manual, A- agent)
- [x] Burning Rock trails: 68 named, 101.9mi, 124 intersections, 715 routing segments

### What's NOT Done (Tonight's Work)

---

## PHASE 1: Fix Web App POI Display
**Goal:** POIs show correct icons + category labels on dirtsync.app

- [x] **Skill: poi-category-mapper** — Add 11 new categories to `TrailMap.tsx` POI_CATEGORIES map
  - File: `/Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/web/src/app/map/_components/TrailMap.tsx` lines 13-39
  - Added 13 categories (11 planned + `fuel`/`restaurant` aliases for actual DB values)
  - Each has: color (hex), label (string), letter abbreviation for circle icon
  - Emergency + tow_service added to priority zoom filter (rider safety)
- [x] COO writes skill
- [x] Agent plans → COO rejects until 10/10
- [x] Engineer ships → branch `fix/poi-category-colors` pushed
- [ ] Verify all 42 POIs display at correct locations with correct icons

**Estimated: 15 min**

---

## PHASE 2: Build Burning Rock Tiles
**Goal:** Valhalla routing tiles for iOS app

- [ ] **Skill: tile-builder** — Run the tile build pipeline
  - Script: `/Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/scripts/build-system-tiles.sh --system "Burning Rock"`
  - Prereqs: Docker running, python3, osmium-tool, WV road PBF
  - Output: `valhalla_tiles.tar` → iOS Resources
  - 11-step pipeline: Supabase export → GeoJSON → OSM XML → PBF → merge WV roads → Valhalla tiles → tar → copy to iOS
- [x] Verify Docker is running
- [x] Run tile build (~15-30 min) — completed successfully
- [x] Verify tile hierarchy (levels 0, 1, 2) — 3 L0 + 15 L1 + 153 L2 = 171 tiles, 123MB
- [x] Confirm `valhalla_tiles.tar` copied to iOS Resources (109MB)

**Estimated: 30 min (mostly waiting)**

---

## PHASE 3: Build & Prove Micro-Skills
**Goal:** 3 proven micro-skills, each 10/10

### Skill 1: POI Geocoder
- [x] COO writes `poi-geocoder` skill → `vault/agents/skills/poi-geocoder.md`
  - Input: POI name + street address
  - Output: precise lat/lng via Google Geocoding API
  - Key insight: separation of concerns — discovery finds addresses, geocoder pins them
  - Acceptance: coordinates within 0.01mi of actual business location
- [ ] Agent plans from skill → reject until 10/10
- [ ] Engineer tests on 10 Burning Rock POIs → COO compares to Google Maps
- [ ] Engineer tests on 10 Rockhouse POIs → COO compares
- [ ] If both pass → skill is gold

### Skill 2: POI Discovery v2 (upgrade existing)
- [x] COO writes `poi-discovery-v2` skill → `vault/agents/skills/poi-discovery-v2.md`
  - Input: trail system name + center coords + nearby towns
  - Output: business name, street address, category, phone, hours (NO coordinates)
  - Key change: outputs ADDRESSES only. Geocoder produces COORDS separately.
  - DB category values: `fuel` (not gas), `restaurant` (not food) — matches actual Supabase data
  - Acceptance: ≥40 POIs, all 17 categories searched, 6+ restaurants, Sophia clinic found
- [ ] Agent plans → reject until 10/10
- [ ] Engineer tests on Burning Rock → COO compares to ground truth (52 POIs)
- [ ] Engineer tests on Rockhouse → COO compares to ground truth (23 POIs)

### Skill 3: GPX Route Creator
- [x] COO writes `gpx-route-creator` skill → `vault/agents/skills/gpx-route-creator.md`
  - Input: trail system name + route type (trail-only OR poi-stop)
  - Output: .gpx file with waypoints at 15 MPH simulation speed
  - Builds from trail_lines + trail_intersections geometry in Supabase
  - Two types: trail-only (chain connected trails) and poi-stop (trail → POI detour → trail)
  - Acceptance: GPX loads in simulator, route follows actual trails, 5mi ± 1mi length
- [x] Agent plans → script `scripts/generate_gpx_routes.py` created and tested
- [x] Engineer generates 5 trail-only routes (5.8-8.3mi each, all unique)
- [x] Engineer generates 2 POI-stop routes (fuel: Go Mart, restaurant: China One)
- [ ] COO verifies routes in simulator

**Estimated: 45 min for all 3 skills**

---

## PHASE 4: Generate Test Routes
**Goal:** 7 GPX test routes for Burning Rock

### 5 Trail-Only Routes
- [x] Route 1: 8.3mi, starts at Trail #07/L/M junction — `burning-rock-trail-only-1.gpx`
- [x] Route 2: 6.7mi, starts at Tams area — `burning-rock-trail-only-2.gpx`
- [x] Route 3: 6.1mi, starts at 6-way junction — `burning-rock-trail-only-3.gpx`
- [x] Route 4: 5.8mi, starts central — `burning-rock-trail-only-4.gpx`
- [x] Route 5: 6.5mi, starts east side — `burning-rock-trail-only-5.gpx`

### 2 POI-Stop Routes
- [x] Route 6: 4.5mi trail + 2.7mi detour to Go Mart Sophia (fuel) — `burning-rock-poi-fuel-6.gpx`
- [x] Route 7: 0.7mi trail + 2.8mi detour to China One (restaurant) — `burning-rock-poi-restaurant-7.gpx`

GPX files in: `/Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/DirtSync/DirtSyncUITests/GPXRoutes/`
Generated by: `scripts/generate_gpx_routes.py`

**Estimated: 30 min**

---

## PHASE 5: Simulator Testing
**Goal:** All 7 routes work on 5 simulators

### Prerequisites
- [ ] Tiles built and in iOS Resources
- [ ] App built: `cd DirtSync/DirtSync && xcodebuild -scheme DirtSync -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' build`
- [ ] Boot 5 simulators

### Run Tests
| Sim | Route | Testing |
|-----|-------|---------|
| - [ ] iPhone 16 | Route 1 (easy loop) | Basic nav, HUD, voice |
| - [ ] iPhone 16 Pro | Route 3 (intersections) | Turn-by-turn at junctions |
| - [ ] iPhone 16 Pro Max | Route 5 (mixed difficulty) | Difficulty transitions |
| - [ ] iPhone 15 | Route 6 (POI: gas + food) | Add-a-Stop full flow |
| - [ ] iPhone 15 Pro | Route 7 (POI: low fuel) | POI search + hybrid routing |

### Play Routes
```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync
./scripts/play_test_track.sh burning-rock-easy       # Sim 1
./scripts/play_test_track.sh burning-rock-intersect   # Sim 2
./scripts/play_test_track.sh burning-rock-mixed       # Sim 3
./scripts/play_test_track.sh burning-rock-poi-gas     # Sim 4
./scripts/play_test_track.sh burning-rock-poi-food    # Sim 5
```

### Screen Record
- [ ] Record Route 6 or 7 (POI flow) — this is the marketing video

**Launch args:** `--uitesting --uitesting-navigate` (both needed)
**Test creds:** test@dirtsync.app / TestPass123!

**Estimated: 60 min**

---

## PHASE 6: Hire Paperclip Agents
**Goal:** 3 new Paperclip agents, each 10/10

For each agent:
1. Agent creates Paperclip hire plan from proven skill
2. COO rejects until 10/10 plan
3. Agent executes hire (via Paperclip API at localhost:3100)
4. COO assigns test issue
5. PC agent solves it
6. COO compares to ground truth

### Agent Hires
- [ ] **POI Geocoder Agent** — runs poi-geocoder skill on trail systems
- [ ] **POI Discovery Agent v2** — runs poi-discovery skill (addresses only, no coords)
- [ ] **GPX Route Builder Agent** — generates test routes for any system

### Existing Agents (keep)
- Intersection Detective (trusted) — idle
- Road Junction Engineer (trusted) — paused
- Local POI Scout — being replaced by Discovery v2 + Geocoder

### Test on 2 Systems
- [ ] Run full pipeline on Burning Rock → compare to ground truth
- [ ] Run full pipeline on Rockhouse → compare to ground truth
- [ ] Both 10/10 → agents are trusted

**Estimated: 30 min**

---

## KEY REFERENCES

### API Keys
- Google Geocoding: `GOOGLE_PLACES_API_KEY` in `DirtSync/web/.env.local`
- Google OAuth: `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` in dispatcher .env

### Paperclip
- Server: localhost:3100
- DirtSync company: `b724f8bb-9567-47a1-8ec6-fd8e23c70093`
- Fleet: 5 agents (2 trusted, 3 validating)

### DirtSync
- Repo: `/Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync`
- Supabase: `lldipxvwocpqncixlnxj`
- Web: dirtsync.app
- Tile build: `scripts/build-system-tiles.sh`
- GPX play: `scripts/play_test_track.sh`
- GPX generator: `scripts/generate_burning_rock_gpx.py`

### Ground Truth
- Burning Rock POIs: 52 (manual A+ run, saved at `/tmp/burning-rock-ground-truth-a-plus.csv`)
- Rockhouse POIs: 23 (saved at `/tmp/rockhouse-ground-truth.csv`)
- Google Sheet: `1cZLbmPhK31jOC5FgNgrzZK9zepzKWiyaN4Lq747mCbM`

### Web App POI Fix
- File: `DirtSync/web/src/app/map/_components/TrailMap.tsx`
- Lines 13-26: POI_CATEGORIES map
- Lines 395-422: poi-circles symbol layer

### Simulator
- Launch args: `--uitesting --uitesting-navigate`
- POI test: `--uitesting-poi-offtrail`
- Test creds: test@dirtsync.app / TestPass123!
- 5 simulators connected to Xcode

---

## TOTAL ESTIMATED TIME: ~3.5 hours

| Phase | Time | Parallel? |
|-------|------|-----------|
| 1. Web POI fix | 15 min | Yes — with Phase 2 |
| 2. Tile build | 30 min | Yes — with Phase 1 |
| 3. Micro-skills | 45 min | After Phase 1 |
| 4. GPX routes | 30 min | After Phase 3 |
| 5. Simulator test | 60 min | After Phase 2+4 |
| 6. PC agents | 30 min | After Phase 5 |
