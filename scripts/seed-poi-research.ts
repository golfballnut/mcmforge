#!/usr/bin/env tsx
/**
 * Seed POI Research Tasks
 *
 * Creates a Google Sheet and inserts task_queue rows for POI research.
 * Run from the Mac Mini (where workspace-mcp CLI + Supabase creds are available).
 *
 * Usage:
 *   npx tsx scripts/seed-poi-research.ts                     # Seed all 17 systems
 *   npx tsx scripts/seed-poi-research.ts --system "Burning Rock"  # Seed one system
 *   npx tsx scripts/seed-poi-research.ts --skip-sheet         # Skip sheet creation (already exists)
 *   npx tsx scripts/seed-poi-research.ts --sheet-id "ABC123"  # Use existing sheet
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", "dispatcher", ".env") });

// ── Config ──────────────────────────────────────

const MCMFORGE_URL = process.env.MCMFORGE_SUPABASE_URL!;
const MCMFORGE_KEY = process.env.MCMFORGE_SUPABASE_KEY!;
const DIRTSYNC_URL = process.env.DIRTSYNC_SUPABASE_URL || "";
const DIRTSYNC_KEY = process.env.DIRTSYNC_SUPABASE_KEY || "";

const GOOGLE_EMAIL = "dirtsyncapp@gmail.com";
const POI_FOLDER_ID = "18qQk2kQRHEb45ze_oxMNU_fzr_aiiLDh";
const DEFAULT_RADIUS = 10;
const COST_CAP = 3.0;

// Google OAuth for workspace-mcp CLI (set in dispatcher .env or shell env)
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

// ── Fallback Trail System Data ──────────────────
// Used if DirtSync DB is unavailable. Approximate coordinates from WV/VA geography.

interface TrailSystem {
  name: string;
  lat: number;
  lon: number;
  state: string;
  nearbyTowns: string[];
}

const FALLBACK_SYSTEMS: TrailSystem[] = [
  { name: "Bearwallow", lat: 38.10, lon: -80.83, state: "WV", nearbyTowns: ["Summersville", "Richwood", "Canvas"] },
  { name: "Bergoo", lat: 38.37, lon: -80.53, state: "WV", nearbyTowns: ["Webster Springs", "Bergoo"] },
  { name: "Big Coal", lat: 37.96, lon: -81.47, state: "WV", nearbyTowns: ["Whitesville", "Boone County"] },
  { name: "Braveheart", lat: 37.83, lon: -81.93, state: "WV", nearbyTowns: ["Fort Gay", "Wayne County"] },
  { name: "Buffalo Mountain", lat: 37.68, lon: -81.67, state: "WV", nearbyTowns: ["Accoville", "Man", "Logan"] },
  { name: "Burning Rock", lat: 37.73, lon: -81.35, state: "WV", nearbyTowns: ["Sophia", "Beckley", "Ghent"] },
  { name: "Cabwaylingo", lat: 38.24, lon: -82.30, state: "WV", nearbyTowns: ["Dunlow", "Wayne County"] },
  { name: "Devil Anse", lat: 37.72, lon: -81.85, state: "WV", nearbyTowns: ["Gilbert", "Mingo County"] },
  { name: "East Lynn", lat: 38.17, lon: -82.37, state: "WV", nearbyTowns: ["East Lynn", "Wayne County"] },
  { name: "Hillbilly/Tornado", lat: 37.86, lon: -81.67, state: "WV", nearbyTowns: ["Chapmanville", "Logan County"] },
  { name: "Indian Ridge", lat: 37.61, lon: -81.70, state: "WV", nearbyTowns: ["Pineville", "Wyoming County"] },
  { name: "Ivy Branch", lat: 37.97, lon: -81.15, state: "WV", nearbyTowns: ["Lookout", "Fayette County"] },
  { name: "Pinnacle Creek", lat: 37.59, lon: -81.60, state: "WV", nearbyTowns: ["Pineville", "Mullens"] },
  { name: "Pocahontas", lat: 37.42, lon: -81.50, state: "WV", nearbyTowns: ["Bramwell", "Bluefield"] },
  { name: "Rockhouse", lat: 37.56, lon: -81.77, state: "WV", nearbyTowns: ["Gilbert", "Mingo County"] },
  { name: "Warrior", lat: 38.27, lon: -81.33, state: "WV", nearbyTowns: ["Belle", "Boone County"] },
  { name: "Spearhead Trails", lat: 37.01, lon: -82.13, state: "VA", nearbyTowns: ["Grundy", "Haysi", "Breaks"] },
  { name: "Breaks Mountain", lat: 37.29, lon: -82.29, state: "VA/KY", nearbyTowns: ["Breaks", "Elkhorn City"] },
];

// ── Helpers ──────────────────────────────────────

function log(level: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`);
}

function runWorkspaceMcp(method: string, args: Record<string, unknown>): string {
  const env = {
    ...process.env,
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
  };

  const argsJson = JSON.stringify(args);
  const cmd = `$HOME/.local/bin/uvx workspace-mcp --single-user --cli ${method} --args '${argsJson}'`;

  try {
    const result = execSync(cmd, { env, timeout: 30000, encoding: "utf-8" });
    return result.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log("error", `workspace-mcp ${method} failed: ${message}`);
    throw err;
  }
}

// ── Trail System Coordinate Lookup ──────────────

async function getTrailSystems(filterSystem?: string): Promise<TrailSystem[]> {
  let systems = FALLBACK_SYSTEMS;

  // Try to get real coordinates from DirtSync Supabase
  if (DIRTSYNC_URL && DIRTSYNC_KEY) {
    try {
      const dirtsyncDb = createClient(DIRTSYNC_URL, DIRTSYNC_KEY);
      const { data, error } = await dirtsyncDb
        .from("trail_lines")
        .select("system_name, trailhead_lat, trailhead_lng")
        .eq("hidden", false)
        .not("trailhead_lat", "is", null)
        .not("trailhead_lng", "is", null);

      if (data && !error && data.length > 0) {
        // Group by system_name, compute average lat/lng
        const systemMap = new Map<string, { lats: number[]; lngs: number[] }>();
        for (const row of data) {
          const name = row.system_name;
          if (!name) continue;
          if (!systemMap.has(name)) systemMap.set(name, { lats: [], lngs: [] });
          const entry = systemMap.get(name)!;
          entry.lats.push(row.trailhead_lat);
          entry.lngs.push(row.trailhead_lng);
        }

        // Merge DB coords with fallback data (for nearby towns)
        const dbSystems: TrailSystem[] = [];
        for (const [name, coords] of systemMap) {
          const avgLat = coords.lats.reduce((a, b) => a + b, 0) / coords.lats.length;
          const avgLon = coords.lngs.reduce((a, b) => a + b, 0) / coords.lngs.length;

          // Find matching fallback for nearby towns
          const fallback = FALLBACK_SYSTEMS.find(
            (s) => s.name.toLowerCase() === name.toLowerCase()
          );

          dbSystems.push({
            name,
            lat: Math.round(avgLat * 10000) / 10000,
            lon: Math.round(avgLon * 10000) / 10000,
            state: fallback?.state || "WV",
            nearbyTowns: fallback?.nearbyTowns || [],
          });
        }

        if (dbSystems.length > 0) {
          log("info", `Got ${dbSystems.length} trail systems from DirtSync DB`);
          systems = dbSystems;
        }
      }
    } catch (err) {
      log("warn", "DirtSync DB query failed, using fallback coordinates");
    }
  } else {
    log("info", "No DirtSync DB credentials, using fallback coordinates");
  }

  if (filterSystem) {
    const filtered = systems.filter(
      (s) => s.name.toLowerCase() === filterSystem.toLowerCase()
    );
    if (filtered.length === 0) {
      log("error", `Trail system "${filterSystem}" not found in ${systems.length} systems`);
      process.exit(1);
    }
    return filtered;
  }

  return systems;
}

// ── Google Sheet Creation ────────────────────────

function createSpreadsheet(title: string): string {
  log("info", `Creating spreadsheet: ${title}`);
  const result = runWorkspaceMcp("create_spreadsheet", {
    title,
    user_google_email: GOOGLE_EMAIL,
  });

  // Parse the spreadsheet ID from the response
  // Response format varies — try JSON first, then regex
  try {
    const parsed = JSON.parse(result);
    if (parsed.spreadsheetId) return parsed.spreadsheetId;
    if (parsed.id) return parsed.id;
  } catch {
    // Try to extract ID from URL or text
    const idMatch = result.match(/spreadsheetId['":\s]+([a-zA-Z0-9_-]{20,})/);
    if (idMatch) return idMatch[1];

    const urlMatch = result.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
  }

  log("error", `Could not parse spreadsheet ID from response: ${result}`);
  process.exit(1);
}

function moveToFolder(fileId: string, folderId: string) {
  log("info", `Moving spreadsheet to POI Data folder`);
  runWorkspaceMcp("update_drive_file", {
    file_id: fileId,
    add_parents: folderId,
    remove_parents: "root",
    user_google_email: GOOGLE_EMAIL,
  });
}

function writeSheetHeader(sheetId: string, tabName: string) {
  const header = [
    "Trail System", "POI Name", "Type", "Latitude", "Longitude",
    "Distance (mi)", "Address", "Phone", "Email", "Rating",
    "Hours", "ATV Friendly", "Notes", "Source", "Also Near",
  ];

  runWorkspaceMcp("modify_sheet_values", {
    spreadsheet_id: sheetId,
    range: `${tabName}!A1`,
    values: [header],
    user_google_email: GOOGLE_EMAIL,
  });
}

// ── Task Description Builder ─────────────────────

function buildPoiTaskDescription(
  system: TrailSystem,
  sheetId: string,
  radius: number
): string {
  const tabName = `${system.name} — POIs`;
  const towns = system.nearbyTowns.join(", ");

  return `
Research all points of interest (POIs) within ${radius} miles of the ${system.name} trail system in ${system.state} and write results to a Google Sheet.

## Trail System Info
- **Name:** ${system.name}
- **Center:** ${system.lat}, ${system.lon}
- **State:** ${system.state}
- **Nearby Towns:** ${towns}
- **Search Radius:** ${radius} miles

## Google Sheet Target
- **Spreadsheet ID:** ${sheetId}
- **Tab Name:** ${tabName}
- **Header row already written** — start writing data at row 2

## IMPORTANT: Google Sheet Write Instructions
This task requires you to write results to a Google Sheet using Bash commands. This is an EXCEPTION to the default "do not create files" instruction for research tasks. You MUST use Bash to run the workspace-mcp CLI.

\`\`\`bash
# REQUIRED: Set these env vars before every workspace-mcp call
export GOOGLE_OAUTH_CLIENT_ID='${GOOGLE_OAUTH_CLIENT_ID}'
export GOOGLE_OAUTH_CLIENT_SECRET='${GOOGLE_OAUTH_CLIENT_SECRET}'

# Write data rows (batch up to 50 per call)
$HOME/.local/bin/uvx workspace-mcp --single-user --cli modify_sheet_values \\
  --args '{"spreadsheet_id": "${sheetId}", "range": "${tabName}!A2", "values": [["${system.name}","POI Name","Type","lat","lon","dist","address","phone","email","rating","hours","atv_friendly","notes","source","also_near"]], "user_google_email": "dirtsyncapp@gmail.com"}'
\`\`\`

## POI Types to Search (in priority order)
1. **Gas stations / fuel stops** — most critical for riders
2. **Restaurants / food** — fast food, sit-down, convenience stores
3. **Lodging** — hotels, motels, cabins, campgrounds, RV parks
4. **Gear shops / ATV dealers / rental shops**
5. **Trailheads / parking areas / staging areas**
6. **Emergency services** — hospitals, urgent care, police
7. **Scenic overlooks / landmarks / attractions**

## Research Approach
For each POI type, search using these patterns (substitute the actual nearby town names):
- "gas stations near ${system.nearbyTowns[0] || system.name} ${system.state}"
- "restaurants near ${system.nearbyTowns[0] || system.name} ${system.state}"
- "${system.nearbyTowns[0] || system.name} ${system.state} hotels motels campgrounds"
- "ATV dealer rental near ${system.nearbyTowns[0] || system.name} ${system.state}"
- "${system.name} trail ATV gear shop"
- "hospital urgent care near ${system.nearbyTowns[0] || system.name} ${system.state}"

For each POI found, collect:
- Exact business name and address
- GPS coordinates (business-level, NOT city centroid)
- Phone number and email if available
- Google rating (X.X/5)
- Operating hours
- ATV-friendliness (Yes/No/Unknown) — check reviews, business type, parking facilities

## Data Columns (in order)
Trail System | POI Name | Type | Latitude | Longitude | Distance (mi) | Address | Phone | Email | Rating | Hours | ATV Friendly | Notes | Source | Also Near

## Distance Calculation
Compute Haversine distance from center (${system.lat}, ${system.lon}) to each POI. Filter out anything beyond ${radius} miles.

## Dedup
If a POI appears near multiple trail systems, assign it to the CLOSER one. Set "Also Near" to note other nearby systems.

## Sorting
Sort rows by Type (alphabetical) then Distance (ascending) before writing to the sheet.

## Summary Row
After all data rows, append a summary row with total counts by type.

## Verification
Pick 3 random POIs and search each by name + address to confirm they exist and coordinates are accurate (within 1 mile of stated address).

## Time Budget
Cap total research at 20 minutes. Prioritize: Gas > Food > Lodging > everything else. Partial data is better than a timeout.

## Output
Report your findings as text:
- Total POIs found
- Count by type
- 3 verification spot-checks
- Any gaps or issues
`.trim();
}

// ── Main ─────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const systemFilter = args.includes("--system")
    ? args[args.indexOf("--system") + 1]
    : undefined;
  const skipSheet = args.includes("--skip-sheet");
  const existingSheetId = args.includes("--sheet-id")
    ? args[args.indexOf("--sheet-id") + 1]
    : undefined;

  log("info", "=== POI Research Task Seeder ===");

  // Validate config
  if (!MCMFORGE_URL || !MCMFORGE_KEY) {
    log("error", "Missing MCMFORGE_SUPABASE_URL or MCMFORGE_SUPABASE_KEY in .env");
    process.exit(1);
  }

  const mcmforgeDb = createClient(MCMFORGE_URL, MCMFORGE_KEY);

  // Get DirtSync company ID
  const { data: dirtsyncCompany } = await mcmforgeDb
    .from("company_registry")
    .select("id")
    .eq("slug", "dirtsync")
    .single();

  if (!dirtsyncCompany) {
    log("error", "DirtSync not found in company_registry");
    process.exit(1);
  }

  const dirtsyncId = dirtsyncCompany.id;
  log("info", `DirtSync company ID: ${dirtsyncId}`);

  // Get trail systems
  const systems = await getTrailSystems(systemFilter);
  log("info", `Processing ${systems.length} trail system(s)`);

  // Create or reuse Google Sheet
  let sheetId: string;

  if (existingSheetId) {
    sheetId = existingSheetId;
    log("info", `Using existing sheet: ${sheetId}`);
  } else if (skipSheet) {
    log("error", "--skip-sheet requires --sheet-id");
    process.exit(1);
  } else {
    sheetId = createSpreadsheet("DirtSync POI Research — All Systems");
    log("info", `Created spreadsheet: ${sheetId}`);

    // Move to POI Data folder
    moveToFolder(sheetId, POI_FOLDER_ID);

    // Note: Google Sheets API creates tabs when you write to them
    // Write headers to each tab
    for (const system of systems) {
      const tabName = `${system.name} — POIs`;
      try {
        writeSheetHeader(sheetId, tabName);
        log("info", `  Header written: ${tabName}`);
      } catch (err) {
        log("warn", `  Failed to write header for ${tabName} — agent will create it`);
      }
    }
  }

  // Check for existing POI research tasks (dedup)
  const { data: existingTasks } = await mcmforgeDb
    .from("task_queue")
    .select("title, status")
    .ilike("title", "POI Research:%")
    .in("status", ["todo", "in_progress", "review"]);

  const existingTitles = new Set((existingTasks || []).map((t) => t.title));

  // Insert tasks
  let created = 0;
  let skipped = 0;

  for (const system of systems) {
    const title = `POI Research: ${system.name}`;

    if (existingTitles.has(title)) {
      log("info", `  Skipping (already exists): ${title}`);
      skipped++;
      continue;
    }

    const description = buildPoiTaskDescription(system, sheetId, DEFAULT_RADIUS);

    const { data, error } = await mcmforgeDb
      .from("task_queue")
      .insert({
        title,
        description,
        task_type: "research",
        cli_target: "claude",
        company_id: dirtsyncId,
        assigned_to: "agent-executor",
        priority: "medium",
        skill_name: "poi-research",
        cost_cap: COST_CAP,
        status: "todo",
        created_by: "seed-script",
      })
      .select("id")
      .single();

    if (error) {
      log("error", `  Failed to create task for ${system.name}: ${error.message}`);
    } else {
      log("info", `  Created task: ${title} (${data.id})`);
      created++;
    }
  }

  log("info", "");
  log("info", `=== Done ===`);
  log("info", `Sheet ID: ${sheetId}`);
  log("info", `Tasks created: ${created}, skipped: ${skipped}`);
  log("info", `Dispatcher will pick these up on next poll cycle (5 min)`);

  if (systemFilter) {
    log("info", `\nTo run all systems later:\n  npx tsx scripts/seed-poi-research.ts --sheet-id "${sheetId}"`);
  }
}

main().catch((err) => {
  log("error", `Fatal: ${err.message}`);
  process.exit(1);
});
