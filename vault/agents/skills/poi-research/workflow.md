# POI Research — Step-by-Step Workflow

## Step 1: Resolve Coordinates

Use center coordinates from the task description (pre-filled from DirtSync DB by the seed script).

Fallback if not provided:
1. Check the trail system lookup table in reference.md
2. Query `curl -s https://dirtsync.app/api/trail-systems`

## Step 2: Web Research (Per POI Type)

Search in priority order: Gas > Food > Lodging (hotels, cabins, campgrounds) > Gear > Emergency > Grocery > Liquor > Tow > Auto Parts > Laundry > Car Wash > Pharmacy > Banks > Scenic.

For each POI type, run multiple queries using both trail system name and nearby town names:
- `"gas stations near {town1} {state}"` and `"gas stations near {town2} {state}"`
- `"fuel stops near {trail_system_name} trail"`
- Cabins/rentals: search Airbnb/VRBO directly (exact addresses hidden — use approximate location)

If running long on time, ensure types 1-4 (gas, food, hotels, cabins) are complete before others.

## Step 3: Collect Details Per POI

For each discovered POI, gather:
- Exact address + GPS coordinates (business-level, NOT city centroid)
- Phone number and email if available
- Google rating (X.X/5)
- Operating hours (especially seasonal for rural locations)
- ATV-friendliness: look for trailer parking, "riders welcome", UTV/ATV in name, large gravel lots

## Step 4: Calculate Distance

Compute Haversine distance from trail system center for each POI. Filter out any POI beyond RADIUS_MILES (default 10).

```
distance = 2 * R * arcsin(sqrt(sin((lat2-lat1)/2)^2 + cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)^2))
R = 3959 miles
```

## Step 5: Dedup Check

Before adding a POI:
1. If POI name + coordinates (within 0.001 degrees / ~0.07 miles) already exists in another tab, assign to whichever trail system is closer
2. Set "Also Near" column to note other nearby systems
3. First system to run: note nearby systems in "Also Near" based on lookup table distances

## Step 6: Write to Google Sheet

Use workspace-mcp CLI to write results. This is an exception to the "no files" rule for research tasks.

```bash
export GOOGLE_OAUTH_CLIENT_ID="$GOOGLE_OAUTH_CLIENT_ID"
export GOOGLE_OAUTH_CLIENT_SECRET="$GOOGLE_OAUTH_CLIENT_SECRET"

# Write header row (only if tab is empty)
$HOME/.local/bin/uvx workspace-mcp --single-user --cli modify_sheet_values \
  --args '{"spreadsheet_id": "SHEET_ID", "range": "TAB_NAME!A1", "values": [["Trail System","POI Name","Type","Latitude","Longitude","Distance (mi)","Address","Phone","Email","Rating","Hours","ATV Friendly","Notes","Source","Also Near"]], "user_google_email": "dirtsyncapp@gmail.com"}'

# Write data rows — batch up to 50 rows per call
$HOME/.local/bin/uvx workspace-mcp --single-user --cli modify_sheet_values \
  --args '{"spreadsheet_id": "SHEET_ID", "range": "TAB_NAME!A2", "values": [[...rows...]], "user_google_email": "dirtsyncapp@gmail.com"}'
```

Sort rows by Type (alphabetical) then Distance (ascending) before writing.

## Step 7: Add Summary Row

After all data rows, append:
```
["---","TOTALS","Gas: X | Food: Y | Hotels: Z | Cabins: A | Campgrounds: B | Gear: C | Emergency: D | ...","---",...]
```

## Step 8: Verification

1. Pick 3 random POIs from results
2. Search each by name + address to confirm they exist and are still open
3. Verify coordinates are within 1 mile of the stated address (not a city centroid)
4. Report verification results in text output
