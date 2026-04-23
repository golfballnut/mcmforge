# Factory Test-Loop Design — 3-LLM Synthesis

**Date:** 2026-04-23
**Author:** DirtSync CEO (Claude Opus 4.7) — synthesised three plans from Opus, GPT-5 (Codex), Gemini 2.5 per Steve's directive *"Get all three LLMs to create a plan then take the best of all three and implement."*

## Problem statement

One-shot Coder dispatches with `--max-turns 80` burn 40k+ output tokens in a single session, run out of turns mid-ticket, and leave uncommitted WIP. Phase 1-2 of DIRA-269 ate 80 turns / $3.71 and left production code unwritten. The Coder's inner retry arc (write → build → diagnose → patch → rebuild → patch → repeat) consumes most of the budget.

## Target shape

Split the inner retry arc into small, cheap, survivable stages. Each stage is a separate `forge.runs` row against a dedicated agent with a fresh Claude session. Stage output persists to `forge.stage_artifacts`; next stage reads the artifact, not the session history.

## Stage DAG

```
SPEC → CODER → TEST_RUNNER
                    ├─ passed → VISUAL_CRITIC → SHIPPER
                    └─ failed → FIXER → TEST_RUNNER   (≤3 cycles)
```

After `fix_cycle >= 3` without a pass: mark issue `blocked_tests`, post [ABORT] comment, stop.

## Stage table (synthesised best-of-three)

| Stage | Role | Model | max_turns | Input (from `stage_artifacts`) | Output | Cost target |
|---|---|---|---|---|---|---|
| SPEC | Architect | Sonnet 4.6 | 12 | issue AC + Gold Star URL + skill | plan JSON: `files_to_touch[]`, `test_classes[]`, `probes[]`, `fixtures[]`, `visual_contract{}` | $0.30 |
| CODER | Implementer | Sonnet 4.6 | 40 | latest SPEC artifact | filesystem writes + [CODER] comment + artifact with `files_touched[]`, `git_diff_stat`, no build attempts | $1.50 |
| TEST_RUNNER | Auditor | Haiku 4.5 (+ shell wrapper) | 10 | SPEC.test_classes + latest CODER/FIXER commit | [TEST-RESULT] comment + artifact with `passed:bool`, `failed_tests[]`, `failure_excerpts[]`, `xcresult_path`. Never touches production files. | $0.15 |
| FIXER | Debugger | Sonnet 4.6 | 25 | latest TEST_RUNNER failure + SPEC plan + prior FIXER attempts | git commit + [FIX] comment + artifact with `fix_hypothesis`, `commit_sha`, `attempt`. If patch touches files outside `SPEC.files_to_touch[]` → exit 65 → issue marked `blocked_scope`. | $1.00 × ≤3 |
| VISUAL_CRITIC | Vision QA | Sonnet 4.6 (vision) | 12 | sim screenshot + Gold Star reference URL | [VISUAL] comment + artifact with `grade`, `approved:bool`, `mismatch_notes` | $0.50 |
| SHIPPER | Release Eng | Haiku 4.5 | 10 | all prior artifacts | `git push` + `gh pr create` + [SHIP] comment with PR URL | $0.15 |

**Per-ticket ceiling:** `0.30 + 1.50 + (0.15 + 1.00)×3 + 0.50 + 0.15 ≈ $5.90` — under the $8 cap.

## Schema changes

```sql
-- New table (already migrated 2026-04-23):
forge.stage_artifacts (
  id, issue_id, run_id, parent_artifact_id,
  stage, attempt, status,
  input_json, output_json,
  commit_sha, cost_usd,
  created_at, updated_at
)

-- Additions to forge.runs:
stage text CHECK (stage IN ('spec','coder','test_runner','fixer','visual_critic','shipper'))
parent_run_id uuid REFERENCES forge.runs(id)
```

## Orchestrator changes (smallest footprint)

1. **`advanceStage()` hook** in `forge-orchestrator/src/stages/advance.ts`: on every run exit with `exit_code=0` and `stage IS NOT NULL`, look up `stage_next(stage, output_json.passed)` and enqueue a new `forge.runs` row with `parent_run_id`, populated `context_snapshot.prev_artifact_ids[]`.
2. **`forge-fetch-artifact <id>` CLI** exposed to agents via their adapter skills — keeps prompts small; agents pull artifact JSON on demand.
3. **No other orchestrator changes.** Current adapter_config pattern (command, dangerouslySkipPermissions, cwd) stays.

## Guardrails (kill switch)

Abort the entire ticket if any of:

- `sum(cost_usd)` for issue > $8 (hard cap)
- Wall-clock > 90 min since first SPEC run
- Fixer cycles ≥ 3 without test pass
- Same top failure signature appears in 2 consecutive FIXER cycles (loop detector)
- Any single Claude CLI subprocess > 12 min → SIGTERM
- Fixer commit touches files outside `SPEC.files_to_touch[]` → exit 65 → `blocked_scope`

## Comment tag convention

All stages post tagged comments, extending `agent-comment-protocol.md`:

| Tag | When |
|---|---|
| `[SPEC]` | SPEC emits plan |
| `[CODER]` | CODER finishes writes |
| `[TEST-RESULT]` | TEST_RUNNER posts pass/fail |
| `[FIX]` | FIXER commits a patch |
| `[VISUAL]` | VISUAL_CRITIC grades |
| `[SHIP]` | SHIPPER opens PR |
| `[ABORT]` | kill switch fires |

## Implementation phasing

**Tonight (MVP):**

- ✅ Migration: `forge.stage_artifacts` + `runs.stage` + `runs.parent_run_id`.
- 🔜 Seed 1 new agent: `DirtSync Test Runner` (Haiku 4.5, scoped skill, cwd=DirtSync). Proves the pattern on DIRA-269.
- 🔜 Shell helper: `forge-test-runner.sh` on Mini — runs xcodebuild, writes artifact.
- 🔜 Skill: `vault/agents/skills/forge-test-runner.md` — agent HEARTBEAT.

**Next cycle (after DIRA-269 ships):**

- `advanceStage()` orchestrator hook.
- Seed remaining 5 stage agents.
- Per-stage prompt files in `vault/agents/skills/forge-{spec,coder,fixer,visual-critic,shipper}.md`.

**Day 3:**

- `forge-fetch-artifact` CLI.
- Visual contract enforcement (Fixer scope gate).
- Migrate DIRA-270+ to run end-to-end on the loop.

## Origin plans (preserved for audit)

Full per-LLM plans live in:
- `docs/factory/testloop-plan-claude-opus.md`
- `docs/factory/testloop-plan-gpt5-codex.md`
- `docs/factory/testloop-plan-gemini.md`
