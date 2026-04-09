# Lessons Learned — Explore UX Expert

Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

---

2026-04-09 — Explore batch E2-E7 ship

Bug: 6 explore-mode failures: trail labels invisible (E2), wrong difficulty colors (E3 n/a, E4), orange stop badges leaked (E3), POI markers missing in explore (E5), browse sheet absent (E7). Trail tap already wired (E6 was a false bug).
Fix: TrailStyleConfiguration.swift — hardColor #1C1C1E→#000000, singleTrackColor #D4940A→#FFD700, difficultyColorMatchExpressionJSON rgba updated, hexColor() updated; createTrailLabelsLayer — textAllowsOverlap+textIgnoresPlacement both false→true (root E2 cause); MapCoordinator+TrailLayers.swift — same flags + minimumZoomLevel 10→13; MapView.swift + MapCoordinator.swift — removed isNavigating gate from POI marker add (E5); RidePackMapView.swift — guard !stops.isEmpty (E3, defensive); MapOverlayStack.swift — browse button + BrowseSystemsSheet.swift created (E7). Color audit: UserTrack.swift + ThemeManager.swift updated to match.
Why: Three root cause patterns — (1) duplicate color sources: TrailStyleConfiguration was SSOT but UserTrack/ThemeManager had their own hardcoded copies; (2) conditional POI rendering: POI layer gated on isNavigating meaning explore mode got nothing; (3) silent label failure: textAllowsOverlap=false caused all labels to be culled by placement algorithm in dense MBTiles areas.
Key gotcha: E6 (trail tap) was ALREADY implemented via MapCoordinator.handleRouteTap visibleFeatures + tappedTrailInfo + TrailInfoPopupView in MapOverlayStack. Plan spec was written before the implementation. Always check current code before building "missing" features.
Key gotcha: accessibilityElement(children: .contain) required on SwiftUI VStack that has .accessibilityIdentifier() — without it, child Button identifiers are inaccessible to XCUITest.
Key gotcha: MapLibre idle watchdog SIGKILL at ~85s test runtime. Keep total sleep < 10s per test. Never sleep(12) — use post-launch settle from GoldStarTestHelper.launch (already 8s) and assert immediately.
Tag: explore, trailcolor, maplibre, symbollayer, poi, accessibility, browse
