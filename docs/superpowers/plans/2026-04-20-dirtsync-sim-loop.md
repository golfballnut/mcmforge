# Plan: DirtSync Sim Loop — Gate A Levels 2 + 4 as Autonomous Infrastructure

**Date:** 2026-04-20
**Owner:** CEO (Session 1) + Forge Builder + Feature Builder (agent team)
**Target live:** 2026-04-22 EOD
**Target first verified DirtSync ship through the loop:** 2026-04-23

---

## Why

DirtSync PRs today ship on "agent says build passes" — no simulator proof, no device parity, no iteration loop. Steve's call on 2026-04-20: build a sim-iterate specialist that takes a GPX ride, replays it against a candidate PR until the sim behaves correctly, then Steve does the real-device test, then a Knowledge agent rolls lessons into shared skills.

This is the Anvil Loop finally wired for iOS. Without it, Memorial Day is a lottery.

## What the loop does end-to-end

```
Steve files DIRA-NNN with GPX fixture + assertions
    │
    ▼
Sim-Iterate Orchestrator picks up (FORGE-266)
    │
    ├─► Build branch → install on iPhone 17 sim
    │
    ├─► XCUITest logs in agent@dirtsync.app
    │
    ├─► Replay GPX via --uitesting-free-ride-gpx
    │
    ├─► Capture: logs, screenshots at waypoints, video
    │
    ├─► Run AssertionSpec checks (FORGE-267)
    │
    ├─► PASS: upload proof to forge.issue_attachments,
    │         comment `[SIM PASS]` on issue, mark ready-for-Steve-device-test
    │
    └─► FAIL: dispatch Feature Builder with exact failing assertion + evidence
                │
                └─► New PR → re-run harness (iteration count++)
                      │
                      ├─► Cap breach (5x / 90min / $8) → ESCALATE to CEO
                      │
                      └─► Green → back to top
```

After Steve's field test:
- **Knowledge Synthesizer (FORGE-268)** reads the iteration history + LESSONS.md + any field-test feedback, promotes patterns to `vault/agents/skills/*.md` + agent LESSONS.md. Next issue runs smarter.

## The 4 issues (merge-before-next-dispatch)

### FORGE-265 — DirtSync QA Harness
**Repo:** DirtSync
**Primary:** Feature Builder
**Team:** Solo (single file addition)
**Est:** 2h
**What ships:**
- New `DirtSyncUITests/QAHarness.swift` — XCUITest helper class
- `logInAsAgent()` — taps login flow, fills agent@dirtsync.app / AgentTest2026, waits for home screen
- `replayGPX(filename:)` — sets `--uitesting-free-ride-gpx=<filename>` launch arg, launches app, waits for location subscription
- `captureEvidence(runId:)` — writes `/tmp/qa-<runId>/` with log stream dump + 3 screenshots (start, mid-route, end)
- XCUITest target config updated to expose the helper
- Standalone `scripts/run-qa-harness.sh` on Mini for manual invocation (testable before FORGE-266 wires it up)

**Out of scope:**
- Don't touch production DirtSync code
- Don't add AssertionSpec assertion parsing (FORGE-267)
- Don't wire into forge-orchestrator (FORGE-266)

### FORGE-266 — Sim-Iterate Orchestrator
**Repo:** MCMForge
**Primary:** Forge Builder
**Team:** Solo
**Est:** 1 day
**What ships:**
- New `forge-orchestrator/src/loops/sim-iterate.ts` — polls `forge.issues` with `qa_harness=dirtsync` tag + `status=in_review`
- Triggers `scripts/run-qa-harness.sh <issue-id>` via SSH to Mini
- Parses harness output → compares against `FixtureManifest.Entry.assertions`
- On pass: uploads artifacts to Supabase storage bucket `artifacts/qa/<issue-id>/`, posts `[SIM PASS]` comment with URLs, marks issue `ready_for_device_test`
- On fail: opens a sub-issue (or re-queues parent issue with `agent-report: iterate`) dispatched to Feature Builder with specific failure evidence
- Enforces guardrails per `anvil-loop-guardrails.md` — tracks iteration count, cost, wall-clock
- Cap breach → `[ESCALATE]` comment + issue `status=blocked`

**Out of scope:**
- Don't touch run-executor or routine-scheduler
- Don't change adapter code
- Don't add new DB schema (use existing fields + tags)

**Depends on:** FORGE-265 merged

### FORGE-267 — AssertionSpec Language Extension
**Repo:** DirtSync
**Primary:** Feature Builder
**Team:** Solo
**Est:** 4h
**What ships:**
- Extend `FixtureManifest.AssertionSpec` enum with:
  - `logContains(pattern: String, timeout: TimeInterval)`
  - `logExcludes(pattern: String, duringSeconds: TimeInterval)`
  - `screenshotMatchesAt(waypoint: Int, tolerance: Double, baseline: String)`
  - `turnCardShowsText(_ text: String, atWaypoint: Int)`
  - `snapWithinMeters(max: Double)` (already stubbed — fill in logic)
- Swift evaluation code in `DirtSyncUITests/AssertionEvaluator.swift`
- Each variant returns `AssertionResult { passed: Bool, evidence: String, failureContext: String? }`
- Unit tests for each assertion type in `DirtSyncUITests/AssertionEvaluatorTests.swift`

**Out of scope:**
- Don't wire into QAHarness (FORGE-266 does that)
- Don't change FixtureManifest.Entry shape
- No new fixture types

**Depends on:** PR #415 merged (FixtureManifest scaffolding) — blocker

### FORGE-268 — Knowledge Synthesizer
**Repo:** MCMForge
**Primary:** Forge Builder
**Team:** Forge Builder + Critique Agent (Critique reviews proposed skill edits)
**Est:** 1 day
**What ships:**
- New `forge-orchestrator/src/loops/knowledge-sync.ts` — runs after sim-iterate marks issue `done`
- Reads the issue's iteration history + agent LESSONS.md entries from this run
- Dispatches a Knowledge Synthesizer agent run (needs agent config — create on Mini if not present)
- That run proposes edits to `vault/agents/skills/*.md` + agent LESSONS.md based on patterns observed
- Opens a PR titled `knowledge: forge.issue DIRA-NNN promoted lessons`
- CEO reviews + merges or rejects per-batch
- Synced to Mini on merge via git hook or Mini's auto-pull routine

**Out of scope:**
- Don't auto-merge knowledge PRs (CEO review is mandatory)
- Don't touch companies/*/GOALS.md or NORTH-STAR.md
- Don't modify orchestrator core code

**Depends on:** FORGE-266 merged + at least one successful sim-iterate completion

## Agent team coordination rule

Per `feedback_agent_file_conflicts`: when a team works on a single issue, each specialist gets DIFFERENT files. Example for FORGE-268:
- Forge Builder → `forge-orchestrator/src/loops/knowledge-sync.ts`
- Critique Agent → reads proposed PR, posts review comment — no file writes

No overlap = no merge conflicts.

## Guardrails applied to this plan

Per `anvil-loop-guardrails.md`:

| Issue | max_iter | max_min | max_cost | escalate_on |
|---|---|---|---|---|
| FORGE-265 | 5 | 60 | $5 | all triggers |
| FORGE-266 | 5 | 120 | $15 | all triggers |
| FORGE-267 | 5 | 60 | $5 | all triggers |
| FORGE-268 | 5 | 120 | $15 | all triggers |
| **Total budget** | — | 6h | **$40** | — |

If combined total exceeds 6 hours or $40 without landing FORGE-266 live, STOP. Something is wrong with the plan, not the agents.

## Success criteria for the whole loop

1. All 4 issues merged by 2026-04-22 EOD
2. DIRA-213 re-runs through the harness and produces proof artifacts attached to the issue
3. FORGE-266 iterates on a deliberately-failing DirtSync fixture and successfully catches the failure, dispatches a fix, re-runs, passes
4. Steve takes the app to the field on 2026-04-23, confirms DIRA-213 fix works on device
5. Knowledge Synthesizer opens a PR promoting the DIRA-213 + FORGE-265 learnings into shared skills

## Failure modes to watch

- **Mini SSH flakiness** → harness timeouts. Mitigation: FORGE-266 runs harness via the orchestrator's local process, not SSH, since orchestrator already lives on Mini.
- **Simulator drift** — iOS version mismatch between what was booted and what's built for. Mitigation: lock sim version in QAHarness.
- **XCUITest auth flake** — per memory `feedback_xcuitest_for_login`, programmatic auto-login fails. XCUITest is the known-good path but it's slower. Budget 30s for login.
- **Agent writes to wrong file** — per the prep rubric, file paths must be exact. Prep review catches this before dispatch.
- **Cost overrun on FORGE-266** — it's the biggest piece. If first run exceeds $10, pause and redesign.

## What this plan explicitly does NOT include

- Real-device testing automation (Steve does manual)
- Cross-repo auto-merge coordination
- Multi-issue parallel dispatch (sequential until the loop is proven)
- DirtSync CEO agent reactivation (still paused; Session 1 is the only strategy layer)
- Any DirtSync issue work beyond DIRA-213 (other DIRAs wait for the loop)

Ship the loop, ship one issue through it, prove the cycle. Everything else after.
