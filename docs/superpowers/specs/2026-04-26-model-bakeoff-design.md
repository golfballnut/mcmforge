# Model Bake-Off — Per-Role Optimization Design

**Date:** 2026-04-26
**Owner:** Steve McMillian
**Status:** Spec — pending implementation plan
**Goal:** Determine the cheapest model that reliably ships work for each of the 8 DirtSync roles, without delaying DirtSync feature shipping.

---

## Why

- Today every dirtsync-lab agent runs `claude_local` + `claude-opus-4-7`. It's the only model proven to autonomously ship via the Paperclip 5-step workaround.
- "One-size-fits-all Opus" leaves money and parallelism on the table. Sonnet at ~1/3 cost on Coder edits = 3× more parallel work for the same budget. Haiku on TR (mostly mechanical) = ~10× cheaper.
- GPT-5.5 (Codex) is reported to be very capable and has not been tested in our factory.
- Without data, every per-role model decision is vibes. We want defaults backed by graded runs.

## How — Two-Track Strategy

This bake-off **must not delay DirtSync feature shipping**.

| Track | Owner | Surface | Compute |
|---|---|---|---|
| Track 1 — Ship DirtSync (foreground) | Steve + auto-router | Live `master`, dirtsync-lab, iPhone validation | Production agents |
| Track 2 — Bake-off (background) | Harness + Mini cycles | Throwaway worktrees off pinned SHAs, never touches `master` | Isolated, cost-capped |

Tracks are decoupled by:
- **Replay tickets**: bake-off uses already-shipped DIR-12/13/14/15 as fixtures, not live tickets
- **Pinned SHAs**: each replay branches from the frozen `master` SHA at the time the original ticket shipped
- **Throwaway worktrees**: `~/forge-bakeoff/<run-id>/` — created and destroyed per run, never pushed
- **Separate dispatcher**: bake-off runs through a standalone harness, not Paperclip's live executor
- **Cost cap**: $5/run hard limit, $400 total budget cap

## What — Scope

### Models in the bake-off (5 candidates)

| ID | Provider | Adapter | Notes |
|---|---|---|---|
| `claude-opus-4-7` | Anthropic | claude_local | Current champion; baseline |
| `claude-sonnet-4-6` | Anthropic | claude_local | Cheap Claude |
| `claude-haiku-4-5` | Anthropic | claude_local | Cheapest Claude |
| `gpt-5.5-codex` | OpenAI | codex | The "very powerful" candidate |
| `gemini-3.1-pro` | Google | gemini | Incumbent challenger |

### Roles tested (all 8)

Spec, PM, Coder, TR (Test Runner), VC (Visual Critic), Shipper, Fixer, App Designer.

Each role has its own AGENTS.md (already exists in dirtsync-lab). Bake-off uses the production AGENTS.md verbatim — no rewrites for the harness.

### Replay ticket set (3 per role-class)

Picked from already-shipped tickets so we know the "right answer" already exists.

| Ticket | Role focus | Pinned base SHA | Why chosen |
|---|---|---|---|
| DIR-12 | Spec, PM, Coder, TR, VC | `<sha-at-merge>` | Chrome change — exercises full pipeline |
| DIR-13 | Spec, PM, Coder, TR, VC | `<sha-at-merge>` | Basemap swap — visual-heavy, exercises VC + cross-app SSIM |
| DIR-14 | Coder, TR, Shipper | `<sha-at-merge>` | Production-default flip — exercises Shipper |
| DIR-15 | Spec, PM, App Designer, Coder, TR, VC | `<sha-at-merge once shipped>` | First feature-flow ticket; exercises App Designer |
| DIR-FIXER-DEMO | Fixer | head of `master` | Synthetic deliberate-fail (Coder ships broken code, Fixer must catch) |

(SHAs filled in during harness setup from `git log` on already-merged PRs.)

### Run matrix

5 models × 8 roles × ~3 tickets that exercise each role = **~120 graded runs**.

A "run" = one model executing one role on one replay ticket from a fresh worktree, single wake, 30-min cap, $5 cap.

### Apples-to-apples controls (the only variable is the model)

- Fresh git worktree per run, deleted after grading
- Identical AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md (copied from production)
- Identical context snapshot (issue body + comments at the moment of original first wake)
- Single dispatch (one initial wake to kick the run; agent runs to completion within wall-clock cap, multiple internal turns allowed). No human nudges, no manual replays mid-run, no second dispatch.
- Same fixtures (real Valhalla responses, same tile set)
- Wall-clock cap: 30 min per run
- Cost cap: $5 per run (kill if exceeded)
- Tracker logs deterministic seed where the model supports it; otherwise records "non-deterministic"

### Scoring rubric (objective)

| Metric | Weight | Source |
|---|---|---|
| **Shipped** (role's success criteria met — e.g. Coder: PR opened + xcodebuild test green; VC: artifact posted with grade ≥9; Spec: [PLAN-READY] comment posted) | 50% — binary gate, fail-here-fail-everything | Harness checks role-specific success marker per `bakeoff/grader.ts` rules |
| Iterations to ship (turns/wakes) | 20% | Counted by harness |
| Cost in USD | 15% | Adapter `costUsd` field |
| Wall-clock to ship | 10% | Harness timer |
| Human spot-check grade (1-10) | 5% | Steve grades 1 random run per cell |

**Scoring formula:** `weighted_score = shipped × (0.20×iter_score + 0.15×cost_score + 0.10×time_score + 0.05×human_score)` where each sub-score is normalized 0-1 against the best run in that role-cell.

If `shipped == 0`, total score = 0. Models that don't ship don't get partial credit.

### Tie-break rule

If two models within 5% on weighted score for the same role: pick the cheaper one.

## Architecture

### Components

```
forge-bakeoff/
├── harness/
│   ├── run-bakeoff.ts            # main orchestrator
│   ├── replay-ticket.ts          # loads pinned SHA + context snapshot
│   ├── grader.ts                 # applies rubric, posts row to scorecard
│   ├── worktree-manager.ts       # create / destroy isolated worktrees
│   └── cost-guard.ts             # enforces $5/run cap
├── fixtures/
│   ├── DIR-12.snapshot.json      # frozen issue + comments + AGENTS.md hash
│   ├── DIR-13.snapshot.json
│   ├── DIR-14.snapshot.json
│   ├── DIR-15.snapshot.json
│   └── DIR-FIXER-DEMO.snapshot.json
└── results/
    ├── <run-id>/
    │   ├── stdout.log
    │   ├── stderr.log
    │   ├── pr-diff.patch (if shipped)
    │   ├── vc-artifact.png (if shipped)
    │   └── grade.json
    └── leaderboard.md            # rolling output, regenerated after each run
```

The harness reuses Forge's existing adapters (`claude.ts`, `codex.ts`, `gemini.ts`) directly — no new adapter code.

### Data flow per run

1. Harness picks next `(model, role, ticket)` cell from queue
2. Creates worktree at `~/forge-bakeoff/<run-id>/` from pinned SHA
3. Copies role's AGENTS.md / HEARTBEAT.md / SOUL.md / TOOLS.md into the worktree
4. Loads context snapshot (issue body + comments at original first-wake time)
5. Invokes adapter with model override, cost cap, wall-clock cap
6. On exit: grader runs (PR check, CI status, VC presence, cost/time totals)
7. Writes `grade.json` and updates `leaderboard.md`
8. Destroys worktree
9. Loops

### Failure modes the harness must handle

| Failure | Action |
|---|---|
| Adapter timeout (>30 min) | Kill; record `shipped=0, reason=timeout` |
| Cost cap hit ($5) | Kill; record `shipped=0, reason=cost_cap` |
| Adapter exit non-zero | Record `shipped=0, reason=adapter_error`, capture stderr excerpt |
| Worktree create fails | Retry once, then skip cell with `reason=infra_error` |
| Two models race for same worktree path | Path includes `<run-id>` UUID — physically impossible |
| Mini reboots mid-run | Harness resumes from queue file (run-state persisted between cells) |

### What the harness deliberately does NOT do

- Does NOT push branches anywhere
- Does NOT touch the live dispatcher or Paperclip queue
- Does NOT write to `vault/intelligence/` until run completes (atomic write of final leaderboard)
- Does NOT call any external service that costs money beyond the model APIs
- Does NOT send Slack / email / notifications

## Output

`vault/intelligence/model-bakeoff-2026-04-26.md` contains:
- Per-role leaderboard (8 tables, one per role)
- Recommended defaults: `{role: model}` map
- Surprises section (anything counter-intuitive — e.g. Haiku beating Opus on a role)
- Recommended Paperclip config patches (JSON-diff format) to roll out per-role defaults

After human review, run the patches through Paperclip API to update `agents.adapter_config.model` for each role.

## Sequencing (no DirtSync delay)

| Day | DirtSync foreground | Bake-off background |
|---|---|---|
| Today (2026-04-26) | DIR-15 ships | Spec + plan written, harness scaffold |
| +1 | DIR-16 spec + dispatch | Harness build + dry-run on 1 cell |
| +2 | DIR-16 ships | Full 120-cell run launches; ~30 cells/day at conservative parallelism |
| +3 | DIR-17 dispatch | ~60 cells done; daily morning leaderboard glance |
| +4 | DIR-17 ships | All 120 cells done; final leaderboard published |
| +5 | DIR-18 dispatch w/ new per-role defaults | Roll out config patches |

## Estimated cost

| Item | Cost |
|---|---|
| 120 runs × ~$3 avg expected | ~$360 |
| Hard ceiling (120 × $5/run cap) | $600 absolute max |
| **Approved budget** | **$600** |

Harness halts and prompts Steve if cumulative cost crosses $400 (early-warning checkpoint at ~67% of budget).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Codex/Gemini can't navigate Paperclip 5-step workaround → mass `shipped=0` | Result is still actionable: "stay on Opus for autonomous loops". Worth $360 of confidence. |
| Replay tickets too narrow → leaderboard doesn't generalize | Pick 3 tickets per role-class with deliberately different shapes (chrome, basemap, production-flip, feature-flow) |
| Models change in 2 weeks | Re-runnable harness — designed for repeat execution. Make it a quarterly job. |
| Bake-off worktrees fill Mini disk | Worktrees auto-deleted after grading; harness checks free disk before each cell |
| Harness bug shows fake winner | Steve's 5% human spot-check catches obvious nonsense; full run-id stdout/stderr archived for audit |

## Success criteria for this work

1. Spec approved by Steve
2. Implementation plan written
3. Harness scaffold (no actual runs) demoable
4. Dry-run on 1 cell (Opus on DIR-12 Spec) reproduces the original DIR-12 spec output (sanity check)
5. Full 120-cell run completes with leaderboard published
6. Per-role defaults rolled out to dirtsync-lab Paperclip configs
7. DIR-18 (or whichever ticket comes next after rollout) ships through new defaults

## Out of scope (explicitly)

- Continuous shadow harness (revisit if leaderboard proves unstable)
- Multi-tenant bake-off across DirtSync + Paperclip + other companies (DirtSync only for v1)
- Fine-tuned model variants (only stock model IDs)
- Local LLMs (Ollama / llama.cpp) — pro accounts only this round
- Auto-rollout: humans approve each per-role config patch
