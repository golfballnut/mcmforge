# Claude Opus 4.7 plan — factory test-loop

## 1. Stage Table

| Stage | Role name | Model | max_turns | cwd | Input source | Output target | Cost |
|---|---|---|---|---|---|---|---|
| SPEC | `dira-spec` | sonnet | 15 | `MCMForge/forge-orchestrator` | `forge.issues.acceptance_criteria` + ticket body | `forge.stage_artifacts` row kind=`spec` (JSON: test plan, files-to-touch, XCTest class name, screen targets) | $0.30 |
| CODER | `dira-coder` | opus | 50 | `DirtSync/` worktree | latest `spec` artifact + issue | Git commit on `forge/DIRA-<n>` branch; `stage_artifacts` kind=`code` (commit SHA, files[]) | $1.80 |
| TEST_RUNNER | `dira-test-runner` | haiku | 20 | `DirtSync/` worktree | last `code` artifact + spec.xctest_class | `stage_artifacts` kind=`test_result` (xcresult path, pass/fail, failing tests[], raw failure excerpts) — no source edits | $0.25 |
| FIXER | `dira-fixer` | sonnet | 30 | `DirtSync/` worktree | last `test_result` + `spec` + `code` | New commit + `stage_artifacts` kind=`fix` (cycle_n, commit SHA) | $1.00 × ≤3 |
| VISUAL_CRITIC | `dira-visual-critic` | sonnet (vision) | 15 | `MCMForge/forge-orchestrator` | simulator screenshot capture + Drive reference folder resolved via `context_snapshot.drive_folder` | `stage_artifacts` kind=`visual` (verdict, diff notes, pass/fail) | $0.50 |
| SHIPPER | `dira-shipper` | haiku | 12 | `DirtSync/` worktree | artifacts from all prior kinds | PR to `v2-road-first`, update `forge.issues.status`, `stage_artifacts` kind=`ship` (PR URL) | $0.15 |

Per-ticket ceiling: $0.30 + $1.80 + ($0.25 + $1.00)×3 + $0.50 + $0.15 ≈ $6.50, under $8 cap.

## 2. Orchestrator Changes
- Add one new table `forge.stage_artifacts (id, run_id, issue_id, stage text, kind text, payload jsonb, commit_sha, created_at)`. Keep `forge.runs` unchanged; store current stage in `runs.trigger_detail.stage` and `runs.context_snapshot.prev_artifact_ids[]`.
- New poll handler `advanceStage(issue_id)`: on run completion with exit_code=0, compute next stage from a static DAG (`STAGE_NEXT[stage] → nextStage | cycleBack`) and enqueue a new `forge.runs` row bound to the corresponding agent, with `context_snapshot` carrying pointers to the latest artifacts (not their bodies — Claude CLI reads them via a small `forge-fetch-artifact <id>` shell command invoked through the existing adapter skills list).
- Agent selection uses existing `adapter_config.stage_role` field; no dispatcher rewrite.

## 3. Files to Author Tonight
- `forge-orchestrator/src/stages/graph.ts` — static stage DAG + next-stage resolver, fixer cycle counter.
- `forge-orchestrator/src/stages/advance.ts` — `onRunComplete` hook that reads exit_code + latest artifact, inserts next `forge.runs`.
- `forge-orchestrator/src/artifacts/repo.ts` — tiny CRUD on `forge.stage_artifacts` (`insert`, `latestByKind`, `listForIssue`).
- `forge-orchestrator/src/cli/forge-fetch-artifact.ts` — shell command exposed to agents to pull artifact JSON by id.
- `forge-orchestrator/migrations/2026xxxx_stage_artifacts.sql` — the one new table + indexes on (issue_id, kind, created_at desc).
- `forge-orchestrator/src/agents/seed-dirtsync-stage-agents.sql` — six `forge.agents` inserts (spec/coder/test-runner/fixer/visual-critic/shipper) with adapter_config skills scoped per stage.
- `forge-orchestrator/src/stages/prompts/*.md` — one prompt per stage, each strict about one-file-per-agent and artifact contract.

## 4. Test Runner → Fixer Trigger
Test Runner always exits 0 on a clean run (its job is to report, not pass/fail). It writes a `test_result` artifact with `payload.passed:boolean`. `advance.ts` branches on that payload: `passed=true` → enqueue VISUAL_CRITIC; `passed=false` → enqueue FIXER with `context_snapshot.fix_cycle = (prev fix_cycle ?? 0) + 1` and artifact pointers. Fixer completion always routes back to TEST_RUNNER. After `fix_cycle >= 3` without a pass, `advance.ts` marks `forge.issues.status='blocked_tests'`, logs final artifact kind=`abort`, stops.

## 5. Kill-Switch
Orchestrator cron checks every run: abort if any of (a) cumulative `sum(cost_usd)` for `issue_id` > $8, (b) ticket wall-clock > 90 min since first SPEC run, (c) same stage enqueued ≥2 times with identical prior artifact SHA (loop detector), (d) Claude CLI subprocess exceeds 12 min — SIGTERM, mark run `exit_code=124`, set issue `blocked_runaway`. No auto-retry past these; human-only unblock.

## 6. Risk + Mitigation
**Risk:** Fixer invalidates earlier visual parity by touching layout while chasing a failing XCTest, forcing VISUAL_CRITIC rework and burning the cost cap.

**Mitigation:** SPEC artifact freezes a `visual_contract` field (view hierarchy + key modifiers) that Fixer's prompt treats as immutable; any Fixer commit touching files outside `spec.files_to_touch[]` exits with code=65 and routes to `blocked_scope`, not another Fixer cycle.
