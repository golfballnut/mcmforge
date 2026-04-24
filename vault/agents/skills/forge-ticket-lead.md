# Skill: Forge Ticket Lead

> Role: Stateful orchestrator for one ticket end-to-end. Holds identity; specialists are stateless subagents.
> Model: Claude Sonnet 4.6 (or Opus 4.7 for complex tickets), `max_turns=200`
> Env: `CLAUDE_CODE_FORK_SUBAGENT=1` (required — enables true process-isolated Task() calls)
> Budget: ≤ $12 per ticket ($2/stage × 6 stages)
> Scope: One `forge.issues` row per Lead session. NEVER crosses ticket boundaries.

## Why This Exists

The old factory triggered stage advances via SQL (`advance_stage_on_success()`). Stage agents held `session_id` conversation memory. Result: DIRA-277 Spec agent woke via `continue_work` heartbeat and wrote specs for DIRA-273/274 instead. Coder ran 2.5h on wrong code. $25+ burned.

The Ticket Lead pattern fixes this: **one long-lived session IS the ticket's identity**. Every specialist is spawned fresh via `Task()`, returns a structured result, and dies. The Lead remembers; the subagents don't need to.

## Input

Each dispatch provides:
- `$FORGE_ISSUE_ID` — issue UUID (required)
- `$FORGE_ISSUE_IDENTIFIER` — e.g. `DIRA-277` (required, confirmed from DB, not context)

Read on startup:
```sql
SELECT identifier, title, description, acceptance_criteria, branch_name,
       video_loop_required, reference_video_drive_id, diff_threshold,
       ticket_lead_run_id, use_ticket_lead
FROM forge.issues WHERE id = '$FORGE_ISSUE_ID';
```

Confirm `use_ticket_lead = true`. If false, abort with `[LEAD-ABORT] use_ticket_lead=false on this issue — route to legacy stage pipeline`.

Confirm `identifier = $FORGE_ISSUE_IDENTIFIER`. If mismatch, abort with `[LEAD-ABORT] identifier mismatch`.

## Core Loop

```
1. Read ticket from DB (see Input above)
2. Write ticket_lead_run_id = current_run_id to forge.issues
3. Post [LEAD-START] comment with identifier + planned stages
4. Loop until shipped or abort:
   a. Determine current stage based on stage_artifacts history
   b. Build subagent prompt (see Subagent Templates below)
   c. Call Task() with subagent prompt + FRESH context (no session memory)
   d. Parse structured return — validate identifier matches
   e. Write stage_artifact row for this stage
   f. Post [LEAD-STATUS] comment with subagent summary + cost-to-date
   g. If stage failed AND fixer budget remains: loop to fixer
   h. If stage succeeded: advance to next stage
5. On final ship: post [SHIP] comment, set issue status=done, exit
```

Stages in order: `spec → coder → test_runner → video_critic (or visual_critic) → fixer ↔ test_runner → shipper`

## Subagent Prompt Templates

Each `Task()` call receives **only** what is listed below — no extra context. This is intentional.

### Spec Subagent
```
You are the SPEC stage for ticket $FORGE_ISSUE_IDENTIFIER.
Skill: vault/agents/skills/forge-spec.md (read it, follow exactly)
Issue ID: $FORGE_ISSUE_ID
Task: Write the XCUITest spec and interaction manifest for this ticket.
Return JSON: { identifier, test_class, files_to_touch[], acceptance_criteria[], interaction_manifest{} }
Hard rule: output_json.identifier MUST equal "$FORGE_ISSUE_IDENTIFIER". Any other value = drift. Abort and return { "error": "identifier_mismatch" }.
```

### Coder Subagent
```
You are the CODER stage for ticket $FORGE_ISSUE_IDENTIFIER.
Skill: vault/agents/skills/forge-coder.md (read it, follow exactly)
Issue ID: $FORGE_ISSUE_ID
Spec artifact: $SPEC_OUTPUT_JSON
Task: Implement production code and commit on branch $BRANCH_NAME.
Post a [PROOF] comment with Drive artifact link before exiting.
Return JSON: { identifier, commit_sha, files_changed[], branch_name, build_passed }
Hard rule: identifier MUST equal "$FORGE_ISSUE_IDENTIFIER".
```

### Test Runner Subagent
```
You are the TEST_RUNNER stage for ticket $FORGE_ISSUE_IDENTIFIER.
Skill: vault/agents/skills/forge-test-runner.md (read it, follow exactly)
Issue ID: $FORGE_ISSUE_ID
video_loop_required: $VIDEO_LOOP_REQUIRED
reference_video_drive_id: $REFERENCE_VIDEO_DRIVE_ID
Branch: $BRANCH_NAME
Test class: $TEST_CLASS
Task: Run the xcodebuild test + video capture (if video_loop_required=true).
Return JSON: { identifier, passed, failed_tests[], candidate_drive_id, device_log_drive_id, log_findings[] }
Hard rule: identifier MUST equal "$FORGE_ISSUE_IDENTIFIER".
```

### Video Critic Subagent
```
You are the VIDEO_CRITIC stage for ticket $FORGE_ISSUE_IDENTIFIER.
Skill: vault/agents/skills/video-critic.md (read it, follow exactly)
Issue ID: $FORGE_ISSUE_ID
Candidate Drive ID: $CANDIDATE_DRIVE_ID
Reference Drive ID: $REFERENCE_VIDEO_DRIVE_ID
Device log findings: $LOG_FINDINGS
Interaction manifest: $INTERACTION_MANIFEST
Diff threshold: $DIFF_THRESHOLD
Task: Frame-diff the candidate against reference. Reject if diff_score > threshold OR any frame < 70 OR log_findings non-empty.
Return JSON: { identifier, diff_score, approved, fail_frames[], rejection_reason }
Hard rule: identifier MUST equal "$FORGE_ISSUE_IDENTIFIER".
```

### Visual Critic Subagent (static tickets only)
```
You are the VISUAL_CRITIC stage for ticket $FORGE_ISSUE_IDENTIFIER.
Skill: vault/agents/skills/visual-critic.md (read it, follow exactly)
Issue ID: $FORGE_ISSUE_ID
Task: Screenshot the simulator output and compare against Gold Star reference.
Return JSON: { identifier, score, approved, notes }
Hard rule: identifier MUST equal "$FORGE_ISSUE_IDENTIFIER".
```

### Fixer Subagent
```
You are the FIXER stage for ticket $FORGE_ISSUE_IDENTIFIER (fix cycle $FIX_CYCLE of 5).
Skill: vault/agents/skills/forge-fixer.md (read it, follow exactly)
Issue ID: $FORGE_ISSUE_ID
Coder artifact: $CODER_OUTPUT_JSON
Test failure: $TEST_RUNNER_OUTPUT_JSON
Critic rejection: $CRITIC_OUTPUT_JSON
Task: Identify root cause, patch code, commit. Budget 1 commit per cycle.
Post a [PROOF] comment with Drive artifact link before exiting.
Return JSON: { identifier, commit_sha, hypothesis, files_changed[] }
Hard rule: identifier MUST equal "$FORGE_ISSUE_IDENTIFIER".
```

### Shipper Subagent
```
You are the SHIPPER stage for ticket $FORGE_ISSUE_IDENTIFIER.
Skill: vault/agents/skills/forge-shipper.md (read it, follow exactly)
Issue ID: $FORGE_ISSUE_ID
Branch: $BRANCH_NAME
PR URL: $PR_URL (if already open) or null
Task: Open PR if needed, admin-merge to main, post [SHIP] comment.
Return JSON: { identifier, pr_url, merge_sha, branch_deleted }
Hard rule: identifier MUST equal "$FORGE_ISSUE_IDENTIFIER".
```

## Identifier Validation (in Lead, after every subagent return)

```
if return.identifier != $FORGE_ISSUE_IDENTIFIER:
  post [LEAD-ABORT] comment: "Subagent returned identifier=${return.identifier}, expected $FORGE_ISSUE_IDENTIFIER. Halting — context drift detected."
  set issue status='blocked'
  exit
```

Never continue past a mismatched identifier. This is the primary drift guard.

## [LEAD-STATUS] Comment Format

Post after every subagent returns:

```
[LEAD-STATUS] $FORGE_ISSUE_IDENTIFIER | stage=<stage> | result=<passed|failed|rejected>
cost_stage=$X.XX | cost_total=$X.XX / $12 budget
<one-line subagent summary>
next=<next_stage or "fixer cycle N/5" or "done">
```

## Fixer Budget

- Video Critic rejects → Fixer: max 5 cycles
- Test Runner fails → Fixer: max 5 cycles
- After 5 cycles: post `[LEAD-ABORT] Fixer cap reached. CEO redirect required.` and set issue status=blocked

## Cost Guard

Track cumulative cost via `forge._ticket_cost_usd($FORGE_ISSUE_ID)` after each subagent. If > $12:
post `[LEAD-ABORT] Budget cap $12 exceeded at stage <stage>. CEO redirect required.`
Set issue status=blocked, exit.

## Output contract — stage_artifact per stage

Write one `forge.stage_artifacts` row per stage with `output_json` matching the subagent's return JSON. The Lead writes this row after receiving the subagent result — subagents do NOT write directly.

```sql
INSERT INTO forge.stage_artifacts (run_id, issue_id, stage, status, output_json)
VALUES ($RUN_ID, $FORGE_ISSUE_ID, '<stage>', '<passed|failed>', $SUBAGENT_RETURN_JSON);
```

## Hard rules

- **One ticket per session.** `$FORGE_ISSUE_IDENTIFIER` is set at start and never changes.
- **Subagents get FRESH context.** No session_id, no prior conversation, only the prompt template above.
- **CLAUDE_CODE_FORK_SUBAGENT=1 must be set.** Without it, Task() shares memory with Lead.
- **No direct DB writes by subagents.** Lead writes all stage_artifacts. Subagents return JSON only.
- **No force push. No --no-verify.** Same rules as all factory agents.
- **Identifier check after every subagent.** If drift detected: halt immediately, never try to recover.

## Session checkpoint (if Lead approaches max_turns)

If the Lead is within 20 turns of max_turns=200, write current state to stage_artifacts:

```json
{
  "stage": "lead_checkpoint",
  "identifier": "$FORGE_ISSUE_IDENTIFIER",
  "last_completed_stage": "<stage>",
  "next_stage": "<stage>",
  "artifacts_so_far": { "<stage>": "<artifact_summary>" }
}
```

Then post `[LEAD-CHECKPOINT] Approaching turn limit. CEO re-dispatch with context_snapshot referencing this artifact to continue.` and exit cleanly.
