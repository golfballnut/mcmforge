# Handoff — FORGE-341 M0 PASSED → ready for M1 kickoff

**Date**: 2026-05-05
**Session shape**: paired coder (Steve + Claude Opus 4.7) closed M0 of FORGE-341
**Read this cold first.** Don't reconstruct from prior conversation.

---

## What just shipped (M0)

Three runtime defects in `forge-orchestrator` fixed and validated:

1. **`forge.run_events` streaming** — was 0 rows / 808 lifetime runs because `seq: Date.now()` overflowed INT4 in 2026 and the supabase insert error was swallowed. Now: closure-scoped monotonic seq + line-buffered JSONL parsing.
2. **`bootstrap_prompt` prepend** — column was dead code; now prepended in `claude.ts` prompt assembly.
3. **User-supplied tags preserved** — `forge.fn_auto_knowledge_inject` trigger now skips overwrite when `NEW.tags` is non-empty.

**Validation**: DIR-VAL-2 (run `6e6be549-2870-49c9-90cc-7b214364419f`) round-tripped 36s/$0.16 with 21 events, monotonic seq, bootstrap-step-1 quoted in first assistant turn, tags unchanged.

---

## State you're walking into

| Thing | State |
|---|---|
| **PR awaiting review** | https://github.com/golfballnut/mcmforge/pull/92 (`feat/m0-runtime-fixes` → `main`) |
| Branch | `feat/m0-runtime-fixes` (commits `8514c30` spec, `c3c38e0` fix, `3deccaa` doc stamp) |
| Tag | `m0-validated` on `c3c38e0` |
| Mini deployment | Running `feat/m0-runtime-fixes` PID 7015 (will stay there until next manual checkout). After PR merge, switch back to `main` on Mini: `ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/MCMForge/forge-orchestrator && git checkout main && git pull && pm2 restart forge-orchestrator'` |
| Migration applied | `forge_preserve_user_tags_in_auto_inject` (project `ncwxeeqvujgyiggkviqq`) |
| DIR-VAL-2 exhibit | issue `a829cea4-967d-4732-a763-fa40f8796b5f`, status=completed, 21 events. Keep visible — proof of M0 PASSED. |
| Validator agent | `DirtSync NOOP Validator` (`84cb0424-5555-4c70-9cf1-d562b5e4b3a4`), paused, `maxTurnsPerRun=12`. Reusable for future runtime regression smokes — do NOT delete. |
| DIR-VAL-1 orphans | Fully cleaned (0 issue / 0 runs / 0 comments / 0 cost_events; `/tmp/forge-validation/` removed from Mini). |

---

## What's next — M1 kickoff

**Hard precondition**: PR #92 must merge to `main` first (per `feedback_merge_before_next_dispatch.md`). Then on Mini: `git checkout main && git pull && pm2 restart forge-orchestrator`.

Then your one canonical command:

```
/forge-issues
```

Point it at parent PRD issue `FORGE-341`. The skill (`.claude/commands/forge-issues.md`) will:
1. Read `docs/prd-mcm-forge-restructure-2026-05.md`
2. Read `docs/tasks-mcm-forge-restructure-2026-05.md` (M1.1–M3.5 already vertical-sliced and specialist-assigned)
3. Insert `forge.issues` rows for each child + `parent_id=FORGE-341`
4. Generate `tasks/drill-mcm-forge-restructure.json`
5. Hand off to `feature-builder-lead` agent-teams

**Skip M0 — it's done.** Skip M2.5 — it was deferred per locked decision D4. Skip the M3.0 cert-prep entry only if you decide to use `steve_manual` override on the Knowledge Synthesizer (D2 says don't).

---

## Locked decisions (already baked into the tasklist — don't relitigate)

| # | Decision | Applies to |
|---|---|---|
| D1 | `bootstrap_prompt` is **prepended** to `promptTemplate` at runtime. AGENTS.md still authoritative for stage rules. | Already shipped in M0.2 |
| D2 | `Knowledge Synthesizer` certifies G0→G3 via AGENTS.md + 2 successful test runs (no override). M3.3 = test run #1, M3.4 = test run #2. | M3.0, M3.3, M3.4 |
| D3 | Push vendor = **Pushover** ($5 one-time). | M3.1 |
| D4 | Drive uploader = **DEFER**. Supabase Storage covers needs. | M2.5 (struck through) |
| D5 | tmux sessions = investigate-first; preserve unless silent >7d AND no useful scrollback. | M1.7 |

---

## Critical files (cite, don't re-research)

**The PRD + tasklist (your source of truth)**:
- `docs/prd-mcm-forge-restructure-2026-05.md`
- `docs/tasks-mcm-forge-restructure-2026-05.md`

**M0 fix targets that are now KNOWN-GOOD** (don't re-touch unless you want a new defect):
- `forge-orchestrator/src/utils/child-process.ts`
- `forge-orchestrator/src/loops/run-executor.ts` (especially `onLog` body around L370–410)
- `forge-orchestrator/src/adapters/claude.ts` (prompt assembly L20–45)
- `supabase/migrations/20260504_forge_preserve_user_tags_in_auto_inject.sql`

**M2 will replace these prose-stub locations**:
- `forge-orchestrator/src/loops/run-executor.ts:781-797` — Test Runner stub (M2.1, M2.2)
- `forge-orchestrator/src/loops/run-executor.ts:986-993` — Ship stub (M2.3, M2.4)

**M1.6 will wire this** (currently bypassed):
- `forge-orchestrator/src/loops/run-executor.ts:241` — switch from `agent.adapter_config?.cwd` to `await resolveWorkspace(agent, issue)` (resolver already exists at `src/workspace/resolver.ts:13`).

---

## Memory entries you can rely on

- `feedback_forge_run_events_seq_int4_overflow.md` — Hidden constraint: `forge.run_events.seq` is INT4. Never use `Date.now()` for INT4 monotonic counters.
- `project_forge_341_m0_passed_2026_05_05.md` — M0 outcome + artifacts retained.
- `feedback_merge_before_next_dispatch.md` — Don't dispatch M1 until PR #92 merges.
- `feedback_one_active_issue_per_company.md` — Run M1 ETL completion before pulling first ported DIR-* into stages.

---

## What you should NOT do this session

- Don't re-run DIR-VAL-2. M0 is validated, exhibit is preserved.
- Don't delete `DirtSync NOOP Validator` (84cb0424). Future regression smokes need it.
- Don't push directly to `main`. PR-only flow per global git rules.
- Don't start M1 child issues until PR #92 is merged.
- Don't open M1.7 (tmux investigation) without an SSH-attach plan that respects D5 (preserve, don't pre-decide kill).
