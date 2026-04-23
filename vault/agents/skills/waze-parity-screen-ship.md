# Skill: Waze-Parity Screen Ship

> Last updated: April 23, 2026
> Used by: DirtSync Map Rendering Expert, App Designer, Simulator Specialist, Feature Builder
> Origin: DIRA-266 shipped twice — fake cosine-bow geometry slipped past 5/5 green tests; real Mapbox fixtures required a second ship. This skill encodes every lesson so the next screen lands correctly on the first try.
> Parent tracker: DIRA-251 (road-first pivot)

---

## Goal
Ship one Waze-parity screen (Home, Search, Route Preview, Active Nav, Arrival, Offline, History) from a Gold Star reference image to a merged PR via the A loop — with **real** upstream data, probe-driven XCUITest assertions, and a Visual Critic grade ≥ the Gold Star. No hedged ships. No synthesized geometry. No mode toggles. Road-first only.

## Definition of Done
**You are NOT done until every one of these is true:**
1. Gold Star image saved at `/tmp/<issue-id>-gold-star.png` — captured from a real Waze iOS screenshot (Steve's device or App Store), never described from memory
2. XCUITest file `<IssueID>WazeXxxTests.swift` exists in `DirtSyncUITests/` and encodes every AC as a probe-based assertion — written BEFORE production code
3. All production code for this screen lives under `DirtSync/DirtSyncApp/Waze/<Screen>/` — no edits outside this directory
4. Test suite runs 5/5 green on iPhone 16 Pro simulator
5. Simulator screenshot captured and compared visually against Gold Star — Visual Critic grade ≥ Gold Star
6. PR opened with the Before / Failed / After screenshots attached, admin-merged to `v2-road-first`
7. Gotchas encountered this run appended to the bottom of this skill file

**If any row is false, you are NOT done. Loop back.**

## Pre-Made Decisions
**DO NOT ask about these. Settled.**

| Decision | Answer |
|----------|--------|
| Branch | `v2-road-first` (never master; never `trails-archive`) |
| Routing provider | Mapbox Directions v5 only (no Valhalla, no HybridRoutingService) |
| Basemap | MapLibre + Mapbox Streets style (no trail MBTiles) |
| File scope | `DirtSync/DirtSyncApp/Waze/` only + the test file + pbxproj |
| Trail code | Do NOT import, reference, or edit Trail*, Valhalla*, Hybrid*, MBTiles*. Those are frozen on trails-archive |
| Test framework | XCUITest + `UITestMapProbe.shared` ds-test-* probes |
| Test fixtures | Real upstream API responses saved as bundle JSON. Never synthesize coordinates |
| Visual Critic | Simulator screenshot vs Gold Star. If you can't see the difference at a glance, you're done. |
| Merge authority | CEO admin-merge on CI-green + [PROOF] comment |
| Hedging | Banned. "Shipped with a known gap" means not shipped |

## Execution Flow

### Phase 1: Gold Star capture
- Pull the Waze iOS screenshot for this screen. Priority order:
  1. Steve's iPhone screenshot (ask in issue comments if not provided)
  2. Mobbin / UI Sources / Pinterest — only if captioned as current Waze iOS (not a redesign concept)
  3. App Store preview reel at `https://apps.apple.com/us/app/waze-navigation-live-traffic/id323229106`
- Save to `/tmp/<issue-id>-gold-star.png`. Attach to the Forge issue as the reference.
- **Do NOT proceed without a real image.** Describing from memory is the failure mode this skill exists to prevent.

### Phase 2: Probe inventory
- Open `DirtSync/DirtSyncApp/Views/MapCoordinator.swift` → find `UITestMapProbe`.
- If the probes you need don't exist yet, add them (5 new `@Published` fields + 5 new `Text` surfaces in `UITestSystemNameProbeLabel`, all gated on `--uitesting`).
- Probe naming convention: `ds-test-waze-<screen>-<what>` (e.g. `ds-test-waze-home-search-bar`).

### Phase 3: Write the test BEFORE the code
Create `DirtSync/DirtSyncUITests/<IssueID>WazeXxxTests.swift`:
- Encode each AC from `forge.issues.acceptance_criteria` as one `func testACN_...` method.
- Read every assertion from `app.descendants(matching: .any).matching(identifier: "ds-test-*").firstMatch.label` — never from MLNMapView state directly.
- Launch with `app.launchArguments = ["--uitesting", "--uitesting-waze-<screen>"]`.
- Add the 4 pbxproj entries (build-file + file-ref + group-child + sources-phase) exactly like DIRA263PlanADriveTriggerTests / DIRA266RoutePreviewTests.
- Run the suite. Expect RED. That red is the proof the test is wired.

### Phase 4: Fixtures
If the screen calls Mapbox Directions / Geocoding:
- Capture a real response once: `curl "https://api.mapbox.com/..." > DirtSync/DirtSyncApp/Resources/TestFixtures/<name>.json`
- Add to pbxproj as a bundle resource (PBXBuildFile + PBXFileReference + Resources group + PBXResourcesBuildPhase — 4 entries).
- Decode at runtime via a small private `Decodable` helper in the test factory. Never synthesize coordinates from math.

### Phase 5: Implement
- Every new Swift file goes under `DirtSync/DirtSyncApp/Waze/<Screen>/`.
- Entry gate: add a branch in `MapNavigationHelpers.handleUITestingArguments` (or a fresh `WazeLaunch.swift` router) that activates this screen on `--uitesting-waze-<screen>`.
- Publish probes from the screen's view layer, not from random singletons.
- Keep going until the test suite runs 5/5 green.

### Phase 6: Visual Critic
- `mcp__XcodeBuildMCP__launch_app_sim --args ["--uitesting", "--uitesting-waze-<screen>"]`
- Wait 8-10s for settlement.
- `mcp__XcodeBuildMCP__screenshot returnFormat=path`
- `Read` the screenshot + the Gold Star. Compare element-by-element. Grade ≥ Gold Star or LOOP BACK.

### Phase 7: Ship
- Commit with DIRA-NNN identifier in subject. Include the Before / Failed / After screenshots in the PR body.
- Post `[PROOF]` comment to the Forge issue with AC table + screenshot paths.
- `gh pr merge <n> --admin --squash --delete-branch`. Update forge.issues status to `done`.

## Gotchas (living list — add to this every run)

- **DIRA-266 v1 (2026-04-23):** Test factory synthesized alt routes by bowing the primary with cosine offsets. 5/5 green but the geometry crossed fields + houses. Lesson: probes verify counts, colors, zoom, duration-format — they cannot verify that polylines follow real roads. Always bundle real upstream responses as JSON fixtures. See `feedback_real_fixtures_not_synthesized.md`.

- **DIRA-266 v1 (2026-04-23):** Camera-fit guard `mapView?.userTrackingMode == .none` resolved `.none` as `Optional.none`. Combined with `let mapView = mapView` in the same guard, the block only ran when `mapView` was nil — contradiction, block never fired. Lesson: destructure the optional FIRST, then compare on enum values.
  ```swift
  // WRONG
  if mapView?.userTrackingMode == .none, let mapView = mapView { ... }
  // RIGHT
  if let mapView = mapView, mapView.userTrackingMode == .none { ... }
  ```

- **DIRA-266 v2 (2026-04-23):** Clamping `mapView.zoomLevel > 11.0` after `setCamera(withDuration: 0.5)` reads the PRE-animation zoom, not the fitted target. Long routes got clamped up to 11 and the destination fell off-screen. Lesson: use `setCamera(withDuration: 0, ...)` when you need to read zoom right after.

- **DIRA-266 (2026-04-23):** The probe `UITestSystemNameProbeLabel` was defined but never mounted in the view tree — tests failed with "probe must exist" until I added it as an overlay in `MapView.mapZStack`. Lesson: when adding new probes, grep for the probe View's instantiation site and confirm it's actually rendered.

- **DIRA-266 (2026-04-23):** AC5 (Visual Critic) is the gate the A-loop exists to enforce. All XCUITest probes can pass while the screenshot is still wrong (synthesized geometry, invisible pills, wrong colors). Never report ship until Visual Critic grade is signed off.

## Per-Screen Checklist (fill in for this issue)

- [ ] Gold Star saved to `/tmp/<issue-id>-gold-star.png`
- [ ] ACs read from `forge.issues.acceptance_criteria` (not paraphrased)
- [ ] Test file written BEFORE production code
- [ ] Probes added to `UITestMapProbe` if needed
- [ ] Bundle resources added to pbxproj if fixtures used
- [ ] Launch flag `--uitesting-waze-<screen>` wired in `MapNavigationHelpers.handleUITestingArguments`
- [ ] Production code only under `DirtSyncApp/Waze/<Screen>/`
- [ ] No imports of Trail*, Valhalla*, Hybrid*, MBTiles*
- [ ] Test suite 5/5 green on iPhone 16 Pro sim
- [ ] Simulator screenshot visually compared to Gold Star → grade ≥ Gold Star
- [ ] PR opened with Before / Failed / After screenshots
- [ ] [PROOF] comment on the Forge issue
- [ ] Admin-merged to `v2-road-first`
- [ ] Gotchas from this run appended to this skill
