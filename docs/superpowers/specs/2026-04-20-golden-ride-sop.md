# Golden Ride SOP — Field-to-Sim Regression Pattern

> Date: 2026-04-20
> Status: v1 draft — pilot on Fluvanna 2026-04-20 ride
> Owner: Steve (CEO) + DirtSync Simulator Specialist
> Companion manifest: `companies/dirtsync/golden-rides/2026-04-20-fluvanna/manifest.json`

## Why

Every DirtSync field test produces bugs. Today's 2026-04-20 Fluvanna 7.7mi drive produced 9 bugs (DIRA-208..216). Before today, each bug became an issue with a text description, got fixed in isolation, and merged with "build passes" as the only proof. Two months of that pattern left us merging bad PRs, shipping regressions, and losing Steve's confidence in the factory ("I have lost complete confidence in this system").

A Golden Ride is the antidote: **the real failing ride becomes the fixture that proves the fix**. Every fix gets replayed against the exact same GPS stream the phone saw in the field, and the bug either reproduces (baseline) or disappears (fixed). The sim becomes a deterministic regression oracle — not a generic harness, but a time-machine for that specific ride.

## What a Golden Ride Is

A Golden Ride is one failing field session, captured as a self-contained bundle, with:

1. **The GPS input** — the phone's actual track, as a GPX the sim can replay bit-for-bit.
2. **The human-visible proof** — screen recording from the phone, showing what the driver saw.
3. **The machine-visible proof** — app log export (stream captured during the ride, if available — else log patterns inferred from bug reports).
4. **The manifest** — human-annotated list of what went wrong, with exact log patterns / numeric thresholds / video timestamps serving as assertions.

Once that bundle exists, the sim has its north star. Run the GPX, capture identical artifacts, diff against the manifest, done.

## The Flywheel

```
  Field test (bad)      ←── Steve drives, app breaks, tries 9 things
        ↓
  Capture bundle        ←── GPX + mp4 + log + 9-bug manifest
        ↓
  Sim replay            ←── sim specialist runs --uitesting-gpx, captures same artifacts
        ↓
  Diff against manifest ←── each bug = pass/fail assertion
        ↓
  File issues per bug   ←── each owned by the right specialist
        ↓
  Specialist fixes      ←── PR merges on its own timeline
        ↓
  Sim re-replays        ←── new pass/fail table
        ↓
  All green?            ←── if no: back to specialist. if yes: Steve drives on device.
        ↓
  Device confirms?      ←── if no: manifest was wrong or sim/device parity broke. add assertion. rerun.
        ↓                    if yes: ride is dropped from active list; stays in regression suite forever.
  Ride closed (GOLD)
```

## Directory Layout

```
companies/dirtsync/golden-rides/<ride-id>/
├── manifest.json                     ← human-annotated bug list + assertions
├── README.md                         ← context (location, date, weather, notes)
├── field/
│   ├── track.gpx                     ← actual phone GPS (after upload to Supabase storage)
│   ├── device.mp4                    ← compressed screen recording
│   └── device.log                    ← app log if available (often reconstructed from bugs)
└── sim/
    └── <run-id>/
        ├── screen.mp4                ← simctl recordVideo
        ├── log.txt                   ← simctl spawn log stream
        ├── screenshots/              ← at manifest-specified timestamps
        └── assertions.json           ← per-assertion pass/fail result
```

GPX fixture ALSO lives in the DirtSync repo at two paths (per `ios-simulator-mastery.md` L-005):
- `DirtSync/DirtSyncApp/Resources/TestGPXRoutes/<name>.gpx` (for `--uitesting-gpx=` runtime load)
- `DirtSync/DirtSyncUITests/GPXRoutes/<name>.gpx` (for XCUITest-internal `GPXPlaybackLoader`)

## manifest.json Schema

```json
{
  "rideId": "YYYY-MM-DD-<location>",
  "source": { "rideRowId": "<dirtsync db uuid>", "startedAt": "...", "distanceMeters": 12293, "pointCount": 588 },
  "artifacts": { "gpxInAppBundle": "...", "gpxInTestBundle": "...", "fieldDeviceVideoCompressed": "..." },
  "bugs": [
    {
      "id": "DIRA-208",
      "priority": "P0",
      "title": "...",
      "ownerSpecialist": "Feature Builder | Map Rendering Expert | Nav HUD Polish Expert | etc.",
      "assertions": [
        { "id": "...", "type": "logContains | logExcludes | logPattern | videoFrameMatch | customCheck",
          "pattern": "...",  "expected": {"op": "= | >= | <= | > | <", "value": N},
          "actualFromField": N, "rationale": "..." }
      ]
    }
  ],
  "passCriteria": "...",
  "prerequisites": ["DIRA-219: ..."],
  "orchestrationContract": "..."
}
```

## Assertion Types (v1)

| Type | How sim evaluates | Notes |
|---|---|---|
| `logContains` | `grep -c <pattern>` in `log.txt`; compare to `expected.op`/`value` | Cheap, deterministic. Preferred. |
| `logExcludes` | Count should be 0. | The "don't regress" version. |
| `logPattern` | Multi-term AND/NOT expression. | For compound conditions like "X happens but NOT followed by Y". |
| `videoFrameMatch` | Human review OR vision judge at specific timestamp. | Expensive. Use only when no log signal exists. |
| `customCheck` | Agent evaluates a described rule. | Escape hatch. Document the method clearly. |

**Preference order:** logContains > logExcludes > logPattern > customCheck > videoFrameMatch. Always prefer log-based; videoFrameMatch is the last resort.

## Sim Specialist "golden-ride" Mode

The DirtSync Simulator Specialist (`companies/dirtsync/agents/sim-specialist/`) gains a new dispatch mode. When an issue with tag `golden-ride` or prefix `DIRA-2XX Golden Ride Replay` is assigned:

1. **Load manifest** from `companies/dirtsync/golden-rides/<ride-id>/manifest.json`
2. **Verify prerequisites** are unblocked (e.g. MapLibre crash fixed). If blocked, post `[BLOCKED]` with the blocker.
3. **Boot + build + install** latest DirtSync from the nav-fix branch under evaluation.
4. **Launch** with `--uitesting-gpx=<manifest.source.gpxBundleName>`.
5. **Capture** `sim/<run-id>/` with full evidence bundle.
6. **Evaluate** every assertion per type. Write `assertions.json`:
   ```json
   { "ranAt": "...", "branchSha": "...", "assertions": [{ "id": "...", "result": "pass | fail | inconclusive", "actual": ..., "note": "..." }] }
   ```
7. **Upload** evidence + assertions.json to `artifacts/golden-rides/<ride-id>/sim/<run-id>/`.
8. **Post `[PROOF]`** comment on the parent Golden Ride issue:
   - Pass/fail table: N rows, 1 per bug, 1 per assertion
   - For each failing assertion: suggested `@<specialist>` for pickup
   - Overall verdict: `PASS` (all green) / `PARTIAL` (some green) / `FAIL` (baseline — first run, nothing fixed yet)
9. **Do NOT modify production code** (standing boundary).

## Loop Until Green

- Sim specialist NEVER claims GOLD. Always `PARTIAL` or `FAIL` until every assertion is green.
- Each failing assertion becomes a child issue (or an existing issue is updated with the latest sim evidence).
- Specialists fix in their own PRs. On merge, the parent Golden Ride issue re-dispatches the sim specialist automatically (via mention-watcher, existing orchestrator loop).
- Sim re-runs. New assertions.json. New `[PROOF]` comment. Some green, some still red. Repeat.
- When a sim run produces all green: status flips to `ready-for-device-test`. Tag Steve in the comment with a link to the clean evidence bundle.
- Steve drives the actual ride on device (not sim). On-device pass → parent issue marked `GOLD`, ride joins the regression suite.

## First Pilot: Fluvanna 2026-04-20

**Not yet runnable** — blocked by DIRA-219 (iOS 26.4 MapLibre crash). Specialist cannot launch the sim to completion.

**Prep complete tonight (2026-04-21 early UTC):**
- [x] Ride identified: `7f3d30f8-9bc1-4887-aaa9-a0c9327cb468` (588 pts, 682s, 12,293m)
- [x] GPX extracted from `rides.route_geojson` → `/tmp/fluvanna-2026-04-20.gpx` (73 KB, XML-valid, 588 `<trkpt>` with correct timestamps)
- [x] mp4 compressed: 1.2 GB → ~150 MB (720p H.264 CRF 28)
- [x] Manifest written with 9-bug assertions (mostly `logContains`/`logExcludes`; DIRA-214..216 are `videoFrameMatch` — humanReview for v1)
- [x] `ios-simulator-mastery.md` patched with L-004/L-005/L-006 corrections
- [x] Issues DIRA-219 (MapLibre blocker) + DIRA-220 (Golden Ride Replay #1) filed

**Morning handoff:**
- Commit GPX to DirtSync repo (pbxproj wiring — prefer replacing the placeholder `field-2026-04-20-west-river-corridor.gpx` in PR #417 with real Fluvanna data + rename)
- Upload `field/device.mp4` and `field/track.gpx` to `artifacts/golden-rides/2026-04-20-fluvanna/field/`
- Dispatch Map Rendering Expert to DIRA-219 (MapLibre crash) — critical path
- Once DIRA-219 merged: dispatch Sim Specialist to DIRA-220 in golden-ride mode — first baseline run

## Why This Is Different From Our Prior Work

- **Ralph Loop** = one agent, subjective reflection, text feedback. **Anvil Loop** = specialist team, pixel/log verification, persistent lessons. Golden Ride = Anvil Loop **scoped to one real ride** as the regression oracle.
- **Test fixtures written before code** are abstract and don't reflect reality. **Golden Ride fixtures = reality**, with bug list pre-filed from actual observation.
- **"Build passes"** tells us the code compiled. **Golden Ride PASS** tells us the code reproduces the exact same GPS-to-UX behavior Steve wanted on the actual drive he did.

## Success Criteria for this SOP (v1)

This SOP is valuable if it achieves:

1. **Fluvanna replay produces a FAIL baseline** showing all 9 bugs — proves sim faithfully reproduces field.
2. **Every `[PROOF]` run narrows the failing assertion set** — each specialist PR moves at least one assertion from RED to GREEN.
3. **All 9 green in the sim → Steve drives the real ride again → field retest passes** — proves sim/device parity holds.
4. **The Fluvanna ride never regresses in subsequent Golden Rides** — regression suite value.

If any of 1-4 breaks, the SOP needs revision. Document each break as a new LESSONS entry.

## Known Limitations

- **videoFrameMatch assertions require human or vision-judge review** — not fully automated yet. v2 will bake in `dispatcher/visual-verify.ts:254 visionJudge()` with semantic prompts.
- **Sim/device parity** is assumed. If a fix works in sim but fails on device (à la DIRA-198), we add a new assertion type `deviceOnlyCheck` and make the Golden Ride cycle include a forced device retest.
- **Today's ride lacks a captured device log**. We're inferring expected log patterns from the bug descriptions' "## Evidence" blocks. If any assertion fails because the pattern itself is wrong (not because the bug isn't fixed), we refine the manifest before blaming the fix.

## Next Rides (queued)

- `2026-04-09-kidds-dairy` (retroactive — first field test we have assets for)
- `2026-04-18-burning-rock` (Daniel Test failure, post-DIRA-202)
- Every future field test auto-enters the SOP

---

*One ride. One bundle. Infinite replays. This is the flywheel.*
