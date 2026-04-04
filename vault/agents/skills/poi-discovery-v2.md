---
name: poi-discovery-v2
description: >
  Discover POIs near a trail system — names and addresses only, NO coordinates.
  Separation of concerns: discovery finds businesses, geocoder pins them.
  Triggers on: discover POIs, find businesses near trails, POI research,
  what's near the trails, find restaurants gas lodging near trails.
argument-hint: "[trail-system-name]"
allowed-tools: Read, Bash, WebSearch, WebFetch, mcp__supabase__execute_sql
context: fork
model: sonnet
---

## Goal

Find all businesses and points of interest near a DirtSync trail system. Output a structured list of business name, street address, category, phone, and hours. Do NOT attempt to get coordinates — the poi-geocoder skill handles that separately. This separation prevents the #1 failure mode: city-centroid coordinates that land 1-2mi off.

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. ≥40 POIs found (for systems near towns >2,000 pop)
2. All 17 categories searched (see category list below)
3. ≥6 restaurants/food entries (search pizza, BBQ, diner, fast food, breakfast separately)
4. ≥1 emergency/medical entry (clinic in nearest town, NOT just distant hospital)
5. Every POI has a real street address (NOT "Sophia, WV" — need house number + street)
6. Results written to Supabase `trail_waypoints` with category and description containing address
7. Self-audit checklist completed — zero categories skipped

## Pre-Made Decisions
**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Coordinate source | DO NOT geocode. Leave lat/lng as trail system center. Geocoder skill fixes later. |
| Target table | `trail_waypoints` in DirtSync Supabase (`lldipxvwocpqncixlnxj`) |
| Radius cap | 10 miles from trail system center — hard limit |
| Category column | Use exact values: `fuel`, `restaurant`, `lodging`, `camping`, `gear_shop`, `emergency`, `grocery`, `liquor`, `tow_service`, `auto_parts`, `laundromat`, `car_wash`, `pharmacy`, `atm`, `attraction`, `trailhead`, `parking` |
| Naming | Actual business name. NOT listing descriptions like "Cozy 2BR cabin with WiFi" |
| Dedup | Check existing POIs in table before inserting — match on name + trail_system |

## Trail System Lookup

| System | Lat | Lon | Nearby Towns |
|--------|-----|-----|--------------|
| Burning Rock | 37.73 | -81.35 | Sophia, Beckley, Ghent |
| Rockhouse | 37.56 | -81.77 | Gilbert, Mingo County |
| (See poi-research.md for full table of 18 systems) |

## Gotchas

| Issue | Solution |
|-------|----------|
| Agent returns coordinates anyway | REJECT. Coordinates from web search are city-level garbage. Only geocoder produces coords. |
| "No results" for rural category | Note "None within 10mi" in report. Don't fabricate. But DID you search each nearby town separately? |
| Missing restaurants | You MUST search each food type separately per town: pizza, BBQ, fast food, diner, breakfast. One "restaurants near X" search misses 60% |
| Airbnb/VRBO listings | Only named properties ("Pine Haven Cabins"). Skip "Cozy 2BR" anonymous listings. |
| Chain stores with duplicates | Add location suffix: "Dollar General Sophia E Main St" |
| Sophia clinic gets skipped | The closest medical is often a rural clinic 3mi away, NOT Raleigh General 8mi away. Search "clinic {nearest town}" FIRST. |

## Category Search Checklist

Search each separately — one "things nearby" search misses most categories:

1. Trailhead/parking — check trail system website first
2. Gas/fuel — `"gas station {town} {state}"`
3. Restaurant/food — search 5+ subtypes per town (pizza, BBQ, diner, fast food, breakfast)
4. Hotel/motel — `"{town} hotels motels"`
5. Cabins/rentals — `"cabin rental near {system}"`
6. Campground/RV — `"campground {town}"`
7. Gear/ATV shop — `"ATV dealer {town}"` AND `"powersports {town}"`
8. Emergency — `"clinic {nearest town}"` FIRST, then `"hospital near {town}"`
9. Grocery — `"grocery {town}"` and `"Dollar General {town}"`
10. Liquor — `"liquor store {town}"`
11. Tow service — `"tow service {town}"`
12. Auto parts — `"auto parts {town}"`
13. Laundromat — `"laundromat {town}"`
14. Car wash — `"car wash {town}"`
15. Pharmacy — `"pharmacy {town}"`
16. ATM/bank — `"ATM {town}"`
17. Attraction — `"things to do near {system}"` and `"attractions {county}"`

## Output

```markdown
# POI Discovery Complete: {SYSTEM}

## Results
- **POIs found:** {total}
- **By category:** fuel ({n}), restaurant ({n}), lodging ({n}), ...
- **Rows inserted:** {n} new, {n} already existed (skipped)

## Category Audit
✅ fuel: {n}  ✅ restaurant: {n}  ✅ lodging: {n}  ...
❌ {category}: 0 — searched, none within 10mi

## Sample (first 5)
| Name | Address | Category |
|------|---------|----------|
| Marathon Sophia | 123 Main St, Sophia WV | fuel |
| ... | ... | ... |
```
