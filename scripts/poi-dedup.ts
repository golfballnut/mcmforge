#!/usr/bin/env tsx
/**
 * POI Dedup — Post-Processing Script
 *
 * Reads the POI Research Google Sheet, identifies cross-system duplicates,
 * and resolves them (keep POI in closer system's tab, set "Also Near" column).
 *
 * Run after all 17 POI research tasks complete.
 *
 * Usage:
 *   npx tsx scripts/poi-dedup.ts --sheet-id "SPREADSHEET_ID"
 */

import { execSync } from "child_process";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", "dispatcher", ".env") });

const GOOGLE_EMAIL = "dirtsyncapp@gmail.com";
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

// Column indices (0-based)
const COL = {
  TRAIL_SYSTEM: 0,
  POI_NAME: 1,
  TYPE: 2,
  LAT: 3,
  LON: 4,
  DISTANCE: 5,
  ADDRESS: 6,
  ALSO_NEAR: 14,
};

interface POIRow {
  tab: string;
  rowIndex: number; // 1-based row number in sheet
  data: string[];
  lat: number;
  lon: number;
}

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

  const result = execSync(cmd, { env, timeout: 30000, encoding: "utf-8" });
  return result.trim();
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function coordsMatch(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  return Math.abs(lat1 - lat2) < 0.001 && Math.abs(lon1 - lon2) < 0.001;
}

async function main() {
  const args = process.argv.slice(2);
  const sheetId = args.includes("--sheet-id")
    ? args[args.indexOf("--sheet-id") + 1]
    : undefined;

  if (!sheetId) {
    console.error("Usage: npx tsx scripts/poi-dedup.ts --sheet-id SPREADSHEET_ID");
    process.exit(1);
  }

  log("info", `=== POI Dedup — Sheet: ${sheetId} ===`);

  // Get list of tabs (sheet names)
  // workspace-mcp doesn't have a "list tabs" method, so we'll read the known systems
  // We read each tab and collect all POI rows
  const allPOIs: POIRow[] = [];
  const tabData = new Map<string, string[][]>();

  // Try reading each system's tab
  const systemNames = [
    "Bearwallow", "Bergoo", "Big Coal", "Braveheart", "Buffalo Mountain",
    "Burning Rock", "Cabwaylingo", "Devil Anse", "East Lynn",
    "Hillbilly/Tornado", "Indian Ridge", "Ivy Branch", "Pinnacle Creek",
    "Pocahontas", "Rockhouse", "Warrior", "Spearhead Trails", "Breaks Mountain",
  ];

  for (const name of systemNames) {
    const tabName = `${name} — POIs`;
    try {
      const result = runWorkspaceMcp("read_sheet_values", {
        spreadsheet_id: sheetId,
        range: `${tabName}!A1:O500`,
        user_google_email: GOOGLE_EMAIL,
      });

      const parsed = JSON.parse(result);
      const rows: string[][] = parsed.values || parsed || [];

      if (rows.length <= 1) {
        log("info", `  ${tabName}: empty (header only)`);
        continue;
      }

      tabData.set(tabName, rows);

      // Skip header row (index 0), skip summary rows (start with "---")
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row[0] === "---" || row[0] === "") continue;

        const lat = parseFloat(row[COL.LAT]);
        const lon = parseFloat(row[COL.LON]);
        if (isNaN(lat) || isNaN(lon)) continue;

        allPOIs.push({ tab: tabName, rowIndex: i + 1, data: row, lat, lon });
      }

      log("info", `  ${tabName}: ${rows.length - 1} rows`);
    } catch {
      log("info", `  ${tabName}: not found or empty`);
    }
  }

  log("info", `Total POIs loaded: ${allPOIs.length}`);

  // Find duplicates: same name + coords within 0.001 degrees across different tabs
  const duplicates: Array<{ keep: POIRow; remove: POIRow }> = [];

  for (let i = 0; i < allPOIs.length; i++) {
    for (let j = i + 1; j < allPOIs.length; j++) {
      const a = allPOIs[i];
      const b = allPOIs[j];

      if (a.tab === b.tab) continue; // Same tab, skip

      const nameMatch =
        a.data[COL.POI_NAME]?.toLowerCase().trim() ===
        b.data[COL.POI_NAME]?.toLowerCase().trim();

      if (nameMatch && coordsMatch(a.lat, a.lon, b.lat, b.lon)) {
        // Keep the one with the shorter distance
        const distA = parseFloat(a.data[COL.DISTANCE]) || 999;
        const distB = parseFloat(b.data[COL.DISTANCE]) || 999;

        if (distA <= distB) {
          duplicates.push({ keep: a, remove: b });
        } else {
          duplicates.push({ keep: b, remove: a });
        }
      }
    }
  }

  log("info", `Duplicates found: ${duplicates.length}`);

  if (duplicates.length === 0) {
    log("info", "No duplicates — nothing to do");
    return;
  }

  // Process duplicates: update "Also Near" on kept row, mark removed rows
  const removals = new Map<string, Set<number>>(); // tab → row indices to remove
  const updates = new Map<string, Map<number, string>>(); // tab → row index → new "Also Near" value

  for (const { keep, remove } of duplicates) {
    // Mark for removal
    if (!removals.has(remove.tab)) removals.set(remove.tab, new Set());
    removals.get(remove.tab)!.add(remove.rowIndex);

    // Update "Also Near" on the kept row
    const removeSystem = remove.data[COL.TRAIL_SYSTEM] || remove.tab.replace(" — POIs", "");
    const existingAlsoNear = keep.data[COL.ALSO_NEAR] || "";
    const newAlsoNear = existingAlsoNear
      ? `${existingAlsoNear}, ${removeSystem}`
      : removeSystem;

    if (!updates.has(keep.tab)) updates.set(keep.tab, new Map());
    updates.get(keep.tab)!.set(keep.rowIndex, newAlsoNear);
  }

  // Apply updates
  for (const [tab, rowUpdates] of updates) {
    for (const [rowIndex, alsoNear] of rowUpdates) {
      try {
        runWorkspaceMcp("modify_sheet_values", {
          spreadsheet_id: sheetId,
          range: `${tab}!O${rowIndex}`,
          values: [[alsoNear]],
          user_google_email: GOOGLE_EMAIL,
        });
        log("info", `  Updated "Also Near" in ${tab} row ${rowIndex}: ${alsoNear}`);
      } catch (err) {
        log("error", `  Failed to update ${tab} row ${rowIndex}`);
      }
    }
  }

  // Log removals (manual for now — clearing rows in Google Sheets is complex)
  for (const [tab, rows] of removals) {
    const rowList = [...rows].sort((a, b) => a - b).join(", ");
    log("info", `  REMOVE from ${tab}: rows ${rowList}`);
    log("info", `  (Clear these rows manually or re-run the research for that system)`);
  }

  log("info", "");
  log("info", `=== Dedup Complete ===`);
  log("info", `Updated "Also Near": ${updates.size} tabs`);
  log("info", `Rows to remove: ${[...removals.values()].reduce((sum, s) => sum + s.size, 0)}`);
}

main().catch((err) => {
  log("error", `Fatal: ${err.message}`);
  process.exit(1);
});
