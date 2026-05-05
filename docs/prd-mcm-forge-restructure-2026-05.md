# PRD: MCM Forge Restructure — One Runtime, One Brain, Mobile Reach

**Identifier**: FORGE-341 (parent)
**Author**: COO (Claude Opus 4.7)
**Date**: 2026-05-04
**Status**: Draft, awaiting Steve approval
**Companies affected**: MCM Forge, DirtSync (primary), Golf Ball Nut / Hot Golf Brands / Links Choice (read-only impact via shared schema)

---

## Vision

Steve creates an issue on his phone or in the dashboard. The orchestrator picks it up, the right agent ships it, screenshots and PRs flow back to his iPhone via push, and the Vercel mission-control reflects every step in real time. **One runtime. One brain DB. One dashboard. Push-to-phone.** Paperclip retired. The "Claude Claw V3" pattern, but built around code we own and shipping software (not chat).

## Why now

1. **Paperclip is hemorrhaging**: 2,700+ failed heartbeats today (`fatal: not a git repository`); all 5 DirtSync agents manually paused at 12:28 UTC to stop the burn. Paperclip v2026.416.0 has a known timer-wake context bug, and the upstream MCP-bridge fix (PR #1355) has been stalled for 5+ weeks. Memory has six separate feedback notes documenting Paperclip workarounds — every one a five-step incantation that breaks again on each release.
2. **Parallel-runtime drift**: forge-orchestrator is already the production runtime for 5 companies (805 lifetime runs, 517 succeeded), connected to a working Vercel dashboard (`mcmforge` project) and a Supabase schema (`forge`) with all the right tables. **DirtSync is the only company still stuck in Paperclip's embedded postgres**, invisible to the orchestrator, the dashboard, and the rest of the fleet.
3. **Last DirtSync ship**: 2026-05-01 (DIR-43). Three days dark and counting.
4. **The "Claude Claw V3" pattern Steve admires is ~90% already built** in this codebase. Finishing it costs less than rebuilding it; a lot less than fighting Paperclip.

## Current state

### What works

- **Vercel dashboard** (`mcmforge` project, Next.js 16 + React 19 + Tailwind 4 + Supabase SSR), connected to `forge` schema via `db: { schema: "forge" }`. Pages already shipped: `agents`, `approvals`, `changelogs`, `costs`, `goals`, `inbox`, `issues`, `knowledge`, `org`, `projects`, `routines`, `runs`, `settings`, `skills`, `activity`. API routes: `agent`, `analytics`, `company`, `github`.
- **forge-orchestrator** running on Mac Mini under PM2 since 2026-04-27. PM2 status `online`, 6 days uptime, error log empty since 2026-04-21. Adapter, executor, lifecycle, COO meta-grammar router, mention watcher, visual judge handoff, assembly-line child-issue chaining, agent HTTP API on 3200 — all coded, all proven on 5 companies.
- **Supabase brain DB** (`ncwxeeqvujgyiggkviqq`, schema `forge`): 5 companies, 47 agents, 411 issues, 1,381 issue_comments, 805 runs, 345 cost_events, 15 routines, 47 knowledge entries, 244 run_ratings, 633 wakeup_requests, 36 goals.
- **Validation proven**: `DIR-VAL-1` round-tripped in 32s for $0.10 with `invocation_source='steve_manual'`. Adapter spawns Claude CLI, executor claims work, lifecycle transitions, comment auto-write — all functional.
- **DirtSync agents already provisioned in `forge.agents`** (parked, paused or idle): `DirtSync CEO` (G3), `DirtSync Fixer` (G3), `DirtSync Shipper` (G3), `DirtSync Test Runner` (G3), `DirtSync Visual Critic` (G3), `DirtSync Stage Spec` (G3), `DirtSync Simulator Specialist` (G3), `DirtSync Trail Data Engineer` (G3), `DirtSync Ticket Lead` (G0).

### What's broken

Three runtime defects discovered by the `DIR-VAL-1` end-to-end test:

1. **`forge.run_events` streaming pipeline is dead** — adapter at `forge-orchestrator/src/adapters/claude.ts` calls `runChildProcess(..., onLog)` but `runChildProcess` buffers stdout and only returns it at exit. `onLog` is never invoked per-line. Result: 0 events across 805 lifetime runs. Zero observability into agent reasoning, tool calls, or progress mid-run. Anyone debugging a stuck/long run is blind.
2. **`bootstrap_prompt` column is dead code** — adapter only reads `promptTemplate`; falls back to a 33-word generic template (`"You are agent <id> (<name>). Execute your assigned work."`). DirtSync agents without an `instructions_file` populated will free-associate and trigger SessionStart skills instead of executing assigned work. The dashboard's bootstrap_prompt field appears configured but is silently dropped.
3. **Auto-classifier silently rewrites user-supplied tags** — `tags=['validation','noop','runtime-smoke']` were rewritten to `['ios']` plus a `recommended_agent_id` injection by an upstream classifier (likely `agent-advisor.ts`). Steve-curated DirtSync metadata will be silently overwritten.

### Honorable mentions

- **Assignment-watcher cannot bypass certification gate** — `run-executor.ts` hard-codes `invocation_source='assignment'`; only `steve_manual`/`ceo_manual` can dispatch G<3 agents. New DirtSync agents start G1, so the watcher fires-and-instantly-cancels without manual intervention.
- **Auto-continue creates orphan half-state** — when an agent leaves `issue.status='in_progress'` with `execution_run_id=NULL`, a phantom `assignment` run gets enqueued and instantly cancelled. Cleanup is manual.
- **`forge.execution_workspaces` is empty** (0 rows) despite the resolver being fully implemented at `src/workspace/resolver.ts:13` — the executor never invokes it (`run-executor.ts:241` uses `agent.adapter_config?.cwd` directly). Every agent on a company shares one cwd today.
- **10 forge tables have RLS disabled** (Supabase advisory) — `issue_attachments` (126 rows), `tag_keywords`, `tag_agent_mappings`, `file_tag_mappings`, `run_ratings`, `gap_taxonomy`, `stage_artifacts`, `stack_state`, `video_diff_runs`, `trigger_errors`. Anyone with the anon key can read or modify every row.

### What's in the wrong place

- **DirtSync's 46 DIR-* tickets** + 452 comments + 8 agents + 1 project + 2 goals live in **Paperclip's embedded postgres on port 54330**, invisible to forge-orchestrator and the dashboard.
- **271 archived DIRA-* legacy tickets** clutter `forge.issues` despite the memory rule that DIRA-* is dead and only DIR-* counts.
- **DirtSync exists in both places with different UUIDs**: Paperclip `2fbacee3-…`, Forge `99338dee-…`. ETL must remap.

## Target state

- **One runtime**: forge-orchestrator on Mac Mini, drives all 5 companies including DirtSync. Paperclip uninstalled.
- **One brain DB**: Supabase project `ncwxeeqvujgyiggkviqq`, schema `forge`. All issues, comments, runs, knowledge, costs, routines.
- **One dashboard**: Vercel `mcmforge` project, mission control for the entire fleet.
- **Push-to-phone**: Steve gets pinged on iPhone for run completion, PR ready, agent paused, cost circuit-breaker tripped. (No need to keep checking the dashboard.)
- **Trustworthy observability**: every run streams JSONL events to `forge.run_events`. Replay, debug, and post-mortem possible.
- **Faithful prompt execution**: `bootstrap_prompt` honored; user-supplied tags preserved.
- **Closed iOS ship loop**: native xcodebuild + simctl + gh-pr modules wired into the orchestrator. One DirtSync ticket round-trips end-to-end without prose-stub gymnastics.
- **Layered hive-mind memory**: `forge.knowledge` extended with importance/salience/recency scoring; agents query salient entries before each run.
- **`/standup` slash-command** for daily fleet status across agents.
- **Suggestions detector** flags over-burdened agents and missing skills.

## Out of scope (explicit)

- 3D hive-mind visualization (the video author admits this is novelty; we have a list view).
- Voice war-room / synchronous spoken-agent meetings.
- Per-agent Telegram bot tokens (one push surface, route via `@AgentName` inside).
- Paperclip version-pinning or upstream patches — we're leaving Paperclip, not maintaining it.
- Multi-tenant auth substrate (the `user/account/session` layer in Paperclip — we don't need it).
- GAIA / AllTrails / OnX feature parity — this PRD is plumbing, not product.
- Migrating Paperclip's 12,887 heartbeat_runs / 13,643 wakeup_requests history — operational data, not portable, not worth porting.

## Milestones

### M0 — Runtime defect fixes (paired Steve+coder, ~1 day)

**Why paired and not agent-team**: M0 fixes the runtime that agent-teams depend on. Tag mutation, lost prompts, zero observability — those bugs would hide regressions in their own fix. Bootstrap with a single human-paired session, then trust the runtime for M1+.

**Tasks**:

| # | Task | File:line | Notes |
|---|---|---|---|
| M0.1 | Wire stdout line-streaming so `onLog` is invoked per JSONL event | `forge-orchestrator/src/adapters/claude.ts` (~L84-94 spawn) + child-process util in `src/utils/` | Switch from buffer-then-emit to `readline` stream. Each `system`/`assistant`/`result` JSONL line → `forge.run_events` insert via `onLog`. |
| M0.2 | Wire `bootstrap_prompt` through claude.ts OR rip the column | `forge-orchestrator/src/adapters/claude.ts` (prompt assembly L1-100) | Decide: (a) prepend `bootstrap_prompt` to `promptTemplate` at runtime, (b) replace `promptTemplate` when `bootstrap_prompt` is non-null, or (c) drop the column and document AGENTS.md-on-disk as source of truth. Chosen path documented in code + dashboard form copy. |
| M0.3 | Quarantine auto-classifier from user-tagged issues | `forge-orchestrator/src/loops/agent-advisor.ts` (or wherever the tag-rewrite fires) | Skip the rewrite when `tags` is non-empty on insert, OR introduce `user_tags` (preserved) vs `system_tags` (classifier-managed). |
| M0.4 | DIR-VAL-2 revalidation | New issue, identifier `DIR-VAL-2` | Insert NOOP issue with `tags=['validation']`, `bootstrap_prompt=<custom instructions>`. Assert: `forge.run_events` has > 0 rows for the run; agent honored the bootstrap prompt; tags unchanged at `['validation']`. |
| M0.5 | Cleanup validation orphans | SQL + SSH | DELETE agent `84cb0424-…`, issue `17c739a8-…` (`DIR-VAL-1`), runs `1832992d-…` / `465e8293-…` / `3093ee02-…`, comments tied to that issue. SSH `rm -rf /tmp/forge-validation/` on Mini. |

**Exit gate**: `DIR-VAL-2` round-trips in <60s with `forge.run_events.count > 0`, bootstrap prompt honored, tags preserved. All three defects regression-tested.

**Cost estimate**: 1 paired-coder day. ~$5 in API spend (sub-tasks include reading orchestrator code, writing 50–150 lines of code, two validation runs).

### M1 — Consolidation (agent-team via forge, ~3 days)

**Tasks**:

| # | Task | Owner | Exit |
|---|---|---|---|
| M1.1 | Archive 271 DIRA-* legacy in `forge.issues` | `Factory Upgrader` (G3) | `UPDATE forge.issues SET status='archived' WHERE identifier LIKE 'DIRA-%';` Dashboard active view excludes archived. |
| M1.2 | ETL Paperclip → forge for DirtSync | `Factory Upgrader` (G3) | One-time SQL migration script. See ETL mapping table below. |
| M1.3 | Pause Paperclip permanently | `Forge Builder` (G3) | `pm2 delete <paperclip>`, snapshot embedded postgres dump to Drive, document restore procedure in `docs/runbooks/paperclip-archive.md`. |
| M1.4 | Wire `resolveWorkspace()` into `executeRun()` | `Forge Builder` (G3) | `forge-orchestrator/src/loops/run-executor.ts:241` switch from `agent.adapter_config?.cwd` to `await resolveWorkspace(agent, issue)`. Each issue gets its own worktree+branch. |
| M1.5 | Investigate two long-lived `claude --dangerously-skip-permissions` tmux sessions on Mini | `Forge Builder` | SSH to Mini, attach to tmux sessions `dirtsync` + `mcmforge`, document what they're doing, decide kill/preserve. |

**ETL mapping table (M1.2)**:

| Source (Paperclip 54330) | Destination (`forge` schema, project `ncwxeeqvujgyiggkviqq`) | Transform |
|---|---|---|
| `companies` (DirtSync `2fbacee3-…`) | already exists as `forge.companies` `99338dee-…` | DROP source row; remap FKs only |
| `agents` (8 rows) | `forge.agents` (already has parked DirtSync agents — 9 rows) | UPSERT by name; preserve forge IDs; map `adapter_type` → `adapter`, `adapter_config` jsonb passthrough |
| `issues` (46 DIR-* rows) | `forge.issues` | INSERT with company_id remap; preserve `identifier`; map status enum (`backlog`→`backlog`, `todo`→`todo`, `in_progress`→`in_progress`, `in_review`→`review`, `blocked`→`blocked`, `done`→`done`, `cancelled`→`cancelled`); copy `acceptance_criteria` jsonb; assignee_agent_id remapped via name lookup |
| `issue_comments` (452 rows) | `forge.issue_comments` | INSERT with new issue_id mapping; preserve body + created_at |
| `issue_attachments` (count TBD) | `forge.issue_attachments` | INSERT with new issue_id mapping; copy storage URLs |
| `goals` (2 rows) | `forge.goals` | INSERT; remap company_id |
| `projects` (1 row) | `forge.projects` | INSERT; remap company_id |
| `approvals` (9 rows) | `forge.approvals` | INSERT; remap issue_id + agent_id |
| **Drop entirely** | — | `heartbeat_runs` (12,887), `heartbeat_run_events` (13,358), `agent_wakeup_requests` (13,643), `execution_workspaces` / `workspace_operations` (446 rows), `plugin_*`, `user/account/session/agent_api_keys/board_api_keys`, `documents`, `activity_log`, `cost_events` (Paperclip's are per-event; forge tracks differently) |

**Exit gate**: dashboard issues page filtered to DirtSync shows 46 DIR-* tickets with full comment threads; orchestrator can pick up a DirtSync issue end-to-end (DIR-VAL-3 smoke); `pgrep paperclip` returns nothing on Mini.

**Cost estimate**: ~3 agent-team days. ~$25–50 API spend (ETL is mostly SQL; agent-team time is in worktree wiring + Paperclip tmux investigation).

### M2 — iOS ship loop (agent-team, ~5 days)

**Tasks**:

| # | Task | File | Owner |
|---|---|---|---|
| M2.1 | `services/ios-test-runner.ts` — native xcodebuild + simctl | NEW `forge-orchestrator/src/services/ios-test-runner.ts`; replace prose stub at `run-executor.ts:781-797` | `DirtSync Simulator Specialist` (G3) + `Feature Builder` (G3) |
| M2.2 | `services/github-pr.ts` — `gh pr create` | NEW `forge-orchestrator/src/services/github-pr.ts`; replace prose stub at `run-executor.ts:986-993` | `DirtSync Shipper` (G3) |
| M2.3 | (optional) `services/drive-uploader.ts` — Google Drive parallel destination | NEW `forge-orchestrator/src/services/drive-uploader.ts` | Defer if Supabase Storage covers needs |
| M2.4 | First DirtSync ticket end-to-end — exit gate | Pick a small real ticket from M1's port (e.g. former DIR-15 saved-destinations or new) | `DirtSync Stage Spec` → `Feature Builder` → `DirtSync Test Runner` → `DirtSync Visual Critic` → `DirtSync Shipper` |

**Exit gate**: one real DirtSync feature flows through SPEC → CODER → TEST_RUNNER → VISUAL_CRITIC → SHIPPER stages without prose-stub workarounds; sim screenshot in `forge.issue_attachments`; XCUITest pass logged; PR opened against `master`; comment trail intact in `forge.issue_comments`; Steve approves via dashboard; Visual Judge auto-grade > 9/10.

**Cost estimate**: ~5 agent-team days. ~$80–140 API spend including the e2e test ticket.

### M3 — Claude Claw V3 features (agent-team, parallel-safe, ~5 days)

| # | Task | Owner | Notes |
|---|---|---|---|
| M3.1 | Mobile push surface (Telegram bot OR iMessage shortcut OR Pushover) — events: run completion, PR ready, agent paused by quota-cap, cost circuit-breaker tripped | `Forge Builder` (G3) | Recommend Pushover for simplicity; one user, one app token. Hook into `forge.runs` lifecycle + `forge.approvals` insert. |
| M3.2 | `/standup` slash-command — fanout query across agents, 3-line status each, posted as comment on a daily standup issue | `Forge Builder` (G3) | One read of `forge.knowledge` + last `forge.runs` per agent → fanout comment. |
| M3.3 | Suggestions detector — Haiku-cheap scanner over recent issues + comments; proposes new agents or skill splits | `Knowledge Synthesizer` (G0 → bump to G3) | Cron once/day. Output = comment on a "Forge Suggestions" parent issue. |
| M3.4 | Salience-tagged memory — extend `forge.knowledge` with importance/salience/recency scoring + decay | `Knowledge Synthesizer` | New columns + nightly decay job. Agents query top-N salient entries pre-run. |
| M3.5 | RLS policies on the 10 currently-exposed tables | `Forge Builder` | Design policies first (anon vs service-role read/write). Apply via Supabase migration. |

**Exit gate**: phone push received within 30s of a real run completing; `/standup` returns a 5-agent rollup in < 30s; suggestions detector posts at least one credible proposal; salience scores populate for new knowledge entries; RLS enabled with policies on all 10 tables, dashboard still functional.

**Cost estimate**: ~5 agent-team days. ~$60–100 API spend (M3.1–3.4 are small modules; M3.5 is policy design + testing).

## Agent assignments (summary)

| Milestone | Owner(s) | Notes |
|---|---|---|
| M0 | Steve + paired Claude coder session | Bootstrap; not agent-team |
| M1 | `Factory Upgrader`, `Forge Builder` | M1.1–M1.5 |
| M2 | `DirtSync Simulator Specialist`, `Feature Builder`, `DirtSync Shipper`, `DirtSync Stage Spec`, `DirtSync Test Runner`, `DirtSync Visual Critic` | Standard 5-stage pipeline |
| M3 | `Forge Builder`, `Knowledge Synthesizer` (needs G0→G3 promotion + AGENTS.md tighten) | Parallel-safe |

## Cost & timeline

| Milestone | Calendar | Agent days | $ band |
|---|---|---|---|
| M0 | 1 day | 0 (paired) | ~$5 |
| M1 | 3 days | ~3 | $25–50 |
| M2 | 5 days | ~5 | $80–140 |
| M3 | 5 days (parallel-safe) | ~3–5 | $60–100 |
| **Total** | **~14 calendar days end to end** (M3 parallels M2 once M2 wires unblock) | **~11–13** | **$170–295** |

Confidence: medium-high on M0/M1 (concrete fixes + ETL); medium on M2 (new service modules but contained); medium-low on M3 (mobile push integration is the most variable — vendor choice may eat half a day).

## Risks

| Risk | Mitigation |
|---|---|
| Paperclip embedded postgres data loss during ETL | Snapshot to Drive before any write; ETL is INSERT-only; preserve Paperclip running until M1 exit gate green |
| RLS lockout when policies applied (M3.5) | Test policies on a Supabase branch (already supported by MCP) before main apply; staged rollout one table at a time |
| Auto-quota-cap pauses long XCUITest runs | M2.1 must post progress comments at sim-launch and sim-screenshot stages, not only at exit; alternatively raise the threshold for `DirtSync Test Runner` |
| Identifier collision at port time (DIR-* in forge already exists, etc.) | Pre-flight `SELECT identifier FROM forge.issues WHERE identifier LIKE 'DIR-%';` — currently 0; safe |
| Dashboard regressions during schema cleanup | Dashboard reads from `forge` schema only; M1 archives DIRA-* via UPDATE not DELETE so column shape is unchanged |
| Two long-lived tmux sessions on Mini doing unknown work | M1.5 explicitly investigates before M2 starts; if they're Steve's pair sessions, leave alone; if zombie, kill |
| `bootstrap_prompt` design choice (M0.2) wrong | Run M0.4 validation with the chosen approach; if it fails, the alternative is the next iteration — no schema change either way |

## Success metrics

| Metric | Target | Measurement |
|---|---|---|
| DirtSync ticket round-trip latency | < 60min for a small feature, end-to-end | `started_at` → `completed_at` on a real DIR-* in `forge.issues` |
| `forge.run_events` populated | > 0 events per successful run | `SELECT count(*) FROM forge.run_events GROUP BY run_id` post-M0 |
| Paperclip processes alive on Mini | 0 | `pgrep paperclip` returns nothing |
| Mobile push delivery latency | < 30s after run completion | Manual stopwatch on first 5 push events |
| DIRA-* visible in active dashboard view | 0 | Dashboard issues page filter |
| Tag preservation on user-supplied tags | 100% | M0.4 + ongoing audit |
| Cost per shipped DirtSync feature | < $5 average | Sum `forge.cost_events` per parent issue |

## Open questions for the implementer

1. **`bootstrap_prompt` resolution path** (M0.2): prepend, replace, or rip? I lean prepend for backward compat. Decide before M0.2 starts.
2. **`Knowledge Synthesizer` certification** (M3.3 / M3.4): currently G0. Does it need a written AGENTS.md + 2 successful test runs to bump to G3, or do we override via `steve_manual` for now?
3. **Mobile push vendor**: Telegram (free, generic, requires bot setup), Pushover ($5 one-time, simple, iPhone-native feel), iMessage shortcut (free, fragile)? Recommend Pushover.
4. **Drive uploader (M2.3)**: skip if Supabase Storage covers everything we need. Steve preference?
5. **Long-lived tmux sessions** (M1.5): Steve, are these your pair sessions? If yes, document and leave; if no, OK to kill?

## Cleanup checklist (executed in M0.5)

- [ ] DELETE `forge.agents` row id `84cb0424-5555-4c70-9cf1-d562b5e4b3a4` (DirtSync NOOP Validator)
- [ ] DELETE `forge.issues` row id `17c739a8-762b-47f3-9dca-8da956cd2286` (DIR-VAL-1)
- [ ] DELETE `forge.runs` rows `1832992d-…`, `465e8293-…`, `3093ee02-…`
- [ ] DELETE associated `forge.issue_comments` for issue `17c739a8-…`
- [ ] DELETE associated `forge.wakeup_requests` for runs above
- [ ] SSH `dirtsyncmini@100.125.184.57` → `rm -rf /tmp/forge-validation/`
- [ ] Verify `forge.run_events` is empty for these run_ids (should be — defect #1)

## Reference files

**Templates / conventions**:
- `MCMForge/docs/prd-factory-10-10.md` (template inspiration)
- `MCMForge/docs/factory/testloop-design.md` (stage-DAG reference)
- `MCMForge/.claude/commands/forge-prd.md` (output convention)
- `MCMForge/vault/agents/skills/forge-spec.md` (child-issue SPEC artifact format)

**Defect cite locations**:
- `MCMForge/forge-orchestrator/src/adapters/claude.ts` — defects #1 and #2
- `MCMForge/forge-orchestrator/src/loops/run-executor.ts:241` — worktree wire-up
- `MCMForge/forge-orchestrator/src/loops/run-executor.ts:781-797` — Test Runner prose stub
- `MCMForge/forge-orchestrator/src/loops/run-executor.ts:986-993` — Ship prose stub
- `MCMForge/forge-orchestrator/src/loops/agent-advisor.ts` (suspected) — tag rewrite source

**Schema target**:
- `MCMForge/dashboard/src/lib/supabase/forge-server.ts` — `db: { schema: "forge" }`
- Supabase project `ncwxeeqvujgyiggkviqq`

**Validation evidence (point-in-time, this session 2026-05-04)**:
- DIR-VAL-1 run id `1832992d-e914-45ca-8288-593bb7e430ff` succeeded in 32s, $0.1053
- 5 input / 42,682 cached / 496 output tokens
- 0 rows in `forge.run_events` for the run (defect #1 cited)
- Tags rewritten from `['validation','noop','runtime-smoke']` → `['ios']` (defect #3 cited)
- Bootstrap prompt silently dropped, agent ran on 33-word fallback (defect #2 cited)

## Workflow for the next session (handoff)

1. Read this PRD + (when created) parent issue `FORGE-341` in `forge.issues`.
2. **M0**: pair with Steve directly. Implement the three fixes in `claude.ts`/`run-executor.ts`/`agent-advisor.ts` as one tight session. Re-run DIR-VAL-2. Mark M0 done in the parent issue.
3. **M1+**: invoke `/forge-issues` skill to break each milestone into vertical-slice child issues attached to FORGE-341. Each child issue gets a SPEC stage artifact per `vault/agents/skills/forge-spec.md`.
4. Dispatch agent-teams (`feature-builder-lead` pattern: Coder + Test Runner + Visual Critic) on the child issues via the now-fixed orchestrator.
5. Per `feedback_merge_before_next_dispatch.md`: merge approved PRs to master before dispatching the next ticket.
6. Update parent issue with milestone exit-gate evidence as each milestone closes.

---

**Approval**: Steve to confirm scope, vendor choices in open questions, and authorize M0 paired-coder kickoff.
