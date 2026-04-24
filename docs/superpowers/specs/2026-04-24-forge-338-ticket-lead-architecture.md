# FORGE-338 — Ticket Lead Architecture (replace stateful stage chain)

**Status:** Design approved 2026-04-24 by Steve
**Owner:** CEO (acting: Claude Opus 4.7)
**Target ship:** within 24h — DIRA-277 is the acid test
**Parent:** `2026-04-24-forge-335-video-loop-design.md` (quality gate lives unchanged)

## Problem

DIRA-277 froze tonight. Post-mortem:

1. Dispatched DirtSync Stage Spec at 07:42 ET.
2. Original run succeeded at 07:47 (cost $0.96). Stage advance trigger fired `spec → coder`.
3. Same Spec agent got re-woken at 07:47 and 07:49 via `wakeReason=continue_work` — session_id kept stale conversation context.
4. Second + third Spec runs committed specs for DIRA-273 (Arrival) and DIRA-274 (Offline banner) instead of DIRA-277. Mislabeled `spec(DIRA-274)...Waze offline mode banner` when DIRA-274 is actually "Daily Stack Currency Sweep".
5. Map Rendering Expert (Coder) started at 07:47 based on the original correct Spec artifact. Ran 2.5 hours with no DIRA-277 code committed. Advisor flagged "out of turns" at 08:07 but process stayed alive burning time.
6. CEO killed at 10:20 ET after Steve asked.

**Root cause:** our factory mixes event-driven pipeline control (DB stage-advance triggers) with stateful agents (long-lived `session_id` conversation memory + heartbeat/continue_work wake cycles). Event-driven + stateful = stage advances forward but agent context pollutes backward across tickets. The FORGE-335 identifier-match guard caught the structured artifact drift but couldn't catch conversation-memory drift.

FORGE-335's video-diff gate was never exercised because the pipeline broke upstream of it.

## Vision

> **One long-lived "Ticket Lead" Claude Code session per ticket. It uses `Task()` subagents for each specialist. Subagents share NO memory — they spawn, return a structured result, die. The Lead holds the ticket's identity and memory.**

This is how superpowers' `feature-builder-lead` already works for laptop-side feature shipping. We adopt the same pattern as the factory's primary unit of work. Mature, battle-tested.

Why this eliminates every failure mode from tonight:

| Tonight's failure | Root | Fixed by Ticket Lead how |
|---|---|---|
| Spec wrote DIRA-273/274 spec on DIRA-277 dispatch | Session_id leaked across ticket contexts | Lead's entire session IS the ticket context. Subagent dies after returning — can't drift. |
| Stage-advance fired on wrong ticket identifier | Trigger checks output_json, not git commits | Lead verifies subagent output matches its own identity before proceeding. No trigger involvement. |
| Coder stuck 2.5h | No one was watching progress | Lead is watching. If subagent silent > N min, Lead kills + re-spawns. |
| "Continue_work" re-wake confused Spec | Heartbeat polled while ticket already advanced | No heartbeats. Lead runs synchronously until done. |
| PM needed to narrate progress | No one knew what was happening | Lead posts [LEAD-STATUS] after every subagent returns — natural narration. |

## Architecture

### Core loop (Ticket Lead, per ticket)

```
1. CEO dispatches: `claude-code -p "forge-ticket-lead.md FORGE-<N>"`
2. Lead reads ticket body + reference clip + Gold Star + skill file
3. Lead posts [LEAD-START] comment
4. Lead loops until ship OR abort:
   a. Decide next stage based on current state (spec / code / test / critic / fix / merge)
   b. Spawn Task() subagent for that stage with FRESH context (just ticket body + prior stage's return value)
   c. Receive subagent's structured return
   d. Validate return matches ticket identity + format
   e. Post [LEAD-STATUS] comment with subagent result
   f. If return signals failure AND retry budget remains: loop with Fixer
   g. If return signals success: advance to next stage
5. On ship: Lead opens PR, invokes Shipper subagent to admin-merge
6. Lead posts [SHIP] comment, updates issue to done, exits
```

### Specialists as Task() subagents

Every specialist becomes a stateless subagent. No session_id persistence. No heartbeats. Their "memory" is their input.

| Specialist | Task() subagent prompt template |
|---|---|
| Spec | Given ticket body + reference clip + design patterns in `vault/agents/skills/forge-spec.md`, write the XCUITest spec. Return `{ test_file_path, acceptance_criteria, interaction_manifest }`. |
| Coder | Given ticket body + Spec return + `forge-coder.md`, write production code + commit. Return `{ commit_sha, files_changed, branch_name, build_passed }`. |
| Test Runner | Given branch + test file + reference clip drive ID + `forge-test-runner.md`, run video-capturing test script. Return `{ test_passed, candidate_drive_id, device_log_findings }`. |
| Video Critic | Given reference + candidate Drive IDs + interaction manifest + `video-critic.md`, Opus-vision diff. Return `{ diff_score, approved, fail_frames }`. |
| Fixer | Given Coder return + Test Runner findings + Video Critic deltas + `forge-fixer.md`, patch. Return `{ commit_sha, hypothesis }`. |
| Shipper | Given PR URL + `forge-shipper.md`, admin-merge + post [SHIP]. Return `{ merge_sha, branch_deleted }`. |

### What gets removed

1. **`advance_stage_on_success()` trigger** — disabled. Lead drives state, not SQL triggers. (The identifier-match guard stays as a belt-and-suspenders check on stage_artifacts, but it's no longer the primary control.)
2. **Heartbeat scheduler** — paused for factory-stage agents. (PM, Stack Currency Sweep can keep theirs — they're read-only cron jobs.)
3. **`continue_work` / `wakeReason` re-wake mechanism** — disabled for ticket work. (If Lead needs another attempt, it spawns a fresh subagent.)
4. **Long-lived `session_id` on stage agents** — null after every run. Validated by trigger on `forge.runs` insert.
5. **`Forge Project Manager`** — stays paused. Ticket Lead narrates its own ticket; PM becomes rollup-only (digest of all Leads' progress) post-FORGE-337.

### What gets added

1. **New skill:** `vault/agents/skills/forge-ticket-lead.md` — the Lead's operating manual
2. **New agent type:** one Ticket Lead agent per domain (`DirtSync Ticket Lead`, `MCMForge Ticket Lead` if needed) — Sonnet 4.6 or Opus 4.7, `max_turns=200`, `cwd` = repo root
3. **Adapter change:** when CEO dispatches a Ticket Lead run, adapter sets `CLAUDE_CODE_FORK_SUBAGENT=1` so `Task()` calls actually fork to isolated processes. This is the Claude Code 2.1.117+ feature we haven't been using.
4. **DB column:** `forge.issues.ticket_lead_run_id uuid` — single run per ticket, lifecycle = ticket lifecycle.
5. **Trigger enforcement:** `forge.runs` insert rejects new rows against `agent.metadata->>'factory_stage' IS NOT NULL` unless issued by a Ticket Lead Task() call (tagged via `context_snapshot->>'spawned_by_lead_run_id'`).

### Three-LLM critique (deferred but designed-in)

Ticket Lead can spawn parallel `Task()` calls to Claude + Codex + Gemini as critics during the Video Critic stage:

```
results = await Promise.all([
  Task({ subagent_type: 'video-critic', model: 'opus' }),
  Task({ subagent_type: 'video-critic', model: 'codex-5.4' }),
  Task({ subagent_type: 'video-critic', model: 'gemini-3' })
])
consensus = synthesize(results)
```

Not shipping in FORGE-338 (need Codex + Gemini adapter maturity, tracked in FORGE-293). Lead's `spawn_critics()` helper is designed to take a `models[]` array so adding them later is config, not code.

## Scope (ships in FORGE-338)

1. Write `vault/agents/skills/forge-ticket-lead.md`
2. Hire `DirtSync Ticket Lead` agent (Sonnet 4.6, max_turns=200, CLAUDE_CODE_FORK_SUBAGENT=1)
3. Disable `advance_stage_on_success()` trigger (keep function but no-op for ticket chains)
4. Add `forge.issues.ticket_lead_run_id` column
5. CEO dispatch script/SQL that launches a Ticket Lead per ticket
6. DIRA-277 re-dispatched as the first real test

## Out of scope (FORGE-338)

- 3-LLM critique (designed-in, ships later)
- Replacing PM (stays paused)
- Multi-company factory isolation (separate spec)
- Video ingestion pipeline (separate spec)
- Migrating existing `forge.*` stage agents away — they stay but become Task() subagent targets, not DB-triggered runners

## Acceptance criteria

1. `forge-ticket-lead.md` skill committed + reviewed for placeholder-free
2. `DirtSync Ticket Lead` agent seeded in `forge.agents`
3. `advance_stage_on_success()` trigger function altered to no-op for tickets tagged `use_ticket_lead=true` (added as column default-true once Lead proves out)
4. `forge.issues.ticket_lead_run_id` column exists
5. CEO dispatches DIRA-277 via Ticket Lead
6. Lead completes full pipeline (Spec → Coder → Test → Video Critic → Fixer ↔ loop → Shipper) without any cross-ticket drift
7. Video Critic REJECTS first candidate (freeze still present). Fixer re-enters. Second attempt passes.
8. DIRA-277 ships to `v2-road-first` via Ticket Lead
9. Steve field-tests DIRA-277 on-device — search + keyboard + result tap clean, no freeze

## Risks

- **Lead session limits:** Opus session with 6–10 Task() calls may hit `max_turns=200`. Mitigation: Lead can explicitly checkpoint state to stage_artifacts and respawn itself — Lead v2 if needed.
- **Task() subagent cost:** Each subagent is a fresh Claude process. Estimate $0.50–$2.00 per stage × ~6 stages = $3–12 per ticket. Acceptable vs tonight's $25+ on broken runs.
- **Fork subagent flag risk:** `CLAUDE_CODE_FORK_SUBAGENT=1` is relatively new (CC 2.1.117+). Stack currency sweep shows we're on 2.1.118. Should work. Monitor first run closely.
- **Regression on existing tickets:** Disabling stage-advance trigger breaks any in-flight tickets that still use it. Mitigation: trigger stays functional but gated on `use_ticket_lead=false` for legacy flow. Zero in-flight right now (DIRA-277 killed, nothing else queued).
