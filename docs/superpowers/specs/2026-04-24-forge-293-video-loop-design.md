# FORGE-293 — Video-Diff Quality Gate (Ralph Loop w/ Vision)

**Status:** Design approved 2026-04-24
**Owner:** CEO (acting: Claude Opus 4.7)
**Target ship:** within 48h — gates every DirtSync ticket after it lands
**Parent vision:** [factory vision doc TBD] — video is the Gold Star input; CEO decomposes video → tickets → teams

## Problem

Last night the factory shipped 4 Waze-parity screens (DIRA-267/269/270/271). All passed XCUITest + single-frame Visual Critic. On-device, the search sheet *freezes* the instant the keyboard appears — 6× `NaN to CoreGraphics`, `RTIInputSystemClient` timeout, 3-second accumulator failure. The factory's gate did not catch this because:

- **Spec writes existence-only ACs:** "search bar exists + is hittable + sheet probe flips to open." Never: "type text, keyboard appears cleanly, no NaN in device log."
- **Visual Critic grades a single screenshot.** A still frame cannot detect a layout collapse during keyboard animation.
- **Test Runner ignores device log.** NaN / CG numeric / RTI timeout errors flow past.
- **Sim test ≠ device test.** Simulator keyboard behaves differently from device keyboard. `feedback_simulator_test_not_enough` memory was known but not enforced by the pipeline.

Result: factory is 9/10 on infrastructure, 5/10 on what ships. Ceiling is the test gate.

## Vision

> Vision-guided Ralph Loop where **video diff is the exit condition** and **tests are the guardrails.**

Every ticket ships attached to a **reference video** — either a canonical clip of the competing product (Waze, etc.) doing the same interaction, or an internal reference recorded from a known-good build. The Fixer ↔ Test Runner inner loop exits only when:

1. All XCUITest ACs green, AND
2. Test Runner captured a candidate video during the run, AND
3. Video Critic's diff score against the reference is below threshold, AND
4. No `NaN` / `CG_NUMERICS` / `RTIInputSystem.*timeout` strings in the device log.

If any gate fails, Fixer re-enters with the specific failure delta. Capped at 5 iterations; 6th failure escalates to CEO.

## Architecture

### New stage: `video_critic` (inserted between `test_runner` and `visual_critic`)

Pipeline post-upgrade:

```
SPEC
 → CODER
 → TEST_RUNNER (now captures video + greps log)
 → VIDEO_CRITIC (new)  ← replaces single-frame visual_critic for video-loop tickets
 → FIXER ↔ (TEST_RUNNER + VIDEO_CRITIC) up to 5 cycles
 → SHIPPER
```

Single-frame `visual_critic` stays for tickets with no interactive component (e.g., pure render-only map tickets). Ticket schema adds `forge.issues.video_loop_required boolean default true`.

### Agents

| Role | Status | Notes |
|---|---|---|
| Spec | retool (skill update) | AC format adds *Interaction* + *Device-log* + *Video-segment* rows |
| Test Runner | retool (skill + orchestrator script) | Wraps `xcrun simctl io <UDID> recordVideo --codec=h264 /tmp/candidate.mp4` around `xcodebuild test`; tails device log; uploads both to Drive |
| Video Critic | **hire** | Opus-4.7, vision enabled. Samples N frames from reference + candidate at matched timestamps, returns diff score 0–100 + structured fail-frames |
| Visual Critic | retire | Superseded for video-loop tickets; kept for static-render tickets |
| Fixer | unchanged contract | Receives failure delta from Video Critic + device-log grep; scoped to `files_to_touch` |
| Factory Upgrader | **hire** | Sonnet, MCMForge-scoped coder. Ships skill files, SQL migrations, orchestrator scripts. Distinct from DirtSync Coder (Map Rendering Expert) |

### Reference video storage

Reference lives in Drive under `MCM Forge Proof/{company}/{IDENTIFIER} — {title}/reference.mp4` with anyone-with-link read. Ticket body embeds the Drive share URL. Test Runner downloads it before each run via `gws drive files get --output`. Candidate video uploads alongside as `candidate-run-{run_id}.mp4`.

### Video Critic algorithm (v1 — strict mirror)

**Input:**
- Reference URL (Drive)
- Candidate URL (Drive)
- Ticket-specific interaction manifest from Spec (e.g., `{"t+2s": "keyboard appears", "t+4s": "first result row visible", "t+6s": "route preview shown"}`)

**Process:**
1. Download both clips.
2. Sample at **fixed 0.5-sec intervals** (60 frames per 30-sec clip).
3. Pair matched timestamps.
4. For each pair: Opus vision call with both frames + the interaction manifest entry nearest that timestamp. Returns `{match_score: 0-100, deltas: ["keyboard missing", "layout shifted right 120px", ...]}`.
5. Aggregate: overall `diff_score = 100 - mean(match_score)`; fail if `diff_score > 15` OR any single frame `match_score < 70`.

**Output artifact:**
```json
{
  "ticket": "DIRA-277",
  "diff_score": 22,
  "approved": false,
  "fail_frames": [
    {"t": 3.0, "match_score": 12, "delta": "keyboard failed to appear; NaN layout collapse"}
  ],
  "device_log_findings": ["CG_NUMERICS x6", "RTIInputSystem timeout x1"]
}
```

**v2 — semantic match** (post-parity, deferred to a separate spec): candidate must *exhibit the same behavior* as reference but layout/color may differ. Needed for "better than Waze" tickets.

### Test Runner upgrade

Wrapper script on Mini: `forge-orchestrator/scripts/forge-test-runner-video.sh`

```
PRECONDITION: $TICKET_ID, $BRANCH, $REFERENCE_DRIVE_ID in env
1. git checkout $BRANCH && xcodebuild build for iPhone 17 Pro sim
2. Boot sim if needed; install app.
3. Start: xcrun simctl io $UDID recordVideo --codec=h264 /tmp/$TICKET_ID-candidate.mp4 &
4. Start: xcrun simctl spawn $UDID log stream --level=debug > /tmp/$TICKET_ID-device.log &
5. Run: xcodebuild test -scheme DirtSync -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:DirtSyncUITests/$TICKET_ID…
6. Stop recording + log stream.
7. Grep log for /NaN|CG_NUMERICS|RTIInputSystem.*timeout|Result accumulator timeout/. Emit findings.
8. Upload candidate video + log to Drive under the ticket folder.
9. Emit stage_artifact JSON { test_passed, candidate_drive_id, device_log_drive_id, log_findings[] }.
```

Exit 0 only if test_passed AND log_findings.length == 0. Otherwise exit 65 → triggers Fixer.

### Spec skill upgrade (`forge-spec.md`)

New required AC categories. Every interactive ticket must have at least one row per category:

| Category | Example row |
|---|---|
| **Existence** (old) | "waze-search-bar element exists with identifier X" |
| **Interaction** (NEW) | "Tap waze-search-bar → TextField receives focus → typing 'Rich' updates query value to 'Rich' within 1s" |
| **Device-log** (NEW) | "Device log contains zero occurrences of /NaN\|CG_NUMERICS\|RTI.*timeout/ during the 0→8s window" |
| **Video-segment** (NEW) | "Seconds 2.0–4.0 of candidate.mp4 show keyboard rising from bottom without layout shift; match reference at same seconds within 15 diff-score" |

Ticket rejected at `advance_stage_on_success()` if missing any NEW category row. Enforced via trigger-level check on `stage_artifact.output_json.ac_categories[]`.

### Database changes

```sql
ALTER TABLE forge.issues
  ADD COLUMN video_loop_required boolean NOT NULL DEFAULT true,
  ADD COLUMN reference_video_drive_id text,
  ADD COLUMN diff_threshold integer NOT NULL DEFAULT 15;

CREATE TABLE forge.video_diff_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES forge.runs(id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES forge.issues(id),
  reference_drive_id text NOT NULL,
  candidate_drive_id text NOT NULL,
  diff_score int NOT NULL,
  approved boolean NOT NULL,
  fail_frames jsonb NOT NULL DEFAULT '[]',
  device_log_findings jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_diff_runs_issue_idx ON forge.video_diff_runs (issue_id, created_at DESC);
```

`advance_stage_on_success()` gains two guards:
1. **Identifier match:** reject `stage_artifact` if `output_json.identifier != issues.identifier` (fixes last session's 4/4 Spec drift).
2. **Video-loop completion:** reject advance from `video_critic` unless `output_json.approved=true` AND corresponding `video_diff_runs.device_log_findings = '[]'`.

## Out of scope (tonight)

- Semantic-match mode (v2, separate spec)
- Event-driven frame sampling (v1 uses fixed 0.5s interval)
- On-device test execution (v1 is simulator only; on-device captured via Steve's manual field test until we rig a TestFlight feedback loop)
- Video Critic running on candidate clips longer than 60 seconds
- Multi-company factory isolation (sub-project D, separate spec)
- Video ingestion pipeline (sub-project A, separate spec)

## First ticket shipped through new gate: DIRA-277

**Bug:** Waze Home search sheet freezes on tap. NaN to CoreGraphics + RTI input timeout.

**Reference clip:** `https://drive.google.com/file/d/1oZmbW3yVpf_TCqRcm-Ah0TfMnuVcJkP5/view` (Steve's 30-sec Waze iOS recording: tap search → type "KT Jewelers" → tap first result → route preview loads).

**Gate proof:** Before FORGE-293, current factory would ship a NaN-regression fix that the Visual Critic rubber-stamps. After FORGE-293, Video Critic sees the freeze frames (candidate shows no keyboard at t+2s while reference shows keyboard rising), diff_score > 15, `device_log_findings` non-empty → Fixer re-enters. Exit only when sim-side freeze is fully gone.

## Success criteria (FORGE-293 itself)

1. Factory Upgrader ships all schema migrations + 3 new/updated skills + 1 new orchestrator script on a PR to MCMForge main.
2. DIRA-277 filed with reference clip linked.
3. DIRA-277 goes through the full pipeline; Video Critic fails the first Coder attempt (correctly); Fixer patches; re-run passes; Shipper merges.
4. Steve field-tests DIRA-277 on-device → search + keyboard + result tap works cleanly.
5. Post-ship retro: factory reliability score re-rated at 7+/10.

## Risks

- **Opus video cost:** 60 frames × 2 clips × ~1k tokens output = ~$0.30 per Video Critic run. Budget $1.00/ticket max. Gate at trigger level.
- **Drive throughput:** 11MB reference + 11MB candidate per run = tolerable. Only concern if we scale to 20 tickets/day.
- **Mini disk:** Video capture + device log = ~50MB per run. Purge >7 days old files via cron.
- **Reference clip availability:** Every interactive ticket needs a reference. Steve recording 30-sec clips is the M1 mechanism; M2 automates capture from known-good builds.
