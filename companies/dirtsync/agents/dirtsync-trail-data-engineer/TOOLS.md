# TOOLS — DirtSync Trail Data Engineer

> Reference for all tools, commands, schemas, and scripts this agent uses.

---

## Budget

| Target | Hard cap | Models allowed |
|--------|----------|----------------|
| $1.50/day | $4.00/day | Claude Sonnet, Codex (GPT-5.x), Gemini |

Use Sonnet or Codex for pipeline work. Opus only for architecture decisions (escalate to CEO).

---

## Tippecanoe

### Primary MBTiles Build Command

```bash
tippecanoe \
  -o DirtSync/DirtSyncApp/Resources/trails.mbtiles \
  -z 16 -Z 8 \
  --force \
  --no-feature-limit \
  --no-tile-size-limit \
  -l trails \
  DirtSync/tiles/all-trails.geojson
```

### Flag Reference

| Flag | Value | Why |
|------|-------|-----|
| `-z 16` | max zoom 16 | MapLibre overzooms beyond z16 — no benefit to higher |
| `-Z 8` | min zoom 8 | Trails not visible at country level |
| `--force` | (no value) | Overwrite existing output file |
| `--no-feature-limit` | (no value) | Don't drop trails due to tile density limits |
| `--no-tile-size-limit` | (no value) | Trails are complex polylines — don't truncate |
| `-l trails` | layer name | MapLibre style references this layer by name — must match |

### Smoke Test After Build

```bash
sqlite3 DirtSync/DirtSyncApp/Resources/trails.mbtiles \
  "SELECT zoom_level, COUNT(*) FROM tiles GROUP BY zoom_level ORDER BY zoom_level;"
```

Expected: rows at z8 through z16. If z16 is empty, the GeoJSON has no features.

```bash
ls -lh DirtSync/DirtSyncApp/Resources/trails.mbtiles
```

Expected: ≥ 1MB (real trail data). If < 100KB, the GeoJSON was empty or path was wrong.

---

## osmium-tool

### Extract Trail Area from OSM PBF

```bash
# Extract a bounding box from a regional OSM dump
osmium extract \
  --bbox -78.42,37.80,-78.35,37.84 \
  --output kidds-dairy-area.osm.pbf \
  virginia-latest.osm.pbf

# Filter to trail-related ways only
osmium tags-filter \
  kidds-dairy-area.osm.pbf \
  w/highway=path w/highway=track w/highway=cycleway w/route=mtb \
  --output kidds-dairy-trails.osm.pbf

# Export to GeoJSON for tippecanoe
osmium export \
  kidds-dairy-trails.osm.pbf \
  --output kidds-dairy-trails.geojson \
  --geometry-types=linestring
```

### OSM Source Files

| Region | Source | Notes |
|--------|--------|-------|
| Virginia (Kidds Dairy) | `virginia-latest.osm.pbf` from Geofabrik | ~700MB |
| West Virginia (Burning Rock) | `west-virginia-latest.osm.pbf` from Geofabrik | ~200MB |

---

## Supabase Queries

### DirtSync Supabase Project: `lldipxvwocpqncixlnxj`

### Look Up Trail System UUID

```sql
SELECT id, name FROM trail_systems WHERE name ILIKE '%kidds%' LIMIT 5;
```

### Query Trail Lines — Page 1

```
GET https://lldipxvwocpqncixlnxj.supabase.co/rest/v1/trail_lines
  ?trail_system_id=eq.{UUID}
  &select=id,trail_name,coordinates
  &limit=1000
  &offset=0
```

### Query Trail Lines — Page 2+ (if needed)

```
GET https://lldipxvwocpqncixlnxj.supabase.co/rest/v1/trail_lines
  ?trail_system_id=eq.{UUID}
  &select=id,trail_name,coordinates
  &limit=1000
  &offset=1000
```

Continue incrementing `offset` by 1000 until response length < 1000.

### Check for Duplicates

```sql
SELECT trail_name, trail_system_id, COUNT(*) as count
FROM trail_lines
WHERE trail_system_id = '{UUID}'
GROUP BY trail_name, trail_system_id
HAVING COUNT(*) > 1;
```

### Full System List

```sql
SELECT id, name FROM trail_systems ORDER BY name LIMIT 50;
```

---

## intersections.json Schema

### Contract (do NOT change without coordinating with offline-routing-engineer)

```json
[
  {
    "id": "ix-0",
    "lat": 37.8183,
    "lng": -78.3872,
    "trail_ids": ["uuid-1", "uuid-2", "uuid-3"]
  },
  {
    "id": "ix-1",
    "lat": 37.8191,
    "lng": -78.3865,
    "trail_ids": ["uuid-1", "uuid-4"]
  }
]
```

### Field Definitions

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Format: `ix-{sequential int starting at 0}` |
| `lat` | float | WGS84 latitude (cluster centroid) |
| `lng` | float | WGS84 longitude (cluster centroid) |
| `trail_ids` | string[] | UUIDs of trails that share this intersection |

### Validation Script

```python
#!/usr/bin/env python3
# scripts/trail-data/validate-intersections.py
import json, sys

path = sys.argv[1]
with open(path) as f:
    data = json.load(f)

errors = []
for i, entry in enumerate(data):
    if "id" not in entry: errors.append(f"ix {i}: missing id")
    if "lat" not in entry or not (-90 <= entry["lat"] <= 90): errors.append(f"ix {i}: invalid lat")
    if "lng" not in entry or not (-180 <= entry["lng"] <= 180): errors.append(f"ix {i}: invalid lng")
    if "trail_ids" not in entry or not isinstance(entry["trail_ids"], list): errors.append(f"ix {i}: invalid trail_ids")
    if len(entry.get("trail_ids", [])) < 2: errors.append(f"ix {i}: trail_ids must have >=2 entries")

if errors:
    print("VALIDATION FAILED:")
    for e in errors: print(f"  {e}")
    sys.exit(1)
else:
    print(f"OK: {len(data)} intersections validated")
```

Usage:
```bash
python3 scripts/trail-data/validate-intersections.py \
  DirtSync/DirtSyncApp/Resources/intersections-kidds-dairy.json
```

---

## Endpoint Clustering Script

```python
#!/usr/bin/env python3
# scripts/trail-data/cluster-intersections.py
# Usage: python3 cluster-intersections.py trail_lines.json > intersections.json

import json, sys, math
from collections import defaultdict

RADIUS_M = 10  # meters

def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

with open(sys.argv[1]) as f:
    trails = json.load(f)

endpoints = []
for trail in trails:
    coords = trail["coordinates"]
    if not coords: continue
    trail_id = trail["id"]
    # GeoJSON: [lng, lat]
    endpoints.append({"trail_id": trail_id, "lat": coords[0][1], "lng": coords[0][0]})
    endpoints.append({"trail_id": trail_id, "lat": coords[-1][1], "lng": coords[-1][0]})

assigned = [False] * len(endpoints)
clusters = []

for i, ep in enumerate(endpoints):
    if assigned[i]: continue
    cluster = [i]
    for j, other in enumerate(endpoints):
        if i == j or assigned[j]: continue
        if haversine_m(ep["lat"], ep["lng"], other["lat"], other["lng"]) <= RADIUS_M:
            cluster.append(j)
    for idx in cluster:
        assigned[idx] = True
    if len(cluster) >= 3:
        lats = [endpoints[k]["lat"] for k in cluster]
        lngs = [endpoints[k]["lng"] for k in cluster]
        trail_ids = list(set(endpoints[k]["trail_id"] for k in cluster))
        clusters.append({
            "id": f"ix-{len(clusters)}",
            "lat": sum(lats)/len(lats),
            "lng": sum(lngs)/len(lngs),
            "trail_ids": trail_ids
        })

print(json.dumps(clusters, indent=2))
```

---

## scripts/trail-data/ File Layout

```
scripts/trail-data/
├── export-trails.py          # Supabase → all-trails.geojson (paginated)
├── cluster-intersections.py  # Endpoints → intersections-{system}.json
├── validate-intersections.py # Schema + bounds validation
├── build-mbtiles.sh          # tippecanoe wrapper with smoke test
├── dedup-trails.py           # Find and report duplicate trail_lines rows
└── README.md                 # One-liner descriptions of each script
```

---

## Forge API — Post Results

```bash
# Post comment to Forge issue
curl -s -X POST \
  https://mcmforge.com/api/agent/issues/{issue_id}/comments \
  -H "Content-Type: application/json" \
  -d '{
    "body": "## Trail Data Engineer — kidds-dairy — {date}\n\n...",
    "agent": "dirtsync-trail-data-engineer"
  }'
```

---

## MCP Tools Available

| Tool | Use for |
|------|---------|
| `mcp__supabase__execute_sql` | SQL queries against DirtSync Supabase |
| `mcp__supabase__list_tables` | Verify table names and columns |
| `mcp__filesystem__*` | File reads/writes for large GeoJSON |
| `mcp__git__*` | Branch creation, commits, status |

---

## Known System UUIDs (verify before use — may change after schema migrations)

| System | UUID | Trails |
|--------|------|--------|
| Kidds Dairy Farm | TBD — query `trail_systems` on first run | 11 |
| Burning Rock | TBD — query `trail_systems` on first run | 96 |
