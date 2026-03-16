# Skill: POI Research

## Purpose

Research all points of interest (POIs) within a configurable radius of a DirtSync trail system. Collect business details (name, address, coordinates, phone, hours, ratings, ATV-friendliness) and write structured results to a Google Sheet tab via the workspace-mcp CLI.

This skill runs once per trail system. DirtSync has 17 systems — each gets its own Google Sheet tab in a shared spreadsheet.

## When to Use

- When onboarding a new trail system and need POI data
- When refreshing stale POI data (quarterly recommended)
- Before a trail system launch (marketing/rider prep)
- When Steve asks "what's near [trail system]?"

## Pre-Task Context Loading

1. Load [[companies/dirtsync.md]] for DB schema + API reference
2. Use the trail system lookup table below (or coordinates from task description)
3. Check existing Google Sheet tabs for previously-researched data (dedup)

## Required Capabilities

- **Web search** — find businesses near GPS coordinates
- **Web fetch** — get business details (phone, hours, ratings, coordinates)
- **Bash** — run `workspace-mcp` CLI to write Google Sheets
- **Analysis** — dedup, Haversine distance calc, coordinate verification

## Input Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| TRAIL_SYSTEM_NAME | Yes | — | e.g., "Burning Rock" |
| CENTER_LAT | No | Lookup table | Center latitude of the trail system |
| CENTER_LON | No | Lookup table | Center longitude of the trail system |
| RADIUS_MILES | No | 10 | Search radius in miles |
| GOOGLE_SHEET_ID | Yes | — | Spreadsheet ID to write to |
| DRIVE_FOLDER_ID | No | 18qQk2kQRHEb45ze_oxMNU_fzr_aiiLDh | DirtSync/POI Data/ folder |

## Trail System Lookup Table

Use these coordinates if CENTER_LAT/CENTER_LON are not provided. Nearby towns improve web search accuracy for rural areas.

| System | Lat | Lon | State | Nearby Towns |
|--------|-----|-----|-------|--------------|
| Bearwallow | 38.10 | -80.83 | WV | Summersville, Richwood, Canvas |
| Bergoo | 38.37 | -80.53 | WV | Webster Springs, Bergoo |
| Big Coal | 37.96 | -81.47 | WV | Whitesville, Boone County |
| Braveheart | 37.83 | -81.93 | WV | Fort Gay, Wayne County |
| Buffalo Mountain | 37.68 | -81.67 | WV | Accoville, Man, Logan |
| Burning Rock | 37.73 | -81.35 | WV | Sophia, Beckley, Ghent |
| Cabwaylingo | 38.24 | -82.30 | WV | Dunlow, Wayne County |
| Devil Anse | 37.72 | -81.85 | WV | Gilbert, Mingo County |
| East Lynn | 38.17 | -82.37 | WV | East Lynn, Wayne County |
| Hillbilly/Tornado | 37.86 | -81.67 | WV | Chapmanville, Logan County |
| Indian Ridge | 37.61 | -81.70 | WV | Pineville, Wyoming County |
| Ivy Branch | 37.97 | -81.15 | WV | Lookout, Fayette County |
| Pinnacle Creek | 37.59 | -81.60 | WV | Pineville, Mullens |
| Pocahontas | 37.42 | -81.50 | WV | Bramwell, Bluefield |
| Rockhouse | 37.56 | -81.77 | WV | Gilbert, Mingo County |
| Warrior | 38.27 | -81.33 | WV | Belle, Boone County |
| Spearhead Trails | 37.01 | -82.13 | VA | Grundy, Haysi, Breaks |
| Breaks Mountain | 37.29 | -82.29 | VA/KY | Breaks, Elkhorn City |

**Note:** These are approximate center coordinates. The seed script queries real coordinates from the DirtSync Supabase `trail_lines` table at task creation time and embeds them in the task description.

## POI Types to Search (Priority Order)

Search in this order. If running long on time, ensure types 1-4 are complete before moving on.

1. **Gas stations / fuel stops** — most critical for riders; include fuel type if known
2. **Restaurants / food** — fast food, sit-down, convenience stores with food
3. **Lodging — hotels & motels** — chain and independent hotels/motels
4. **Lodging — cabins & vacation rentals** — Airbnb, VRBO, standalone cabin rentals, bed & breakfasts. Search Airbnb/VRBO sites directly (exact addresses hidden until booking — use approximate location)
5. **Lodging — campgrounds & RV parks** — tent sites, RV hookups, primitive camping
6. **Gear shops / ATV dealers / rental shops** — parts, rentals, service
7. **Trailheads / parking areas / staging areas** — official and well-known unofficial
8. **Emergency services** — hospitals, urgent care, police stations
9. **Grocery / convenience stores** — beyond gas station snacks; Dollar General, Family Dollar, etc.
10. **Liquor / beer stores** — package stores, beer distributors
11. **Tow / recovery services** — flatbed tow, roadside assistance, ATV recovery
12. **Auto parts stores** — O'Reilly, AutoZone, NAPA for quick fixes
13. **Laundromats** — for multi-day trips with muddy gear
14. **Car washes / pressure wash** — truck and trailer cleanup
15. **Pharmacies** — CVS, Walgreens, independent pharmacies
16. **Banks / ATMs** — some rural spots are cash-only
17. **Scenic overlooks / landmarks / attractions** — notable stops near the trails

## Data Columns

Every row in the Google Sheet must have these columns:

| Column | Required | Description |
|--------|----------|-------------|
| Trail System | Yes | Which trail system this POI is near |
| POI Name | Yes | Business or location name |
| Type | Yes | Category from the POI types list above |
| Latitude | Yes | Decimal degrees (business-level precision, NOT city-level) |
| Longitude | Yes | Decimal degrees |
| Distance (mi) | Yes | Miles from trail system center (Haversine) |
| Address | Yes | Full street address |
| Phone | If available | Phone number |
| Email | If available | Email address |
| Rating | If available | Google rating (X.X/5) |
| Hours | If available | Operating hours (e.g., "Mon-Sat 6a-9p, Sun 8a-6p") |
| ATV Friendly | Best effort | Yes / No / Unknown — does this location welcome trail riders? |
| Notes | If relevant | Large parking lot, diesel available, trailer parking, etc. |
| Source | Yes | Where data came from (Google Maps, business website, etc.) |
| Also Near | If applicable | Other trail systems within 10mi of this POI |

## Execution Steps

### Step 1: Resolve Coordinates

Use the center coordinates from the task description (these are pre-filled by the seed script from the DirtSync database).

**Fallback** (if coordinates not in description):
1. Check the lookup table above
2. Query the DirtSync API: `curl -s https://dirtsync.app/api/trail-systems`

### Step 2: Web Research (Per POI Type)

For each POI type, run multiple web searches to maximize coverage:

**Gas stations:**
- `"gas stations near {town1} {state}"` and `"gas stations near {town2} {state}"`
- `"fuel stops near {trail_system_name} trail"`
- `"{town1} gas station ATV"`

**Restaurants / food:**
- `"restaurants near {town1} {state}"`
- `"food near {trail_system_name} WV"`
- `"convenience stores {town1} {state}"`

**Lodging — hotels & motels:**
- `"{town1} {state} hotels motels"`
- `"hotels near {trail_system_name} {state}"`

**Lodging — cabins & vacation rentals:**
- `"Airbnb near {trail_system_name} {state}"` and `"VRBO near {trail_system_name} {state}"`
- `"cabin rentals near {town1} {state}"`
- `"bed and breakfast near {town1} {state}"`
- `"vacation rentals {trail_system_name} ATV"`
- Note: Airbnb/VRBO hide exact addresses. Use the listing's general area for coordinates. Mark "Airbnb" or "VRBO" as Source.

**Lodging — campgrounds & RV parks:**
- `"campgrounds RV parks near {trail_system_name}"`
- `"camping near {town1} {state}"`

**Gear / ATV:**
- `"ATV dealer rental near {town1} {state}"`
- `"{trail_system_name} ATV gear shop parts"`

**Emergency services:**
- `"hospital urgent care near {town1} {state}"`
- `"police station {town1} {state}"`

**Grocery / convenience:**
- `"grocery store {town1} {state}"` and `"Dollar General {town1} {state}"`

**Liquor / beer:**
- `"liquor store {town1} {state}"` and `"beer distributor near {town1} {state}"`

**Tow / recovery:**
- `"tow service {town1} {state}"` and `"ATV recovery near {trail_system_name}"`

**Auto parts:**
- `"auto parts store {town1} {state}"` (O'Reilly, AutoZone, NAPA)

**Laundromats:**
- `"laundromat {town1} {state}"`

**Car wash:**
- `"car wash {town1} {state}"` and `"pressure wash near {trail_system_name}"`

**Pharmacies:**
- `"pharmacy {town1} {state}"`

**Banks / ATMs:**
- `"ATM {town1} {state}"` and `"bank near {town1} {state}"`

**Scenic / attractions:**
- `"things to do near {trail_system_name} WV"`
- `"scenic overlooks {town1} {state}"`

### Step 3: Collect Details Per POI

For each discovered POI, gather:
- **Exact address** and **GPS coordinates** (business-level, NOT city centroid)
- **Phone number** and **email** if available on their listing or website
- **Google rating** (X.X out of 5)
- **Operating hours** — especially seasonal hours for rural locations
- **ATV-friendliness** — look for: trailer parking mentions, "riders welcome" signs in reviews, UTV/ATV in business name, large gravel lots visible in satellite view, proximity to trailhead

### Step 4: Calculate Distance

For each POI, compute the Haversine distance from the trail system center:

```
distance = 2 * R * arcsin(sqrt(sin((lat2-lat1)/2)^2 + cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)^2))
R = 3959 miles
```

**Filter out** any POI beyond RADIUS_MILES from the trail system center.

### Step 5: Dedup Check

Before adding a POI:
1. If this POI name + coordinates (within 0.001 degrees / ~0.07 miles) already exists in another tab, assign it to whichever trail system is **CLOSER**
2. Set the "Also Near" column on the surviving row to note the other system(s)
3. If you can't check other tabs (first system to run), just note nearby systems in "Also Near" based on the lookup table distances

### Step 6: Write to Google Sheet

**IMPORTANT:** This is an exception to the default research task instruction "Do not create files." You MUST use Bash to run workspace-mcp CLI commands to write results to the Google Sheet.

```bash
# Set required env vars (values are in dispatcher .env and Mini ~/.zshrc)
export GOOGLE_OAUTH_CLIENT_ID="$GOOGLE_OAUTH_CLIENT_ID"
export GOOGLE_OAUTH_CLIENT_SECRET="$GOOGLE_OAUTH_CLIENT_SECRET"

# Write header row (only if tab is empty)
$HOME/.local/bin/uvx workspace-mcp --single-user --cli modify_sheet_values \
  --args '{"spreadsheet_id": "SHEET_ID", "range": "TAB_NAME!A1", "values": [["Trail System","POI Name","Type","Latitude","Longitude","Distance (mi)","Address","Phone","Email","Rating","Hours","ATV Friendly","Notes","Source","Also Near"]], "user_google_email": "dirtsyncapp@gmail.com"}'

# Write data rows — batch up to 50 rows per call to avoid timeouts
$HOME/.local/bin/uvx workspace-mcp --single-user --cli modify_sheet_values \
  --args '{"spreadsheet_id": "SHEET_ID", "range": "TAB_NAME!A2", "values": [["System","Name","Type","lat","lon","dist","addr","phone","email","rating","hours","atv","notes","source","also_near"], ...more rows...], "user_google_email": "dirtsyncapp@gmail.com"}'
```

**Sort rows** by Type (alphabetical) then Distance (ascending) before writing.

### Step 7: Add Summary Row

After all data rows, append a summary row:
```
["---","TOTALS","Gas: X | Food: Y | Hotels: Z | Cabins/Rentals: A | Campgrounds: B | Gear: C | Emergency: D | Grocery: E | Liquor: F | Tow: G | Auto Parts: H | Laundry: I | Car Wash: J | Pharmacy: K | Bank/ATM: L | Scenic: M","---","---","---","---","---","---","---","---","---","---","---","---"]
```

### Step 8: Verification

1. **Pick 3 random POIs** from your results
2. **Search each** by name + address to confirm they exist and are still in business
3. **Verify coordinates** are within 1 mile of the stated address (not a city centroid)
4. **Report verification results** in your text output

## Output Format

Sort sheet rows by Type (alphabetical) then Distance (ascending).

Your text output to the dispatcher should include:

```markdown
# POI Research Complete: {TRAIL_SYSTEM_NAME}

## Results
- **POIs found:** {total}
- **By type:** Gas ({n}), Food ({n}), Hotels ({n}), Cabins/Rentals ({n}), Campgrounds ({n}), Gear ({n}), Emergency ({n}), Grocery ({n}), Liquor ({n}), Tow ({n}), Auto Parts ({n}), Laundry ({n}), Car Wash ({n}), Pharmacy ({n}), Bank/ATM ({n}), Scenic ({n})
- **Sheet tab:** "{TRAIL_SYSTEM_NAME} — POIs"
- **Spreadsheet ID:** {GOOGLE_SHEET_ID}

## Verification (3 spot checks)
1. {POI Name} — {address} — coordinates {lat},{lon} — CONFIRMED/ISSUE: {detail}
2. {POI Name} — ...
3. {POI Name} — ...

## Notes
- {Any gaps in coverage, seasonal closures, or research limitations}
```

## Time Budget

- **Cap total research at 25 minutes** per trail system
- **Priority order:** Gas > Food > Lodging (all 3 types) > Gear > Emergency > Grocery > everything else
- If running long, output partial results and note which POI types were not fully researched
- Partial data is better than a timeout with no data

## Model Recommendation

- **Best: Claude** — needs Bash for workspace-mcp CLI + WebSearch for research. Route via `cli_target: "claude"`
- **Not suitable: Gemini** — no reliable Bash access for Google Sheet writes
- **Not suitable: Codex** — no web search capability

## Related Skills

- [[agents/skills/competitive-scan.md]] — similar web research methodology
- [[agents/skills/codebase-aware.md]] — load company context first

## Related Context

- [[companies/dirtsync.md]] — DirtSync architecture, database tables, trail system list
- DirtSync Supabase: `lldipxvwocpqncixlnxj`
- DirtSync/POI Data/ Drive folder: `18qQk2kQRHEb45ze_oxMNU_fzr_aiiLDh`
