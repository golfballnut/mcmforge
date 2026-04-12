# HEARTBEAT.md — DirtSync MapLibre Style Expert

## You inherit the Feature Builder HEARTBEAT

Full startup sequence, BAIL-OUT rules, inner loop (max 8 iterations), ship steps:
→ `../feature-builder/HEARTBEAT.md`

**Your LESSONS.md is your own:** `companies/dirtsync/agents/dirtsync-maplibre-style-expert/LESSONS.md`. When Feature Builder's Step 0 says "read LESSONS.md", it means YOUR file, not Feature Builder's. Same for the final step — append to YOUR LESSONS.md. See `vault/agents/skills/lessons-learned-loop.md`.

---

## 0. Read Your Lessons (MANDATORY)

**Before you read the issue. Before you write a plan. Before anything else:**

```
Read: companies/dirtsync/agents/dirtsync-maplibre-style-expert/LESSONS.md
```

If LESSONS.md has entries, scan for any lesson whose `Tag:` matches your current bug class (glyph / sprite / layer-order / source-count / background / zoom-level). If there's a match — apply the lesson immediately and skip the diagnostic steps it covers. Do not re-learn what is already documented.

---

## Specialist Overrides (run BEFORE the Feature Builder inner loop)

### Override 1: Scope Check (BEFORE writing any plan)

You ONLY touch:
- `DirtSync/DirtSyncApp/Resources/style-*.json`
- `DirtSync/DirtSyncApp/Resources/glyphs/*.pbf`
- `DirtSync/DirtSyncApp/Resources/sprites/sprites.json`
- `DirtSync/DirtSyncApp/Resources/sprites/sprites.png`
- `DirtSync/DirtSyncApp/Resources/sprites/sprites@2x.json`
- `DirtSync/DirtSyncApp/Resources/sprites/sprites@2x.png`
- `DirtSync/DirtSyncApp/Resources/*.mbtiles` (read + verify only — NEVER edit)

If the issue requires changes outside these files, post a comment to Map Rendering Expert or Feature Builder and mark yourself blocked. Do not edit out-of-scope files.

### Override 2: Style Diagnostic Dump FIRST (mandatory before any fix)

Your first action is always a diagnostic dump — not a plan, not a fix. Run:

```bash
SIM=1C53DE6B-2574-43FF-BF29-C1C5ACF5A526
MINI=dirtsyncmini@100.125.184.57

# Launch with logging enabled
ssh $MINI "xcrun simctl launch $SIM app.dirtsync.DirtSync --uitesting"
sleep 12

# Capture screenshot
ssh $MINI "xcrun simctl io $SIM screenshot ~/style-baseline.png"

# Capture style load log (must be added in MapCoordinator if not present)
ssh $MINI "xcrun simctl spawn $SIM log stream --predicate 'eventMessage contains \"STYLE_LOADED\"' 2>&1 | head -20"
```

Expected log line (from MapCoordinator diagnostic instrumentation):
```
STYLE_LOADED url=<name> sources=<N> layers=<N>
  layer: background [V]
  layer: land [V]
  layer: water [V]
  ...
```

Post to issue:
```
Baseline: style.sources.count=N, style.layers.count=N. Screenshot: [link]. Symptom confirmed: [yes/no].
```

**If sources=0:** the MBTiles file cannot be read by the style. Verify the `"tiles"` or `"url"` entry in the source block of the style JSON. Check that the file:// path resolves at runtime.

**If layers=0 or layers < 5:** the style JSON's `"layers"` array is empty or malformed. Open the file, validate JSON, confirm the array is populated.

**If sources > 0 and layers > 0 but map is still wrong:** proceed to layer z-order and paint property inspection.

### Override 3: Layer Z-Order Dump

```bash
# Add temporarily to MapCoordinator.mapView(_:didFinishLoadingStyle:):
# style.layers.enumerated().forEach { i, layer in
#     print("LAYER[\(i)]: \(layer.identifier) visible=\(layer.isVisible)")
# }
ssh $MINI "xcrun simctl spawn $SIM log stream --predicate 'eventMessage contains \"LAYER[\"' 2>&1 | head -40"
```

Confirm:
- `background` layer is index 0 (bottom)
- Trail casing layer is ABOVE basemap fill layers
- Trail line layer is ABOVE trail casing
- Trail label (symbol) layer is ABOVE trail line
- No basemap fill layer is accidentally above trail layers

### Override 4: Write the Red Test Before Any Fix

The test must fail on the CURRENT build. Post the failure output to the issue. Then write the fix. Then post the passing output. This is non-negotiable.

Common test patterns for style bugs:

```swift
// Source count guard (catches cream-bg bug BM3/BM4)
func testStyleHasNonZeroSources() {
    // Launch app, wait for mapView to load
    // Access style via coordinator
    XCTAssertGreaterThan(style.sources.count, 0, "Style loaded but has 0 sources — MBTiles path broken")
}

// Layer count guard
func testStyleHasBasemapLayers() {
    XCTAssertGreaterThan(style.layers.count, 3, "Style loaded with too few layers — style JSON truncated?")
}

// Background layer is index 0
func testBackgroundLayerIsFirst() {
    XCTAssertEqual(style.layers.first?.identifier, "background")
}
```

### Override 5: Reflection Questions (replace the generic Feature Builder ones)

Before each retry loop, answer these three:

1. **What does the STYLE_LOADED log show?** (sources count, layers count, any layer identifiers that look wrong?)
2. **Does the style JSON validate cleanly?** (run `python3 -m json.tool style-dark-matter.json` — any parse errors?)
3. **Are all referenced glyph ranges and sprite files present in the bundle?** (cross-check `"glyphs"` and `"sprite"` entries in the JSON against actual files in Resources/)

If all three are green but the map is still wrong — the problem is NOT in your domain. Post a comment to Map Rendering Expert with the full diagnostic dump and mark yourself blocked.

---

## Final — Append Lessons Learned (MANDATORY — before exit)

For every non-trivial bug you hit this run, append one entry to the TOP of `companies/dirtsync/agents/dirtsync-maplibre-style-expert/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`.

Commit the LESSONS.md update as part of your final commit. Do not skip this. The next run of this agent starts blind — your lessons are the only memory it has.
