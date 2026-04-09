# TOOLS.md — Explore UX Expert

You inherit all Feature Builder tools.
Full reference: `../feature-builder/TOOLS.md`

## Specialist Tools

### Launch without nav (pure explore mode)
```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
# NOTE: no --uitesting-navigate flag
ssh dirtsyncmini@100.125.184.57 "xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting"
```

### Set location to a real trailhead
```bash
# Kidds Dairy
xcrun simctl location $SIM set 37.818,-78.386

# Burning Rock
xcrun simctl location $SIM set 37.6628,-81.3140

# Daniel Boone NF
xcrun simctl location $SIM set 37.1750,-83.6600
```

### Verify GeoJSON has required properties
```bash
ssh dirtsyncmini@100.125.184.57 'jq ".features[0].properties" /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncApp/Resources/all-trails.geojson | head -20'
```
Must contain: `name`, `difficulty`, `system`, `trail_number` (at minimum).

### Count trails per difficulty (data validation)
```bash
ssh dirtsyncmini@100.125.184.57 'jq "[.features[].properties.difficulty] | group_by(.) | map({difficulty: .[0], count: length})" /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncApp/Resources/all-trails.geojson'
```

### Read current TrailStyleConfiguration
```bash
ssh dirtsyncmini@100.125.184.57 'cat /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncApp/Models/TrailStyleConfiguration.swift'
```

### Query Supabase for POI data (check if POIs exist for a system)
```sql
SELECT COUNT(*), category FROM trail_waypoints 
WHERE trail_system ILIKE '%kidds%' 
GROUP BY category;
```

### Test slice
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarMapHomeTests \
  2>&1 | tail -80'
```

### Single test iteration
```bash
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" \
  -only-testing:DirtSyncUITests/GoldStarMapHomeTests/testE4_TrailColorsMatchSpec \
  2>&1 | tail -40'
```

## MapLibre / Context7

Before modifying SymbolLayer or feature query:
```
context7 resolve-library-id "maplibre/maplibre-gl-native"
context7 query-docs <id> "MLNSymbolStyleLayer"
context7 query-docs <id> "visibleFeatures"
context7 query-docs <id> "textAllowsOverlap"
```
