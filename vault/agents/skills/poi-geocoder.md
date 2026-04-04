---
name: poi-geocoder
description: >
  Geocode POI addresses to precise lat/lng using Google Geocoding API.
  Triggers on: geocode POIs, fix POI coordinates, update POI locations,
  get lat lng for POIs, POI coordinate correction, geocode addresses.
argument-hint: "[trail-system-name]"
allowed-tools: Read, Bash(curl), mcp__supabase__execute_sql
context: fork
model: sonnet
---

## Goal

Take POIs that have street addresses but missing or inaccurate coordinates, and geocode them to precise lat/lng using the Google Geocoding API. Update the coordinates in Supabase `trail_waypoints` table. Each POI should land within 0.01mi of its actual business location.

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. Every POI for the target system has lat/lng coordinates
2. All coordinates are business-level precise (NOT city centroids)
3. Supabase `trail_waypoints` rows updated with corrected lat/lng
4. Spot-check: 3 random POIs verified against Google Maps
5. Report shows before/after coordinates and correction distances

## Pre-Made Decisions
**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Geocoding API | Google Geocoding API (NOT Mapbox, NOT OpenStreetMap) |
| API key location | `GOOGLE_PLACES_API_KEY` in `/Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/web/.env.local` |
| API endpoint | `https://maps.googleapis.com/maps/api/geocode/json?address={url_encoded_addr}&key={key}` |
| Target table | `trail_waypoints` in DirtSync Supabase (`lldipxvwocpqncixlnxj`) |
| Coordinate columns | `lat` and `lng` (NOT snapped_lat/snapped_lng) |
| Acceptable precision | Within 0.01mi (~53ft) of actual business location |
| Batch size | One API call per POI (free tier: 40k/month, we use <500) |

## Context

- DirtSync Supabase project: `lldipxvwocpqncixlnxj`
- POIs are in `trail_waypoints` table, filtered by `trail_system` column
- Each POI has: name, description (often contains address), category
- API key: read from env file at task start, do NOT log or echo it

## Gotchas

| Issue | Solution |
|-------|----------|
| API returns city centroid instead of business | Append business name to address: `"{name}, {address}"` |
| POI has no street address in description | Search `"{poi_name} near {town} {state}"` to find address first |
| API returns ZERO_RESULTS | Try shorter address (just city+state), then manual Google Maps lookup |
| Rural WV addresses are imprecise | Cross-check: result should be within 2mi of trail system center. If >5mi, it's wrong |
| Rate limiting | Add 200ms delay between calls. We're well under quota but be polite |

## Execution Pattern

```bash
# Read API key
API_KEY=$(grep GOOGLE_PLACES_API_KEY /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync/web/.env.local | cut -d= -f2 | tr -d '"' | tr -d ' ')

# Geocode one POI
curl -s "https://maps.googleapis.com/maps/api/geocode/json?address=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("Marathon Gas, 123 Main St, Sophia WV"))')&key=$API_KEY"
```

## Output

```markdown
# POI Geocoding Complete: {SYSTEM}

## Results
- **POIs processed:** {n}
- **Coordinates updated:** {n}
- **Average correction:** {x.x} mi
- **Max correction:** {x.x} mi ({poi_name})

## Spot Checks (3 random)
1. {Name} — {addr} — API: {lat},{lng} — Google Maps: MATCH/OFFSET {ft}
2. ...
3. ...
```

## Checklist

### Before Starting
- [ ] API key readable from env file
- [ ] Target trail system exists in trail_waypoints
- [ ] Current coordinates noted (for before/after comparison)

### During Execution
- [ ] Each API response checked for status "OK"
- [ ] Each result within 5mi of trail system center
- [ ] 200ms delay between API calls

### After Running
- [ ] All POI coordinates updated in Supabase
- [ ] 3 spot checks passed
- [ ] Report generated with before/after distances
