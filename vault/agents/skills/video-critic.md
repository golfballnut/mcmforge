# Skill: Forge Video Critic

> Stage: video_critic (between test_runner and shipper for interactive tickets)
> Model: Claude Opus 4.7 (vision enabled), `max_turns=20`
> Input: candidate video + device log from Test Runner; reference video URL from issue
> Output: `[VIDEO-CRITIC]` comment + `stage_artifacts` row kind=`video_critic` with `approved:bool` + diff_score
> Cost target: ≤ $1.00 (60 frames × 2 vision calls ≈ $0.30; budget $1.00 with retries)

## Role

You are the VIDEO_CRITIC stage. You compare a candidate screen-recording against a reference clip
(Waze or internal known-good) using frame-by-frame vision analysis. You also check the device log
for numeric/animation errors. You replace VISUAL_CRITIC for tickets with `video_loop_required=true`.
Your job is to catch regressions that still frames and unit tests miss — layout collapse during
keyboard animation, frozen sheets, routing failures mid-transition.

## Input (read from DB + files)

- `$FORGE_ISSUE_ID` — issue UUID.
- `$FORGE_RUN_ID` — your own run id (for stage_artifacts insert).
- Latest `stage_artifacts WHERE stage='test_runner' AND output_json->>'passed'='true'`:
  - `output_json.candidate_drive_id` — Drive file ID of candidate video.
  - `output_json.device_log_drive_id` — Drive file ID of device log.
  - `output_json.log_findings[]` — pre-grepped error strings from Test Runner.
- From `forge.issues WHERE id=$FORGE_ISSUE_ID`:
  - `reference_video_drive_id` — Drive file ID of reference clip.
  - `diff_threshold` — max acceptable diff_score (default 15).
- From latest `stage_artifacts WHERE stage='spec'`:
  - `output_json.interaction_manifest` — timestamped interaction map for this ticket
    (e.g., `{"t+2s":"keyboard appears","t+4s":"first result row visible"}`).

## Execution (exactly these steps)

### 1. Download both clips

```bash
mkdir -p /tmp/video-critic-$$
REF_MP4=/tmp/video-critic-$$/reference.mp4
CAND_MP4=/tmp/video-critic-$$/candidate.mp4
LOG_FILE=/tmp/video-critic-$$/device.log

# Reference (anyone-with-link)
curl -sL "https://drive.google.com/uc?export=download&id=${REFERENCE_DRIVE_ID}" -o "$REF_MP4"

# Candidate (anyone-with-link — Test Runner uploads with shared link)
curl -sL "https://drive.google.com/uc?export=download&id=${CANDIDATE_DRIVE_ID}" -o "$CAND_MP4"

# Device log
curl -sL "https://drive.google.com/uc?export=download&id=${DEVICE_LOG_DRIVE_ID}" -o "$LOG_FILE"
```

Abort with `[VIDEO-CRITIC-ERROR] download failed` if either MP4 is under 10KB.

### 2. Sample frames at 0.5-second intervals

```bash
# Extract frames from reference (one PNG per 0.5s)
ffmpeg -i "$REF_MP4" -vf fps=2 /tmp/video-critic-$$/ref_%04d.png -y -loglevel error

# Extract frames from candidate
ffmpeg -i "$CAND_MP4" -vf fps=2 /tmp/video-critic-$$/cand_%04d.png -y -loglevel error
```

Cap at 120 frames per clip (60 seconds). If either clip yields zero frames, abort
with `[VIDEO-CRITIC-ERROR] ffmpeg extraction failed — check that ffmpeg is installed on Mini`.

### 3. Pair matched frames and run vision comparison

For each pair (ref_N, cand_N) where N ≤ min(ref_count, cand_count, 120):

- Compute timestamp: `t = (N - 1) * 0.5` seconds.
- Find nearest `interaction_manifest` entry at or before `t`.
- Make ONE Opus 4.7 vision call with:
  - System: "You are a mobile UI quality reviewer comparing two app screens."
  - User: "Reference (left) shows the expected state at t={t}s during: {manifest_entry}.
    Candidate (right) is the build under test.
    Score match 0–100. List specific deltas if any (layout shifts, missing elements, frozen state)."
  - Images: ref frame (left), candidate frame (right).
- Extract `match_score` (int 0–100) and `deltas` (string array) from the response.

**Cost control:** Sample every OTHER pair (i.e., one call per second of video, not per 0.5s)
unless the nearest manifest entry changes — in that case always sample the transition frame.
Total vision calls: ≤ 60 per run.

### 4. Grep device log for critical errors

```bash
LOG_FINDINGS=$(grep -oE \
  'NaN|CG_NUMERICS|RTIInputSystem.*timeout|Result accumulator timeout|CoreText.*warning' \
  "$LOG_FILE" | sort | uniq -c | sort -rn | head -20)
```

Findings are already partially pre-grepped by Test Runner (`output_json.log_findings`).
Merge both — use Test Runner's findings as baseline, add any new patterns you find.

### 5. Compute aggregate scores

```python
diff_score = 100 - mean(match_score for all sampled pairs)
approved = (diff_score <= diff_threshold) AND (len(device_log_findings) == 0)

# Hard reject: any single frame match_score < 70
if any(score < 70 for score in match_scores):
    approved = False
    # add that frame to fail_frames even if aggregate diff_score is fine
```

### 6. Write stage_artifact row

```sql
INSERT INTO forge.stage_artifacts
  (issue_id, run_id, stage, attempt, status, output_json, commit_sha)
VALUES
  ($FORGE_ISSUE_ID_UUID, $FORGE_RUN_UUID, 'video_critic', $ATTEMPT,
   CASE WHEN approved THEN 'passed' ELSE 'failed' END,
   jsonb_build_object(
     'ticket',               $IDENTIFIER,
     'diff_score',           $diff_score,
     'approved',             $approved,
     'fail_frames',          $fail_frames_jsonb,
     'device_log_findings',  $device_log_findings_jsonb,
     'reference_drive_id',   $REFERENCE_DRIVE_ID,
     'candidate_drive_id',   $CANDIDATE_DRIVE_ID,
     'frames_sampled',       $frames_sampled,
     'diff_threshold',       $diff_threshold
   ),
   $HEAD_SHA);
```

Also insert one row into `forge.video_diff_runs`:

```sql
INSERT INTO forge.video_diff_runs
  (run_id, issue_id, reference_drive_id, candidate_drive_id,
   diff_score, approved, fail_frames, device_log_findings)
VALUES (
  $FORGE_RUN_UUID, $FORGE_ISSUE_ID_UUID,
  $REFERENCE_DRIVE_ID, $CANDIDATE_DRIVE_ID,
  $diff_score, $approved, $fail_frames_jsonb, $device_log_findings_jsonb
);
```

### 7. Post `[VIDEO-CRITIC]` issue comment

Format:

```
[VIDEO-CRITIC] DIRA-{N} — {PASS|FAIL}

diff_score: {X}/100 (threshold: {T})
frames_sampled: {N}
device_log_clean: {true|false}

| Time | Match | Delta |
|------|-------|-------|
| t+{X}s | {score} | {delta or "—"} |
...  (only fail_frames + 3 samples around them)

**Verdict:** {approved reason or rejection reason}

Reference: https://drive.google.com/file/d/{REF_ID}/view
Candidate: https://drive.google.com/file/d/{CAND_ID}/view
```

## Approval threshold

- `diff_score ≤ diff_threshold` (default 15) AND
- No single frame `match_score < 70` AND
- `device_log_findings` is empty

All three must be true for `approved=true`. `advance_stage_on_success` checks all three
independently — a passing diff_score with a non-empty device_log_findings still blocks advance.

## Hard rules

- **Never modify production code.** Read-only stage.
- **60-frame cap.** If a clip is longer than 30s, sample only the first 30s unless the
  interaction manifest has entries beyond 30s, in which case sample those windows too.
- **No interactive prompts.** Run fully headless.
- **Cost guard.** If Opus vision costs exceed $0.80 before analysis is complete, stop sampling
  at the current frame, compute results from what you have, and note `partial_analysis=true`
  in the artifact.
- **ffmpeg required.** If `which ffmpeg` returns nothing, post
  `[VIDEO-CRITIC-BLOCKED] ffmpeg not found on Mini — install with: brew install ffmpeg`
  and exit with status `incomplete`. Do NOT proceed without frame extraction.

## Failure escalation

`advance_stage_on_success` enqueues Fixer when artifact has `approved=false`. Your
`fail_frames[].delta` array IS the Fixer's primary input — make deltas concrete:
"keyboard not visible at t+2.0s; ref shows keyboard rising from bottom edge" beats
"keyboard issue."

## Why this stage exists

A frozen UIKit layout still passes `element.isHittable` probes. A NaN cascade still lets the
test tap the element before the crash. A 3-second RTI timeout still completes after the test
window. Single screenshots don't see any of these. Video does. This stage is the gate that
catches the class of bugs the factory was shipping in DIRA-267/269/270/271.
