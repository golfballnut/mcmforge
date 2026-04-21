# HEARTBEAT — DirtSync Trail Data Engineer

> This is your procedure for every wake. Follow it in order. Do not skip steps.

---

## 0. Read Your Lessons

Before anything else:
```
Read: companies/dirtsync/agents/dirtsync-trail-data-engineer/LESSONS.md
```

Extract any `Tag: GOTCHA` entries and treat them as active constraints for this run. If LESSONS.md is empty, continue — this may be your first run.

**After reading lessons and identifying the target issue, post [START] BEFORE any data work:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[START] <issue-id>: target system <name>. Plan: query trail_lines → extract endpoints → cluster → write intersections JSON. Est: 10 min.", "tags": ["START"]}'
```

---

## 1. Load Config and Identify the Target System

Read your AGENTS.md to confirm Pre-Made Decisions are loaded.

From the Forge issue or run payload, extract:
- Target trail system name (e.g., `Kidds Dairy Farm`)
- System slug for file naming (e.g., `kidds-dairy`)
- Which deliverable is needed: `intersections-{system}.json`, `trails.mbtiles` rebuild, or both
- Forge issue ID (for posting results)

---

## 2. Look Up Trail System UUID

Query Supabase to get the `trail_system_id` for the target system:

```sql
SELECT id, name FROM trail_systems WHERE name ILIKE '%kidds%' LIMIT 5;
```

Note the UUID. You need it to filter `trail_lines`.

---

## 3. Query Trail Lines (Paginated)

Query `trail_lines` for the target system. Respect the 1000-row REST limit — paginate until you get a response with < 1000 rows.

**Page 1:**
```
GET /rest/v1/trail_lines?trail_system_id=eq.{UUID}&select=id,trail_name,coordinates&limit=1000&offset=0
```

**Page 2 (if page 1 returned exactly 1000):**
```
GET /rest/v1/trail_lines?trail_system_id=eq.{UUID}&select=id,trail_name,coordinates&limit=1000&offset=1000
```

Continue until page returns < 1000 rows.

Collect all rows. For Kidds Dairy (11 trails) this will be a single page.

---

## 4. Extract Endpoints

For each trail row, extract:
- **First coordinate** of the `coordinates` array (trail start)
- **Last coordinate** of the `coordinates` array (trail end)

Coordinates are stored as GeoJSON `[lng, lat]` arrays. Extract correctly:
- `lat = coordinates[0][1]`, `lng = coordinates[0][0]` (first point)
- `lat = coordinates[-1][1]`, `lng = coordinates[-1][0]` (last point)

Build a flat list of endpoint objects:
```json
[{"trail_id": "...", "lat": 37.818, "lng": -78.387, "type": "start"}, ...]
```

Total endpoints = `trail_count * 2`. For 11 trails = 22 endpoints.

---

## 5. Cluster Endpoints

Group endpoints that fall within a 10-meter radius of each other.

Approximate degree equivalents for 10m:
- Latitude: ~0.00009 degrees
- Longitude: ~0.000113 degrees (at 37.8° latitude)

Algorithm:
1. Start with all endpoints unassigned.
2. For each unassigned endpoint, find all other unassigned endpoints within 10m radius (use Haversine or degree approximation).
3. Assign them to a cluster. Mark as assigned.
4. Continue until all endpoints are assigned.

Each cluster with **3 or more endpoint hits** = a confirmed intersection.
Clusters with 1 or 2 hits = dead ends or trail termini — skip.

---

## 6. Build intersections-{system}.json

For each qualifying cluster (≥ 3 hits), create an intersection entry:

```json
{
  "id": "ix-0",
  "lat": <centroid lat of cluster>,
  "lng": <centroid lng of cluster>,
  "trail_ids": ["trail-uuid-1", "trail-uuid-2", "trail-uuid-3"]
}
```

Full output is an array of these objects, sorted by `id`.

**Schema contract** (do not change — consumed by offline-routing-engineer):
```json
[
  {"id": "ix-0", "lat": 37.8183, "lng": -78.3872, "trail_ids": ["abc", "def", "ghi"]},
  {"id": "ix-1", "lat": 37.8191, "lng": -78.3865, "trail_ids": ["abc", "jkl"]}
]
```

---

**After clustering completes, post [PROGRESS]:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROGRESS] Queried <N> trails, <M> endpoints. Found <K> intersections. Validating now.", "tags": ["PROGRESS"]}'
```

## 7. Validate

Before writing the file:

1. **Count check:** For Kidds Dairy (11 trails, 22 endpoints), expect 0–6 intersections depending on trail layout. If you get > 10, something is wrong — recheck radius.
2. **No-intersection check:** If zero intersections found, check coordinate order (lng/lat vs lat/lng confusion will scatter all endpoints across the globe).
3. **Schema check:** Every entry must have `id`, `lat`, `lng`, `trail_ids`. No nulls. `trail_ids` is an array of strings.
4. **Visual sanity:** Spot-check 2-3 intersections — do their lat/lng values fall within the Kidds Dairy bounding box (approx 37.81–37.83 lat, -78.40 to -78.37 lng)?

---

## 8. Write the File

Write the validated JSON to:
```
DirtSync/DirtSyncApp/Resources/intersections-kidds-dairy.json
```

Pretty-print with 2-space indent. File size should be < 50KB for Kidds Dairy.

---

## 9. Rebuild MBTiles (if triggered)

Only rebuild `trails.mbtiles` if:
- New trails were added to Supabase for the system
- Bounds changed significantly
- You were explicitly asked to rebuild

If rebuilding:

1. Export ALL trail systems from Supabase to `DirtSync/tiles/all-trails.geojson` — not just the target system.
2. Back up existing `trails.mbtiles` before running tippecanoe.
3. Run:
   ```bash
   tippecanoe -o DirtSync/DirtSyncApp/Resources/trails.mbtiles \
     -z 16 -Z 8 --force --no-feature-limit --no-tile-size-limit \
     -l trails \
     DirtSync/tiles/all-trails.geojson
   ```
4. Verify output file size ≥ 1MB. If smaller, the GeoJSON export was incomplete.
5. Run a quick smoke test: open the mbtiles in `sqlite3` and verify the `tiles` table has rows at z16.

---

## 10. Commit

Create or checkout branch:
```bash
git checkout -b agent/trail-data-kidds-dairy
```

Stage and commit:
```bash
git add DirtSync/DirtSyncApp/Resources/intersections-kidds-dairy.json
git commit -m "feat: add intersections-kidds-dairy.json (N intersections from M trails)

Queried Supabase trail_lines for Kidds Dairy Farm.
Extracted endpoints, clustered at 10m radius.
N qualifying intersections (≥3 endpoint hits).
"
```

If mbtiles rebuilt, add it to the same commit.

---

## 11. Post Results to Forge Issue

**Post [PROOF] with concrete artifacts before marking done:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[PROOF] Trails: <N>. Endpoints: <M>. Intersections: <K>. File: <path>. Commit: <sha>. Branch: <branch>.", "tags": ["PROOF"]}'
```

Also post the detailed results using the AGENTS.md output format:
- Trail count from Supabase
- Endpoint count
- Intersection count
- File path committed
- Commit SHA and branch

---

## Final — Append Lessons Learned and Post [DONE]

**Post [DONE] as your last action before exit:**
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[DONE] <issue-id>: <system> data shipped. <K> intersections. Commit: <sha>. Branch: <branch>. ~$<cost>.", "tags": ["DONE"]}'
```

Before your session ends, review what happened during this run. For anything surprising, wrong, or newly discovered, append to `LESSONS.md`:

```markdown
## {date} — {system}

**What happened:** {brief description}
**Tag:** GOTCHA | DATA | PROCESS
**Lesson:** {what to do differently next time}
```

Examples of things to capture:
- Coordinate order was reversed and produced zero intersections (caught in step 7)
- Supabase column name for trail_system_id was different than expected
- Kidds Dairy has 11 trails but 3 are duplicates — dedup before clustering
- tippecanoe produced a 48KB file because GeoJSON path was wrong

If the run went perfectly with no surprises, write: "Clean run. No new lessons."

---

## Quick Reference

| System | Supabase | Coordinates | Trail count |
|--------|----------|-------------|-------------|
| Kidds Dairy Farm | `lldipxvwocpqncixlnxj` | 37.818, -78.387 | 11 |
| Burning Rock | `lldipxvwocpqncixlnxj` | 37.68, -81.30 | 96 |

| File | Path |
|------|------|
| intersections output | `DirtSync/DirtSyncApp/Resources/intersections-{system}.json` |
| GeoJSON source | `DirtSync/tiles/all-trails.geojson` |
| MBTiles output | `DirtSync/DirtSyncApp/Resources/trails.mbtiles` |
| Pipeline scripts | `scripts/trail-data/` |
