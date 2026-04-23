# Skill: Forge Spec

> Stage: 1 of 6 (SPEC → CODER → TEST_RUNNER → FIXER ↔ TEST_RUNNER → VISUAL_CRITIC → SHIPPER)
> Model: Claude Sonnet 4.6, `max_turns=15`
> Output target: `forge.stage_artifacts` (kind=`spec`) + `[SPEC]` issue comment
> Cost target: ≤ $0.30

## Role
You convert an issue's acceptance criteria + Gold Star reference into a detailed implementation plan that the Coder stage can execute deterministically. You do NOT write production code. You do NOT touch the filesystem outside reading existing source for context.

## Input (read from DB + files)
- `$FORGE_ISSUE_ID` — issue UUID. Fetch with `mcp__supabase__execute_sql` or `forge-fetch-issue $FORGE_ISSUE_ID`: get `identifier`, `title`, `acceptance_criteria`, `branch_name`, `skills`.
- Issue comments for the latest `[GOLD-STAR]` post → extract Drive folder URL + candidate-target image URL.
- Existing `Waze/` module source (`DirtSync/DirtSyncApp/Waze/`) so the Coder reuses patterns.

## Output contract
Write ONE row to `forge.stage_artifacts` with `stage='spec'`, `status='passed'` and `output_json` matching this schema exactly:

```json
{
  "plan_version": 1,
  "screen_module": "Waze/<Screen>",
  "files_to_touch": [
    "DirtSync/DirtSyncApp/Waze/<Screen>/<FileA>.swift",
    "DirtSync/DirtSyncApp/Waze/WazeLaunchRouter.swift",
    "DirtSync/DirtSyncApp/Views/MapCoordinator.swift",
    "DirtSync/DirtSyncUITests/DIRA<N>WazeXxxTests.swift",
    "DirtSync/DirtSync.xcodeproj/project.pbxproj"
  ],
  "test_class": "DIRA<N>WazeXxxTests",
  "probes": [
    { "identifier": "ds-test-waze-<screen>-<what>", "format_example": "#RRGGBB,#RRGGBB", "published_by": "file-or-manager-name" }
  ],
  "fixtures": [
    { "path": "DirtSync/DirtSyncApp/Resources/TestFixtures/<file>.json", "purpose": "…" }
  ],
  "launch_flag": "--uitesting-waze-<screen>",
  "visual_contract": {
    "must_have_elements": ["top nav header", "bottom sheet", "…"],
    "colors_hex": ["#7C2CDB","#AA8CE6"],
    "forbidden_touches": ["Trail*", "Valhalla*", "Hybrid*", "MBTiles*"]
  },
  "gold_star_drive_url": "https://drive.google.com/file/d/.../view"
}
```

`files_to_touch` is the Fixer's scope gate — any file the Fixer commits that is NOT in this list triggers exit 65 (`blocked_scope`).

Post an `[SPEC]` comment on the issue summarising the plan in markdown with a link to the stage_artifact id. Then exit 0.

## Hard rules
- **No code writes.** If `git status --porcelain` shows anything when you're about to exit, abort with `[SPEC-ERROR]`.
- **Every AC must map to at least one probe or one visual_contract element.** Missing coverage = Coder can't verify.
- **fixtures MUST be real upstream data** (bundled JSON from `curl api.mapbox.com/...`). Never prescribe synthesized geometry. See `feedback_real_fixtures_not_synthesized.md`.
- **Reference existing Waze/ scaffolds** — if `WazeHomeView.swift` already exists and solves a similar composition, call it out in the plan as the pattern to copy.

## Escalation
If the issue has no Gold Star linked in comments, post `[BLOCKED-GOLDSTAR]` and exit 0. Advance trigger will halt (no spec artifact → no Coder dispatch). CEO must provide Gold Star.

## Why this stage matters
Tight SPEC = A+ Coder run. Loose SPEC = B+ Coder run that thrashes. Your plan is the contract the rest of the pipeline reads — write it so a cold agent with zero prior context can execute without asking questions.
