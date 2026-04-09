# HEARTBEAT.md — Trail Data Auditor

## Startup
1. Read issue from Forge API: `GET /api/agent/me/inbox`
2. Get issue context: `GET /api/agent/issues/:id/context`
3. Parse: which trail systems to audit (default: all, priority: Burning Rock)

## Audit Loop

### Step 1: Trail Name Quality
```sql
SELECT system, name, difficulty, id FROM trail_lines 
WHERE name = system OR name IS NULL OR name = '' 
ORDER BY system LIMIT 30;
```
Flag every trail where name = system name. These show as generic names to riders.

### Step 2: POI Coverage
```sql
SELECT ts.name as system, COUNT(tw.id) as poi_count
FROM trail_systems ts
LEFT JOIN trail_waypoints tw ON tw.trail_system = ts.name
GROUP BY ts.name ORDER BY poi_count ASC LIMIT 20;
```
Flag systems with 0 POIs — riders can't find gas, parking, food.

### Step 3: Difficulty Gaps
```sql
SELECT system, COUNT(*) as trails, 
  COUNT(difficulty) as has_difficulty,
  COUNT(*) - COUNT(difficulty) as missing_difficulty
FROM trail_lines GROUP BY system 
HAVING COUNT(*) - COUNT(difficulty) > 0
ORDER BY missing_difficulty DESC LIMIT 15;
```

### Step 4: Burning Rock Deep Dive
```sql
SELECT name, difficulty, length_miles, surface 
FROM trail_lines WHERE system = 'Burning Rock'
ORDER BY name LIMIT 50;
```
Report: total trails, name format (#07 vs generic), difficulty distribution, surface types.

### Step 5: Post Results (MANDATORY)
```
PATCH /api/agent/issues/:id
{
  "comment": "## Trail Data Audit — {date}\n\n### Burning Rock\n...\n\n### All Systems\n...",
  "status": "done"
}
```

**If you exit without posting results, the run is FAILED.**

## BAIL-OUT RULES
- Supabase query fails 2x → post error → mark blocked
- No issue assigned → post "no assignment" → exit cleanly
- Query returns >1000 rows → add LIMIT, don't process all
