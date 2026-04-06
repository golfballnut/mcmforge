# Waze + Strava UX Reference for DirtSync

**Purpose:** Structured reference for the App Designer agent. Every section maps a
proven pattern from Waze or Strava to the DirtSync off-road context.

**Last updated:** 2026-04-06

---

## 1. Navigation HUD (Active Turn-by-Turn)

### 1.1 Layout Zones

```
+------------------------------------------+
|  [TURN CARD — full width]                |  ← TOP (safe area inset + ~80pt)
|  ↰ Turn left on Main St          0.3 mi |
+------------------------------------------+
|                                          |
|                                          |
|            MAP (fills middle)            |  ← CENTER (all remaining space)
|              route line                  |
|          user arrow centered             |
|                                          |
+------------------------------------------+
|  SPEED    |    ETA BAR    |   REPORT     |  ← BOTTOM (~60-80pt)
|  [42 mph] | 12 min · 4.2mi| [▲ orange]  |
+------------------------------------------+
```

### 1.2 Turn Card (Top)

| Property | Waze Pattern | DirtSync Adaptation |
|----------|-------------|---------------------|
| Position | Pinned to top, full width | Same |
| Height | ~80pt (expands for complex turns) | Same |
| Background | Semi-transparent dark (#1A1A1A at 90% opacity) | Same |
| Turn icon | Left side, ~44pt, white arrow on colored circle | Same, add trail-fork icon variant |
| Distance to turn | Right-aligned, large bold text (~24pt) | Same |
| Street/trail name | Below turn icon, medium text (~16pt), truncated | Trail name instead of street |
| Next-after-next | Small secondary line below main instruction | Show next fork/intersection |
| Font weight | Distance = Bold 700, name = Regular 400 | Same |
| Text color | Primary white #FFFFFF, secondary #B0B0B0 | Same |

**Waze behavior:** Turn card compresses when far from turn (shows just icon + distance).
Expands with street name when within ~500m. Becomes urgent (larger arrow, voice prompt)
within ~100m.

### 1.3 Speed Display (Bottom-Left)

| Property | Waze Pattern | DirtSync Adaptation |
|----------|-------------|---------------------|
| Position | Bottom-left corner, circular badge | Same |
| Size | ~56pt diameter circle | Same |
| Font | Bold, ~28pt for speed number | Same |
| Unit label | Small "mph" below number, ~10pt | Same |
| Background | Dark semi-transparent circle | Same |

**Color states (critical for glanceability):**

| State | Waze Color | Meaning | DirtSync Use |
|-------|-----------|---------|-------------|
| Normal | White text on dark bg | Under speed limit | Under 15 mph (trail cruising) |
| Warning | Yellow text #FFD600 | Near speed limit | 15-25 mph (moderate) |
| Speeding | Red background #FF3B30 | Over speed limit | Over 25 mph (fast for trails) |
| Stopped | Dimmed/gray #888888 | 0 mph | Stopped |

**Speed limit indicator:** Small rounded rect below speed circle showing posted limit.
DirtSync equivalent: show trail-recommended speed or difficulty rating.

### 1.4 ETA / Progress Bar (Bottom-Center)

| Property | Waze Pattern |
|----------|-------------|
| Position | Bottom center, between speed and report button |
| Shows | ETA time (bold, ~20pt) + distance remaining (~14pt) |
| Tap action | Expands to show route overview, share ETA, add stop |
| Background | Dark pill-shaped container |
| Text | White primary, gray secondary |
| Update frequency | Every 30 seconds or on route deviation |

**DirtSync adaptation:** Replace ETA with:
- Estimated ride time remaining
- Distance remaining on trail
- Elevation remaining (up/down arrows)

### 1.5 What Disappears While Driving

Waze hides these during active navigation to maximize map space:
- Search bar (gone entirely)
- Bottom tab bar (replaced by minimal speed/ETA/report)
- Menu button (hidden, accessible via swipe or tap map edge)
- Waze mood/avatar (minimized to small dot)
- Other Wazers on map (can be toggled off)

**Rule:** During active navigation, only THREE persistent elements:
1. Turn card (top)
2. Speed + ETA (bottom)
3. Report button (bottom-right)

Everything else is the map.

---

## 2. Search and Route Selection

### 2.1 Search Flow

```
IDLE MAP → Tap "Where to?" bar → SEARCH SCREEN → Type/Select → ROUTE PREVIEW → Tap "Go" → NAVIGATION
```

**Search bar (idle state):**
- Position: Bottom of screen, ~48pt tall pill shape
- Text: "Where to?" in gray placeholder
- Background: White card with subtle shadow
- Left icon: Magnifying glass
- Right icon: Microphone (voice search)

**Search screen (active):**

| Section | Content | Position |
|---------|---------|----------|
| Search field | Text input, auto-focus keyboard | Top, full width |
| Recent searches | Last 5-8 destinations | Below search field |
| Favorites | Home, Work, Saved places (star icon) | Below recents |
| Categories | Gas, Food, Parking (icon row) | Horizontal scroll |
| Results list | Name + address + distance | Below categories |

**DirtSync adaptation:**
- "Where to?" becomes search for trails, POIs, trailheads
- Categories: Trailheads, Gas Stations, Food, Lodging, Trail Systems
- Favorites: Saved trails, home base, favorite systems
- Recent: Last 5 trails ridden

### 2.2 Route Preview

```
+------------------------------------------+
|                                          |
|         MAP (zoomed to show              |
|          full route extent)              |
|                                          |
|  -------- Route 1 (blue, thick) ----    |
|  ........ Route 2 (gray, thin) .....    |
|  ........ Route 3 (gray, thin) .....    |
|                                          |
+------------------------------------------+
| Route 1: 12 min · 4.2 mi    [GO]        |  ← ROUTE CARD
| Route 2: 15 min · 3.8 mi                |
| Route 3: 18 min · 5.1 mi                |
+------------------------------------------+
```

| Property | Waze Pattern | DirtSync Adaptation |
|----------|-------------|---------------------|
| Selected route | Bright blue (#0099FF), 6pt stroke | Bright teal (#00D4AA), 6pt |
| Alt routes | Gray (#999999), 3pt stroke | Gray, 3pt |
| Route card | Bottom sheet, shows all options | Same |
| Time display | Bold ~24pt, primary metric | Show estimated ride time |
| Distance | Regular ~16pt, secondary | Same + elevation gain |
| "Go" button | Large filled button, right side of selected route | Same, branded color |
| Default | Fastest route pre-selected, nav starts immediately | Easiest route pre-selected |
| Tap alt route | Switches selection, card updates | Same |
| Traffic indicators | Color-coded route segments (green/yellow/red) | Difficulty-coded (green/blue/black) |

**"Go" button spec:**
- Size: ~56pt tall, ~100pt wide, pill shape
- Color: Waze uses #0099FF (Azure Radiance)
- DirtSync: use brand accent (#00D4AA teal)
- Text: "GO" in white bold, ~18pt
- Position: Right side of route card, vertically centered

### 2.3 Adding Stops

Waze pattern: During route preview or active nav, tap menu > "Add a stop."
Presents same search interface. New stop inserted into route.

---

## 3. Map View (Not Navigating)

### 3.1 Idle Map Layout

```
+------------------------------------------+
|  [My Waze icon]              [Messages]  |  ← TOP BAR (~44pt)
+------------------------------------------+
|                                          |
|                                          |
|            MAP                           |
|       (user location centered)           |
|       (traffic overlay on roads)         |
|       (report icons on map)              |
|                                          |
|                                          |
|                         [REPORT ▲]       |  ← FLOATING ACTION (bottom-right)
+------------------------------------------+
| [Where to?                    🎤]        |  ← SEARCH BAR (bottom)
+------------------------------------------+
```

### 3.2 Map Behavior

| Property | Waze Pattern | DirtSync Adaptation |
|----------|-------------|---------------------|
| Default zoom | ~z14 (neighborhood level, ~1-2 mi visible) | z14 (shows trail system overview) |
| Riding zoom | ~z17-18 (street level, ~500ft visible) | z17-18 (shows trail detail) |
| User indicator | Blue arrow showing direction of travel | Same, teal arrow |
| Arrow rotation | Points in direction of heading | Same |
| Accuracy ring | Light blue circle around arrow when GPS is fuzzy | Same |
| Auto-recenter | NO auto-recenter in Waze (user pans freely) | Same — explicit re-center button |
| Re-center button | Appears when user pans away, tap to snap back | Compass icon, bottom-left |
| Tilt | 3D perspective during navigation, 2D when idle | 2D always for trail overview |

### 3.3 Map Overlays

| Overlay | Waze Version | DirtSync Version |
|---------|-------------|-----------------|
| Traffic | Color-coded roads (green/yellow/red) | Trail difficulty (green/blue/black) |
| Reports | Small icons on map (accident, hazard, police) | Condition icons (mud, water, downed tree) |
| Other users | Small Waze mood icons moving on roads | DS badge riders on trails (optional) |
| POIs | Gas, food, parking icons at relevant zoom | Trailheads, gas, food, lodging |
| Speed cameras | Red camera icon with alert zone | N/A |

---

## 4. Ride Reporting / Crowdsourcing

### 4.1 Report Button

| Property | Waze Pattern |
|----------|-------------|
| Position | Bottom-right, floating action button |
| Size | ~48pt diameter |
| Color | Orange (#FF9500) with white icon |
| Icon | Upward triangle/arrow (report pin) |
| Visibility | Always visible during navigation |
| Tap action | Opens report type picker |

### 4.2 Report Type Picker

Opens as a bottom sheet with large tap targets:

```
+------------------------------------------+
|          What's ahead?                   |
|                                          |
| [🚔 Police]  [💥 Accident]  [⚠️ Hazard] |
|                                          |
| [🚧 Closure] [🏗 Construction] [📷 Camera]|
|                                          |
| [Cancel]                                 |
+------------------------------------------+
```

| Property | Spec |
|----------|------|
| Icons | ~44pt, circular background |
| Labels | ~12pt below each icon |
| Grid | 3 columns |
| Tap target | Entire icon+label area, minimum 60x60pt |
| Dismiss | Tap outside or Cancel |
| Confirmation | 1-tap to report, NO confirmation dialog |

### 4.3 DirtSync Report Types

Adapting Waze's categories to off-road:

| Waze Category | DirtSync Equivalent | Icon |
|--------------|--------------------|----|
| Police | Ranger/Check station | Badge icon |
| Accident | Stuck vehicle | Warning triangle |
| Hazard (road) | Trail hazard (rocks, ruts, washout) | Exclamation |
| Hazard (weather) | Water crossing / mud | Water droplet |
| Road closed | Trail closed | X-circle |
| Construction | Trail maintenance | Wrench |
| N/A (new) | Downed tree | Tree icon |
| N/A (new) | Great conditions | Thumbs up |

### 4.4 How Reports Appear on Map

| Property | Waze Pattern | DirtSync |
|----------|-------------|---------|
| Icon size | ~24pt on map | Same |
| Freshness | New reports = full opacity, old = faded | Same (fade after 24h) |
| Tap to view | Shows detail card with reporter + time + thumbs up/down | Same |
| Community validation | Other users tap "still there" or "not there" | Same pattern |
| Auto-expire | Reports expire after ~2 hours if not validated | Expire after 48h (trails change slower) |
| Alert zone | ~200m before report, audio chime + banner | ~100m before, audio chime |
| Alert banner | Top of screen, yellow background, brief text | Same |

### 4.5 Passive Crowdsourcing (Waze's Genius)

Waze collects data WITHOUT user action:
- Speed data from all drivers (creates traffic layer)
- Route deviations suggest road changes
- Stop patterns suggest new traffic lights

**DirtSync equivalent (riding IS the data):**
- GPS traces from all riders improve trail accuracy
- Speed data creates trail difficulty profiles
- Deviation patterns suggest new trail connections
- Stop patterns suggest rest areas / viewpoints

---

## 5. Design Principles

### 5.1 Glanceability (Critical at Speed)

| Principle | Waze Implementation | Measurement |
|-----------|-------------------|-------------|
| Primary info size | Speed, next turn direction | Minimum 28pt font, 44pt icons |
| Secondary info size | Street name, distance | 14-16pt font |
| Contrast ratio | White on dark bg during nav | Minimum 7:1 (WCAG AAA) |
| Reading time | Any glanceable element | Under 0.5 seconds to comprehend |
| Tap target | All buttons during driving | Minimum 44x44pt (Apple HIG), prefer 60x60pt |
| Color meaning | Instant comprehension | No more than 4 semantic colors |

### 5.2 Minimal Chrome During Navigation

```
BEFORE navigation:  Search bar + bottom tabs + menu + avatar + mood = 5+ chrome elements
DURING navigation:  Turn card + speed + ETA + report button = 4 chrome elements
```

**Map real estate rule:** During active navigation, UI chrome occupies no more than
25% of screen height. 75%+ is map.

### 5.3 One-Tap Actions

Every action during driving must complete in ONE tap:
- Report hazard: Tap report → tap type → DONE (2 taps max)
- Mute audio: Tap volume icon → DONE
- View route overview: Tap ETA bar → DONE
- Re-center map: Tap compass → DONE

**Anti-pattern:** NEVER show a confirmation dialog during navigation.
NEVER require text input during navigation.

### 5.4 Semantic Color System

| Color | Hex | Meaning | Use |
|-------|-----|---------|-----|
| Green | #34C759 | Safe / Go / Easy | Easy trails, normal speed, good conditions |
| Blue | #0099FF | Primary / Selected / Intermediate | Selected route, current location, moderate trails |
| Yellow | #FFD600 | Caution / Warning | Near speed threshold, moderate hazard |
| Orange | #FF9500 | Alert / Report / Action | Report button, approaching hazard |
| Red | #FF3B30 | Danger / Stop / Expert | Speeding, trail closure, expert trails |
| Black | #1C1C1E | Expert trails | Diamond difficulty |
| White | #FFFFFF | Primary text | All primary labels during nav |
| Gray | #8E8E93 | Secondary / Disabled | Alt routes, secondary labels |

### 5.5 Dark Mode (Default for Navigation)

Waze uses dark mode by default during navigation (most Waze usage is driving,
often at night or in glare conditions).

| Element | Light Mode | Dark Mode (Nav Default) |
|---------|-----------|----------------------|
| Map background | Light gray/cream #F9F6ED | Near-black #1C1C1E |
| Roads/trails | Dark gray/black | White/light gray |
| Route line | Blue #0099FF | Blue #0099FF (same) |
| Turn card bg | White | Dark #2C2C2E at 95% opacity |
| Text | Dark #1C1C1E | White #FFFFFF |
| Speed badge bg | White | Dark #2C2C2E |

**DirtSync default:** Always dark mode during navigation (trails are in forests,
screen glare is the enemy). Light mode only for planning/browsing screens.

---

## 6. Strava Ride Recording UX

### 6.1 Active Ride Screen

```
+------------------------------------------+
|  [< Back]        Riding       [Segments] |  ← TOP BAR
+------------------------------------------+
|                                          |
|            MAP                           |
|     (trail trace drawing in real-time)   |
|     (user dot + heading arrow)           |
|                                          |
+------------------------------------------+
|                                          |
|     ⏱ 01:23:45          🚴 12.4 mi      |  ← STATS PANEL
|     ↗ 1,240 ft          ⚡ 8.2 mph       |
|                                          |
+------------------------------------------+
|          [ ⏸ PAUSE ]                     |  ← CONTROL BAR
+------------------------------------------+
```

### 6.2 Stats Panel (During Recording)

| Metric | Position | Font Size | Update Rate |
|--------|----------|-----------|-------------|
| Elapsed time | Top-left of stats | ~32pt mono bold | Every second |
| Distance | Top-right of stats | ~32pt mono bold | Every GPS update (~1s) |
| Elevation gain | Bottom-left of stats | ~24pt | Every 5s |
| Current speed | Bottom-right of stats | ~24pt | Every GPS update |
| Average speed | Hidden (swipe to alt screen) | ~24pt | N/A |
| Max speed | Hidden (swipe to alt screen) | ~24pt | N/A |

**Layout:** 2x2 grid of stats below map. Map takes ~50% of screen, stats ~35%,
controls ~15%.

**Key interaction:** Tap stats panel to expand (map shrinks). Tap map to expand
(stats shrink). Single screen, no tab switching (2025 redesign).

### 6.3 Pause / Stop Flow

```
RIDING → Tap Pause → PAUSED (timer stops, stats frozen)
PAUSED → Tap Resume → RIDING
PAUSED → Slide to Stop → SAVE SCREEN
```

| Control | Spec |
|---------|------|
| Pause button | Large ~64pt, centered, red circle with pause icon |
| Resume button | Green circle with play icon, same size |
| Stop action | Slide-to-stop (prevents accidental tap), or long-press |
| Lock screen | Activity continues recording in background |

### 6.4 Ride Complete / Summary Screen

```
+------------------------------------------+
|  Great Ride!                    [Save]   |
+------------------------------------------+
|  [MAP — full route trace]                |
|  (color-coded by speed or elevation)     |
+------------------------------------------+
|  Distance        Elapsed Time            |
|  12.4 mi         01:23:45               |
|                                          |
|  Elevation Gain   Avg Speed              |
|  1,240 ft         8.2 mph               |
|                                          |
|  Max Speed        Moving Time            |
|  24.1 mph         01:18:22              |
+------------------------------------------+
|  [ELEVATION PROFILE CHART]               |
|  ~~~~/\~~~~~/\~~/\~~~~                   |
+------------------------------------------+
|  Splits (if enabled)                     |
|  Mile 1: 6:42  ████████                 |
|  Mile 2: 7:15  ██████████              |
|  Mile 3: 5:58  ██████                   |
+------------------------------------------+
```

**Summary card hierarchy:**
1. Map with route trace (largest element, top)
2. Primary stats in 2x2 or 2x3 grid (distance, time, elevation, speed)
3. Elevation profile chart (interactive — tap to highlight segment)
4. Splits with bar chart (darker = faster)
5. Social: "Add description," share, give kudos

### 6.5 Strava Color Reference

| Color | Hex | Use |
|-------|-----|-----|
| Primary Orange | #FC4C02 | Brand, CTAs, active elements, "Record" button |
| Dark Orange | #CC4200 | Pressed states |
| White | #FFFFFF | Backgrounds, primary text on dark |
| Near-Black | #242428 | Text on light backgrounds |
| Light Gray | #F7F7F7 | Card backgrounds |
| Medium Gray | #6D6D78 | Secondary text |
| Green | #00B843 | PR badges, positive metrics |
| Red | #E4405F | Kudos heart, segment loss |

---

## 7. DirtSync Synthesis — Recommended Patterns

### 7.1 Screen Inventory (Waze + Strava Hybrid)

| Screen | Primary Reference | Purpose |
|--------|------------------|---------|
| Idle Map | Waze idle map | Browse trails, search, see conditions |
| Search | Waze search | Find trails, POIs, trailheads |
| Route Preview | Waze route preview | Compare routes, see difficulty, tap Go |
| Active Nav HUD | Waze nav HUD | Turn-by-turn with speed + progress |
| Active Ride Stats | Strava recording | Timer, distance, speed, elevation |
| Report | Waze report | Trail conditions, hazards |
| Ride Summary | Strava summary | Post-ride stats, elevation chart, share |
| Trail Detail | AllTrails/Trailforks | Trail info, ratings, recent conditions |

### 7.2 Nav HUD + Ride Recording (Combined)

DirtSync is unique: navigation AND ride recording happen simultaneously.
Waze does not record rides. Strava does not navigate. DirtSync does both.

**Solution: Layered HUD**

```
+------------------------------------------+
|  [TURN CARD — Waze pattern]              |  ← Always visible during nav
+------------------------------------------+
|                                          |
|            MAP                           |
|                                          |
+------------------------------------------+
|  SPEED  |  ⏱ 01:23  |  🚴 4.2mi  | [▲] |  ← COMBINED BOTTOM BAR
|  [12]   |  ride time | ride dist  |report|
+------------------------------------------+
```

The bottom bar merges Waze's speed/ETA with Strava's recording stats:
- Left: Speed (Waze pattern, color-coded)
- Center-left: Ride elapsed time (Strava pattern)
- Center-right: Ride distance (Strava pattern)
- Right: Report button (Waze pattern, orange)

Swipe up on bottom bar to expand into full Strava-style stats panel.

### 7.3 Color System for DirtSync

| Semantic | Hex | Trail Use | Nav Use |
|----------|-----|-----------|---------|
| Easy/Safe | #34C759 (Green) | Green circle trails | Normal speed |
| Moderate | #0099FF (Blue) | Blue square trails | Selected route |
| Difficult | #000000 (Black) | Black diamond trails | N/A |
| Caution | #FFD600 (Yellow) | Condition warning | Near speed threshold |
| Danger | #FF3B30 (Red) | Trail closed/hazard | Speeding, stop |
| Action | #FF9500 (Orange) | Report button | Alert approaching |
| Brand | #00D4AA (Teal) | DirtSync accent | Selected elements |
| Text Primary | #FFFFFF | — | During nav (dark mode) |
| Text Secondary | #8E8E93 | — | Secondary labels |
| Surface | #1C1C1E | — | Nav dark mode background |

### 7.4 Typography Scale

Based on Waze's proven hierarchy for glanceability at speed:

| Level | Size | Weight | Use |
|-------|------|--------|-----|
| Hero | 32-36pt | Bold 700 | Speed number, primary stat |
| Title | 24-28pt | Bold 700 | Turn distance, turn direction |
| Body | 16-18pt | Medium 500 | Trail name, street name, secondary stats |
| Caption | 12-14pt | Regular 400 | Units (mph), timestamps, labels |
| Micro | 10pt | Regular 400 | "mph" under speed, fine print |

**Font:** SF Pro (iOS system font) — guaranteed legibility, variable weight support,
tabular figures for stats.

### 7.5 Key Interaction Patterns

| Action | Pattern | Source |
|--------|---------|--------|
| Start navigation | Tap trail/POI → Route Preview → "Go" | Waze |
| Report condition | Tap orange FAB → Tap category → Done | Waze |
| View ride stats | Swipe up bottom bar | Strava |
| Pause ride | Tap pause (large target, centered) | Strava |
| End ride | Slide-to-stop (prevents accidental end) | Strava |
| Re-center map | Tap compass button (appears after pan) | Waze |
| Search | Tap "Where to?" bar at bottom | Waze |
| Alt routes | Tap gray route line on preview | Waze |
| Share ride | Post-ride summary → Share button | Strava |

---

## Sources

Research compiled from:
- [Waze Brand Identity by Pentagram](https://www.pentagram.com/work/waze)
- [Waze UX Redesign Case Study (Medium)](https://medium.com/@shreynotawkward/waze-redesign-ui-ux-c52f083938cc)
- [Waze Design Review (DesignRush)](https://www.designrush.com/best-designs/apps/waze)
- [Waze Complete Navigation Guide (Routerra)](https://routerra.io/blog/how-to-use-waze-navigation)
- [Waze Brand Colors (ColorsWall)](https://colorswall.com/palette/155189)
- [Waze 2026 Interface Redesign (WebProNews)](https://www.webpronews.com/waze-finally-kills-its-polarizing-map-interface-and-drivers-everywhere-are-breathing-a-sigh-of-relief/)
- [Strava Redesigned Record Experience (Press)](https://press.strava.com/articles/strava-launches-redesigned-record-experience)
- [Strava Activity Page Guide](https://stories.strava.com/articles/strava-guide-your-activity-page-101)
- [Strava Brand Colors (SchemeColor)](https://www.schemecolor.com/strava.php)
- [Strava Brand Colors (BrandColors)](https://brandcolors.net/b/strava)
- [Waze Community Reports (autoevolution)](https://www.autoevolution.com/news/5-things-you-must-know-about-waze-traffic-reports-216869.html)
- [Waze Voice Reporting (FindArticles)](https://www.findarticles.com/waze-launches-voice-reporting-to-make-incident-alerts-easier/)
- [Waze CarPlay 2025 Update (TheCarPlayer)](https://thecarplayer.com/blogs/news/waze-carplay-update-2025)
