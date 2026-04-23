**1. Stage Plan**

| Role | Model | max_turns | `cwd` | Input source | Output target | Cost expectation |
|---|---|---:|---|---|---|---|
| `SPEC` | Claude Sonnet | 12 | repo root | `forge.runs.payload`, issue AC, linked Gold Star ref, relevant skill prompt, latest `forge.issue_comments` | `forge.stage_results` row with JSON: `plan`, `target_files`, `test_classes`, `fixture_needs`, `probe_commands`, `visual_target`; add `[SPEC]` summary comment | `$0.20-$0.60` |
| `CODER` | Claude Sonnet | 28 | repo root | latest successful `SPEC.plan`, issue AC, current branch SHA | file edits in working tree only; `forge.stage_results` row with JSON: `files_touched`, `test_classes_created`, `notes`, `git_diff_stat`; add `[CODER]` summary comment; stop before any build/test | `$0.80-$1.80` |
| `TEST_RUNNER` | Claude Haiku or Sonnet if parser quality needed | 10 | repo root | latest `CODER` or `FIXER` result, `SPEC.test_classes` | run `xcodebuild test ... -only-testing:<TestClass>` per class or batch; write `forge.stage_results` JSON: `passed`, `failed_tests`, `failure_excerpt`, `xcresult_path`, `attempt`; add `[TEST-RESULT]` comment with first `N=3` failures | `$0.10-$0.40` |
| `FIXER` | Claude Sonnet | 18 | repo root | latest failing `TEST_RUNNER.failure_excerpt`, relevant files, `SPEC.plan`, prior fixer attempts | patch exactly one production or test file set, create git commit, write `forge.stage_results` JSON: `files_touched`, `commit_sha`, `fix_hypothesis`, `attempt`; add `[FIX]` comment | `$0.40-$1.20` |
| `VISUAL_CRITIC` | Claude Sonnet | 12 | repo root | latest green test result, simulator screenshot path, Gold Star reference URL/file metadata | `forge.stage_results` JSON: `grade`, `mismatch_notes`, `approved`, `artifact_paths`; add `[VISUAL]` comment | `$0.20-$0.70` |
| `SHIPPER` | Claude Sonnet | 14 | repo root | latest passing test + approved visual result + accumulated commits | final squash-or-tip commit policy, push branch, open PR to `v2-road-first`; `forge.stage_results` JSON: `branch`, `pr_url`, `head_sha`; add `[SHIP]` comment | `$0.30-$0.80` |

**New table:** `forge.stage_results`
- Columns: `id`, `issue_id`, `run_id`, `stage`, `attempt`, `status`, `agent_id`, `input_json`, `output_json`, `commit_sha`, `created_at`.
- Unique index: `(issue_id, stage, attempt)`.

**2. Orchestrator Changes**
- Add a stage-state machine: after a run exits, read its `stage_results.status` and enqueue the next stage by inserting a new `forge.runs` row with `payload.parent_run_id`, `stage`, `attempt`.
- Resolve stage input from DB, not Claude context: each agent gets a generated prompt assembled from latest successful prior `stage_results` plus issue comments tagged `[SPEC]`, `[TEST-RESULT]`, etc.
- Enforce guardrails in dispatcher: per-stage cost cap, allowed file-touch paths, and attempt ceiling before auto-abort.

**3. First File List To Author Tonight**
- `src/forge/stages.ts` — canonical stage enum, transitions, retry rules, cost/turn caps.
- `src/forge/promptBuilders.ts` — builds minimal per-stage Claude prompts from DB state.
- `src/forge/stageResultStore.ts` — insert/read helpers for `forge.stage_results`.
- `src/forge/testResultParser.ts` — parse `xcodebuild` output and extract first `N` failures.
- `src/forge/visualCritic.ts` — screenshot/reference fetch + grade normalization to pass/fail.
- `src/forge/dispatchNextStage.ts` — small transition helper called after each run exits.
- `supabase/migrations/<timestamp>_create_stage_results.sql` — one new table and indexes.
- `agents/spec.md` — SPEC contract and strict JSON output schema.
- `agents/coder.md` — CODER contract, “no build/test”, one-file-per-agent scope.
- `agents/test-runner.md` — TEST RUNNER contract, allowed to touch only results/log artifacts.
- `agents/fixer.md` — FIXER contract, patch+commit only, keyed by failure excerpt.
- `agents/visual-critic.md` — VISUAL CRITIC grading rubric against Gold Star.
- `agents/shipper.md` — SHIPPER PR/opening workflow.

**4. Test Runner → Fixer Trigger**
When `TEST_RUNNER` finishes with `output_json.passed = false`:
1. Insert `forge.stage_results` with `stage='TEST_RUNNER'`, `status='failed'`, `attempt=k`.
2. Insert `forge.issue_comments` body starting `[TEST-RESULT]` containing failing test names, first 3 excerpts, `xcresult_path`, and current `HEAD` SHA.
3. Orchestrator executes one SQL read: latest failed `TEST_RUNNER` for issue where `attempt <= 3`.
4. If found and total fixer cycles `< 3`, insert new `forge.runs` row with `stage='FIXER'`, `agent_tag='fixer'`, `payload = { issue_id, attempt:k+1, source_stage_result_id, failure_excerpt, head_sha }`.

**5. Kill-Switch**
Abort ticket and mark latest run `hung_aborted` if any of these fire:
- Total ticket spend estimated `> $8`.
- Same stage fails 3 times.
- No new `commit_sha`, no new passing tests, and identical top failure signature across 2 FIXER cycles.
- Claude exits at turn cap twice on same stage.
- Wall clock exceeds 90 minutes from first stage enqueue.

**6. Risk + Mitigation**
Risk: FIXER loses context and makes regressions because failure excerpts are too narrow.

Mitigation: feed FIXER a compact bundle, not raw history: latest `SPEC.plan`, current failing excerpt, last successful commit SHA, and exact `git diff --stat` since SPEC. That preserves intent without rehydrating the whole session.
