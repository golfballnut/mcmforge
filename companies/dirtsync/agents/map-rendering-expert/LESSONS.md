# Lessons Learned — Map Rendering Expert

Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

---

2026-04-09 — BM3 real offline basemap (third attempt — THE fix)

Bug: BM1 shipped a test helper. BM1c gated a remote URL on isConnected (still remote). BM2 switched default to liberty (still remote, just different CDN). All three were placebos — every bundled style file referenced remote URLs.
Fix: dirtsync-offline-style.json uses ONLY a background color (#2c3e2d) + empty sources block. Zero remote URLs. MapLibre loads it in <100ms with no network fetch, fires didFinishLoadingStyle immediately. MapCoordinator then adds trails.mbtiles programmatically (as it already did for every other style).
Why: MapLibre's style JSON load is the trigger for didFinishLoadingStyle. If the style JSON itself has remote references that fail, nothing renders — not even local MBTiles. The entire render pipeline is gated on successfully loading the style JSON's declared sources.
Architecture decision: Do NOT declare the mbtiles:// source in the style JSON. Declare it programmatically in MapCoordinator.addMBTilesTrailLayers() AFTER didFinishLoadingStyle fires. This is the existing pattern — it already works. The offline style's only job is to provide a valid, network-free style structure so the callback fires.
Evidence: testBM3_OfflineModeRendersTrailsWithNoNetwork PASS. backgroundRatio=0.92 trailRatio=0.08. Screenshot: dark green bg + blue/gold/black trail lines from MBTiles. "No connection — offline mode" banner confirmed. Commit: 42966913.
Lesson: "bundled" does not mean "offline" unless you GREP the JSON for https:// and get zero hits. Always verify. Don't trust filenames. liberty-style-offline.json is NOT offline — it references tiles.openfreemap.org. Name is a lie.
Placebo pattern: BM1/BM1c/BM2 all "fixed" the wrong thing because they each looked at what was easy to change (URL string, boolean flag, CDN choice) without asking "what actually triggers didFinishLoadingStyle to fire?" The answer: loading a style JSON with no failing remote references.
Tag: basemap, maplibre, mbtiles, offline, bm3, placebo-pattern, didFinishLoadingStyle

---

2026-04-09 — BM2 REAL basemap fix (after BM1/BM1c placebos)

Bug: Basemap rendered black on real device. BM1 shipped a test helper. BM1c gated a
remote URL on isConnected. Neither actually fixed rendering because:
1. `useFreeRiderDarkTheme=true` (line 99 MapStyleManager) forced ALL cold launches through
   CARTO dark-matter style JSON (https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json)
2. That is a remote style JSON file, not just remote tiles. If that HTTP fetch fails
   (bad signal, ATS, SSL, CARTO downtime), MapLibre receives no style → solid black.
3. BM1c's "offline fallback" (liberty-style-offline.json, positron-style-offline.json) are
   placebos — they're local JSON files that internally reference remote openfreemap.org URLs.
   They cannot render without network. The name "-offline" is a lie.
4. assertMapNotAllBlack(tolerance: 0.05) was too weak — trail lines on a black background
   pass the 5% non-black threshold. The BASEMAP was black but the test green-lit it.

Fix: Set `useFreeRiderDarkTheme = false` in MapStyleManager.swift:99.
Cold launch now routes through MapStyle.outdoor → liberty (openfreemap), which is more
reliable than CARTO for first-load. The dark theme can be re-enabled after field validation.

Why CARTO was worse than liberty:
- CARTO requires fetching a style JSON from basemaps.cartocdn.com before ANY rendering
- If that one HTTP request fails, the entire map is black (no partial render)
- openfreemap liberty fails more gracefully — individual tile failures leave the basemap
  partially rendered rather than entirely black

Reproduce method: The simulator has Mac network so both styles render in simulator tests.
The real failure was device-only (poor signal). We proved RED/GREEN by testing pixel brightness:
- CARTO dark-matter: 4% bright pixels (dark theme by design)
- Liberty outdoor: 70%+ bright pixels (cream/green/white terrain)
- testBM2_BasemapActuallyRenders asserts >40%, cleanly differentiates the two

Real-device validation: Steve field test (WV mountain biking trip, April 9) is the true gate.
Simulator can only verify the code path is taken; it cannot simulate network failure.

Lesson: assertMapNotAllBlack() is insufficient — trail lines on black pass the test.
Test the BASEMAP specifically by requiring >40% BRIGHT pixels (not just non-black).
Also: "-offline" in a filename does not make it truly offline. Read the JSON sources block.

Tag: basemap, maplibre, raster, styleloader, bm2, carto, liberty, dark-theme

---
