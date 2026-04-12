# DirtSync Agent Pipeline — Triggers & Handoffs

## Team Topology (Updated Apr 9)

```
                    Steve
                      ↓
                     CEO
                      ↓
              Feature Builder (Coordinator)
               ↓        ↓        ↓
      ┌────────┼────────┼────────┼────────┐
      ↓        ↓        ↓        ↓        ↓
  Map       Nav HUD   Explore   (future)  (future)
  Rendering Polish    UX
  Expert    Expert    Expert
      ↓        ↓        ↓
      └────────┼────────┘
               ↓
          QA Recorder
               ↓
          Ship Engineer
               ↓
            Steve
```

## Specialist Routing (Feature Builder delegates)

| Domain | Specialist | Agent ID | Owns |
|--------|-----------|----------|------|
| Basemap, MBTiles, style URLs, offline tiles | **Map Rendering Expert** | `fce43183-9464-47d5-8724-c7d4866d7074` | MapStyleManager, OfflineMapService, MapCoordinator (style lifecycle) |
| Turn card, speed badge, ETA, GPS filter, trail name header | **Nav HUD Polish Expert** | `e4ac3b5f-661f-45ab-bfbd-6172048db494` | TurnCardView, WazeNavSpeedCircle, WazeNavTopBar, NavigationETABar |
| Trail labels, difficulty colors, POI markers in explore, trail tap, browse sheet | **Explore UX Expert** | `2c21ddb8-0202-4450-8a1d-14859883a90e` | MapCoordinator+TrailLayers, TrailStyleConfiguration, MapOverlayStack, TrailDetailSheet |

Delegation rule: Feature Builder runs the delegation decision FIRST on every issue. If it matches a specialist domain, reassign the issue via `PATCH /api/agent/issues/:id` with `assignee_agent_id` + a handoff comment, then requeue. See `agents/feature-builder/HEARTBEAT.md` for the full decision table.

## Pipeline Flow

```
Steve creates issue → Feature Builder picks up
    → Delegation Decision: specialist domain? → reassign + requeue → specialist builds
    → otherwise Feature Builder builds directly
    → builds + tests (inner loop, max 8 iterations)
    → marks "in_review"
        → QA Recorder auto-triggered
            → records video + uploads to Drive
            → marks "done"
```

## Trigger Map

| Trigger | Source | Target Agent | How | Status |
|---------|--------|-------------|-----|--------|
| New issue assigned to Feature Builder | Forge DB (manual or CEO) | Feature Builder | Orchestrator polls `runs` table for `queued` status | ✅ Working |
| Issue marked `in_review` | Feature Builder PATCH | QA Recorder | `checkForQAHandoff()` in run-executor.ts | ⚠️ Agent name must match DB |
| Issue marked `approved` | QA Recorder PATCH | Ship Engineer | `checkForShipHandoff()` in run-executor.ts | 🔴 Not wired yet |
| Routine schedule fires | Cron in routines table | Any agent | Orchestrator routine-executor loop | ✅ Working |
| Fleet Auditor hourly | `0 * * * *` cron | Fleet Auditor | Routine | ⏸️ Paused |
| Factory Analyst daily | `0 12 * * *` (7AM ET) | Factory Analyst | Routine | ⏸️ Paused |
| Framework Scout daily | `0 11 * * *` (6AM ET) | Design Scout | Routine | ⏸️ Paused |
| Skills Enhancer daily | `0 12 * * *` (7AM ET) | Code Scout | Routine | ⏸️ Paused |

## Auto-Handoff Code Locations

| Handoff | File | Function | Line |
|---------|------|----------|------|
| Builder → QA | `forge-orchestrator/src/loops/run-executor.ts` | `checkForQAHandoff()` | ~474 |
| QA → Ship | `forge-orchestrator/src/loops/run-executor.ts` | `checkForShipHandoff()` | Not yet implemented |
| Routine dispatch | `forge-orchestrator/src/loops/routine-executor.ts` | `executeRoutines()` | — |
| Run polling | `forge-orchestrator/src/loops/run-executor.ts` | `claimNextRun()` | — |

## Agent Status Reference

| Status | Meaning | Can Receive Work? |
|--------|---------|-------------------|
| `idle` | Ready for work | ✅ Yes |
| `running` | Currently executing a run | ❌ No (busy) |
| `paused` | Manually paused by COO | ❌ No (runs auto-cancelled) |
| `error` | Last run failed | ✅ Yes (but may fail again) |

## Issue Status Reference

| Status | Meaning | Triggers |
|--------|---------|----------|
| `todo` | Ready for an agent to pick up | Nothing — waits for run queue |
| `in_progress` | Agent is working on it | Nothing |
| `in_review` | Agent finished, needs QA | **Auto-creates QA subtask** |
| `approved` | QA passed | **Should auto-create Ship subtask** (not wired) |
| `done` | Shipped | Goal completion check |
| `blocked` | Agent hit a wall | Nothing — needs human |
| `cancelled` | No longer needed | Nothing |

## Known Gaps

1. **QA → Ship handoff not wired** — `checkForShipHandoff()` doesn't exist yet. Ship Engineer won't auto-trigger after QA approval.
2. **QA Recorder agent name mismatch** — `checkForQAHandoff()` looks for agent by name. Verify it matches "QA Recorder" (was "QA Rider").
3. **No rejection loop** — if QA rejects, there's no auto-trigger back to Feature Builder with feedback.
4. **Goal auto-completion** — goal-watcher loop exists but not battle-tested.

## How to Add a New Trigger

1. Add the trigger to this document
2. If it's a status-based handoff: add to `run-executor.ts` following `checkForQAHandoff()` pattern
3. If it's a scheduled routine: add to `forge.routines` table with cron expression
4. If it's a manual trigger: create a run with `status: 'queued'` in `forge.runs`
5. Update the agent's AGENTS.md with the trigger documentation
