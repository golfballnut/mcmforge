# Task List: MCM Forge Restructure (FORGE-341)

**Source PRD**: `docs/prd-mcm-forge-restructure-2026-05.md`
**Date**: 2026-05-04 (decisions locked 2026-05-04)
**Total stories**: 22 (M0=5 paired, M1=7, M2=5, M3=5) — M2.5 deferred
**Convention**: vertical slices per `.claude/commands/forge-issues.md` — each story fits one agent session (~25 turns).

## M0 status: ✅ PASSED 2026-05-05

DIR-VAL-2 (run `6e6be549-2870-49c9-90cc-7b214364419f`) round-tripped in 36s for $0.16. All three defects validated green:

| Defect | Evidence |
|---|---|
| #1 run_events streaming | 21 rows, seq monotonic 1..21, 5 distinct event_types (`system`/`assistant`/`user`/`rate_limit_event`/`result`). Root cause: `seq` is INT4; `Date.now()` overflows in 2026. Fixed with closure-scoped monotonic counter. |
| #2 bootstrap_prompt honored | First deliberate assistant turn quoted bootstrap step 1 verbatim. |
| #3 tag preservation | `['validation','noop','runtime-smoke']` survived `fn_auto_knowledge_inject` trigger. |

Branch `feat/m0-runtime-fixes`, commits `8514c30` + `c3c38e0`, tag `m0-validated`. DIR-VAL-2 retained as canonical exhibit; `DirtSync NOOP Validator` paused with `maxTurnsPerRun=12`.

**Next**: M1 kickoff — invoke `/forge-issues` to materialize child issues from the M1 table below.

---

## Locked decisions (2026-05-04)

| # | Decision | Applies to |
|---|---|---|
| D1 | `bootstrap_prompt` is **prepended** to `promptTemplate` at runtime; AGENTS.md still authoritative for stage rules. No schema change. | M0.2 |
| D2 | `Knowledge Synthesizer` certifies G0→G3 via **AGENTS.md + 2 successful test runs** (no `steve_manual` override). Test run #1 = M3.3, test run #2 = M3.4 dry-run. | M3.3, M3.4 |
| D3 | Push vendor = **Pushover** ($5 one-time, native iOS, plain HTTP POST). | M3.1 |
| D4 | Drive uploader = **DEFER**. Supabase Storage covers needs. Re-add only on concrete gap. | M2.5 |
| D5 | tmux sessions = **investigate-first, default preserve**. SSH-attach, capture activity, kill only if silent >7 days AND no useful scrollback. | M1.7 |

## Legend

- **Type**: `PAIRED` (Steve + coder, not agent-team) · `AFK` (autonomous agent-team) · `HITL` (needs Steve gate)
- **Team shape**: `feature-builder-lead` pattern = Lead (spawns) + Coder + Test Runner + Visual Critic (where UI). Solo specialist where no UI/test surface.
- **Blocked by**: must close before pickup. Empty = ready to grab.
- **Stage artifact**: every AFK story ships with a `forge-spec.md` SPEC artifact attached as the first comment.

---

## M0 — Runtime defect fixes (PAIRED, NOT agent-team)

> **Discipline note**: M0 fixes the runtime that agent-teams depend on. Running agent-teams against the broken orchestrator would let regressions hide in their own fix. Steve + 1 paired Claude coder, single tight session.

| # | Title | Type | Files | Blocked by | AC |
|---|---|---|---|---|---|
| M0.1 | Stream stdout line-by-line into `forge.run_events` | PAIRED | `src/adapters/claude.ts` (~L84-94), child-process util in `src/utils/` | — | `runChildProcess` invokes `onLog` per JSONL line via `readline`; replay confirms `system`/`assistant`/`result` rows land in `forge.run_events` |
| M0.2 | Prepend `bootstrap_prompt` to `promptTemplate` at runtime | PAIRED | `src/adapters/claude.ts` prompt assembly (L1-100) | — | Per D1: assembly = `bootstrap_prompt` + AGENTS.md (`instructions_file`) + `promptTemplate`. DIR-VAL-2 confirms prompt honored. |
| M0.3 | Quarantine auto-classifier from user-tagged issues | PAIRED | `src/loops/agent-advisor.ts` (suspected) | — | Insert with `tags=['validation']` survives unrewritten. Either skip-when-non-empty OR `user_tags`/`system_tags` split. |
| M0.4 | DIR-VAL-2 revalidation | PAIRED+HITL | new issue | M0.1, M0.2, M0.3 | Round-trip <60s, `forge.run_events.count > 0` for the run, bootstrap honored, tags preserved. Steve eyeballs dashboard. |
| M0.5 | Cleanup DIR-VAL-1 orphans | PAIRED | SQL + SSH | M0.4 green | Per cleanup checklist in PRD §Cleanup. `pgrep` + dashboard view confirms gone. |

**M0 exit gate**: DIR-VAL-2 round-trips green, three defects regression-tested, orphans gone.

---

## M1 — Consolidation (agent-team via forge)

| # | Title | Type | Owner | Blocked by | AC |
|---|---|---|---|---|---|
| M1.1 | Archive 271 DIRA-* legacy issues | AFK | `Factory Upgrader` (G3, solo) | M0 | `UPDATE forge.issues SET status='archived' WHERE identifier LIKE 'DIRA-%';` — dashboard active filter shows 0 DIRA-*. |
| M1.2 | Snapshot Paperclip embedded postgres → Drive | AFK | `Forge Builder` (G3, solo) | M0 | `pg_dump` of port 54330 saved to Google Drive `forge/backups/paperclip-2026-05-XX.sql.gz`; restore runbook drafted at `docs/runbooks/paperclip-archive.md`. |
| M1.3 | Pre-flight identifier collision audit | AFK | `Factory Upgrader` (solo) | M1.2 | Report on collisions for DIR-* and FK shape diffs. Empty result OK; non-empty triggers M1.4 design tweak. |
| M1.4 | ETL Paperclip → forge for DirtSync | AFK | `Factory Upgrader` (G3, solo) | M1.3 | Migration script in `forge-orchestrator/scripts/migrations/2026-05-paperclip-to-forge.ts` per PRD ETL mapping table; idempotent; logs row counts in/out. |
| M1.5 | Pause Paperclip permanently | AFK+HITL | `Forge Builder` | M1.4 | `pm2 delete <paperclip>`; `pgrep paperclip` returns nothing on Mini; cron entries removed; Steve confirms before pulling the plug. |
| M1.6 | Wire `resolveWorkspace()` into `executeRun()` | AFK | `feature-builder-lead` team (Coder + Test Runner) | M0 | `src/loops/run-executor.ts:241` switches from `agent.adapter_config?.cwd` to `await resolveWorkspace(agent, issue)`. Two issues run concurrently in distinct worktrees, `forge.execution_workspaces` populates. |
| M1.7 | Investigate two long-lived `claude --dangerously-skip-permissions` tmux sessions | HITL | `Forge Builder` | — | Per D5: SSH-attach, capture last 50 lines + cwd + last activity ts; preserve if active <7d, kill with Steve confirm only if silent >7d AND no useful scrollback. Memory note added either way. |

**M1 exit gate**: dashboard DirtSync shows 46 DIR-* with comments; orchestrator picks up DirtSync issue end-to-end (DIR-VAL-3 smoke); `pgrep paperclip` empty.

---

## M2 — iOS ship loop (agent-team)

| # | Title | Type | Owner | Blocked by | AC |
|---|---|---|---|---|---|
| M2.1 | `services/ios-test-runner.ts` — native xcodebuild + simctl module | AFK | `feature-builder-lead` team — Coder = `DirtSync Simulator Specialist` (G3) + `Feature Builder` (G3); Test Runner agent harness | M1 | New `forge-orchestrator/src/services/ios-test-runner.ts` exposes `buildAndTest(scheme, simulator)`; unit-tested against a fixture project. |
| M2.2 | Replace prose Test Runner stub with real module | AFK | same team as M2.1 | M2.1 | `run-executor.ts:781-797` calls `iosTestRunner` instead of returning prose; smoke test passes on a real DirtSync ticket from M1.4 port. |
| M2.3 | `services/github-pr.ts` — `gh pr create` wrapper | AFK | `feature-builder-lead` team — Coder = `DirtSync Shipper` (G3) | M1 | New `forge-orchestrator/src/services/github-pr.ts`; opens PR, captures URL, posts back to issue comment. |
| M2.4 | Replace prose Ship stub with real module | AFK | same team as M2.3 | M2.3 | `run-executor.ts:986-993` calls `githubPr` instead of returning prose; PR opened against `master`, comment trail intact. |
| ~~M2.5~~ | ~~`services/drive-uploader.ts`~~ | DEFERRED (D4) | — | — | Out of scope this PRD. Re-open only if a concrete gap surfaces (proof videos >50MB, Drive-folder review need). |
| M2.6 | First DirtSync ticket round-trip — exit gate | AFK+HITL | full pipeline: `DirtSync Stage Spec` → `Feature Builder` → `DirtSync Test Runner` → `DirtSync Visual Critic` → `DirtSync Shipper` | M2.2 + M2.4 | One real ticket from M1.4 ports through 5 stages; sim screenshot in `forge.issue_attachments`; XCUITest pass; PR open; Visual Judge ≥9/10; Steve approves via dashboard. |

**M2 exit gate**: real DirtSync feature shipped end-to-end without prose stubs.

---

## M3 — Claude Claw V3 features (agent-team, parallel-safe with M2 once M1 lands)

| # | Title | Type | Owner | Blocked by | AC |
|---|---|---|---|---|---|
| M3.0 | Cert prep: `Knowledge Synthesizer` AGENTS.md | AFK | `Forge Builder` (writes), Steve approves | M1 | Per D2: AGENTS.md ≤5K, identity + procedures split per `feedback_agents_vs_skills.md`; documents M3.3 + M3.4 procedures. |
| M3.1 | Mobile push surface — Pushover | AFK | `Forge Builder` (G3, solo) | M1 | Per D3: Pushover webhook from `forge.runs` lifecycle + `forge.approvals` insert. <30s after `completed_at`. Toggleable per event (run-complete / PR-ready / agent-paused / cost-tripped). |
| M3.2 | `/standup` slash-command | AFK | `Forge Builder` (solo) | M1 | Fanout reads last `forge.runs` per agent + recent `forge.knowledge`; posts 3-line-per-agent comment on a daily-standup parent issue. <30s end-to-end. |
| M3.3 | Suggestions detector (Haiku-cheap nightly cron) — **also = `Knowledge Synthesizer` cert test run #1** | AFK+HITL | `Knowledge Synthesizer` (G0, on probation) | M3.0 | Cron once/day; scans last 48h `forge.issues` + `forge.issue_comments`; posts ≥1 credible proposal on "Forge Suggestions" parent issue; stays under $1/run on Haiku; Steve eyeballs proposal quality. |
| M3.4 | Salience-tagged memory schema + decay job — **also = cert test run #2; bumps owner to G3 on green** | AFK+HITL | `Knowledge Synthesizer` (G0→G3 on completion) | M3.3 green | `forge.knowledge` gains `importance`, `salience`, `recency_score`, `last_used_at`; nightly decay job dry-run logged; agent prompt assembly queries top-N salient pre-run. On green: `UPDATE forge.agents SET certification_grade='G3' WHERE name='Knowledge Synthesizer';`. |
| M3.5 | RLS policies on 10 currently-exposed tables | AFK | `Forge Builder` (solo) | M1 | Supabase branch tested first; staged rollout one table at a time; dashboard still functional after each; Supabase advisor returns 0 RLS-disabled tables for these 10. |

**M3 exit gate**: phone push <30s; `/standup` <30s; suggestions detector posts; salience populated; RLS green on all 10 tables.

---

## Dependency graph (text)

```
M0.1 ─┐
M0.2 ─┼─► M0.4 ─► M0.5 ─► (M0 done) ─┬─► M1.1
M0.3 ─┘                              ├─► M1.2 ─► M1.3 ─► M1.4 ─► M1.5
                                     ├─► M1.6
                                     └─► M1.7

M1 done ─┬─► M2.1 ─► M2.2 ─┐
         └─► M2.3 ─► M2.4 ─┴─► M2.6     (M2.5 deferred)

M1 done ─┬─► M3.1
         ├─► M3.2
         ├─► M3.0 ─► M3.3 ─► M3.4       (M3.0=cert prep, M3.3+M3.4 are cert test runs)
         └─► M3.5
```

M2 and M3 are parallel-safe once M1 lands.

---

## Agent-team dispatch protocol

For each AFK story:

1. Create child `forge.issues` row with `parent_id = FORGE-341`, identifier `FORGE-<n>`.
2. Author SPEC artifact per `vault/agents/skills/forge-spec.md` and post as first comment.
3. Assign owner agent (or invoke `feature-builder-lead` for multi-stage stories).
4. Lead spawns: Coder (writes), Test Runner (verifies), Visual Critic (only on UI surfaces).
5. PR-merge gate: per `feedback_merge_before_next_dispatch.md` — merge approved PR before dispatching the next downstream story.

For PAIRED stories (M0.x): Steve drives, no `forge.runs` row dispatched until M0 exit gate green.

---

## Open questions

All five resolved 2026-05-04 — see "Locked decisions" table at top.

---

## Next-session handoff checklist

- [ ] Insert FORGE-341 parent into `forge.issues`
- [ ] M0 paired session: ship M0.1 → M0.5 in one tight pass; DIR-VAL-2 green
- [ ] After M0: invoke `/forge-issues` to materialize child issues for M1.1–M3.5 with real `forge.issues` IDs and `tasks/drill-mcm-forge-restructure.json`
- [ ] Dispatch agent-teams via the now-trustworthy orchestrator
- [ ] Update FORGE-341 with milestone-exit evidence as each closes
