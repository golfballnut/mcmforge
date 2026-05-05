---
name: forge-ship
description: Ship one FORGE-* child issue end-to-end through Ralph + Playwright. TDD-first, dashboard-verified, auto-PR. Use when a backlog ticket is ready to dispatch.
---

# /forge-ship — Ralph + Playwright loop

Ships one `forge.issues` row from `backlog` to merged PR. Wraps the existing `feature-builder-lead` agent-team pattern (Ralph loop) with a mandatory Playwright gate at `localhost:3000` and a per-ticket vitest gate.

## When to use

- Any FORGE-* child issue from PRD parent FORGE-341
- Any non-trivial ticket where TDD + visual verification matters
- Skip for SQL-only / docs-only tickets — those run paired-coder inline (cheaper)

## When NOT to use

- Tickets that don't touch code (pure SQL or pure markdown)
- HITL tickets that require Steve manually (e.g. tmux investigation)
- M0-style runtime defect fixes (already shipped)

## Prerequisites

| Pre-req | Check |
|---|---|
| `feat/m1-loop-scaffolding` merged to `main` | `git log main --grep="loop scaffolding"` |
| Playwright installed in dashboard | `cd dashboard && npx playwright --version` |
| vitest passing in both repos | `cd forge-orchestrator && npm test` AND `cd dashboard && npm test` |
| Mini on `main` + PM2 healthy | `ssh dirtsyncmini@100.125.184.57 'pm2 list'` |

## Inputs

`$1` = FORGE-* identifier (e.g. `FORGE-345`)

## Process

### 1. Read the ticket

```sql
SELECT identifier, title, description, status, tags, recommended_agent_id, assignee_agent_id
FROM forge.issues WHERE identifier = '<id>';
```

If `status != 'backlog'`, abort: ticket already in flight or closed.

### 2. Pre-flight

- Verify dependencies (per `docs/tasks-mcm-forge-restructure-2026-05.md` dependency graph) are `completed`
- Verify Mini PM2 healthy + on `main`
- Check the locked decisions table (D1–D5) — if this ticket touches a decision boundary, surface it before dispatch

### 3. Branch + stamp

```bash
git checkout main && git pull --rebase
git checkout -b feat/<id>-<slug>
```

Stamp the issue: `status='in_progress'`, set `assignee_agent_id` to the recommended specialist.

### 4. Dispatch Ralph (`feature-builder-lead`)

Hand the agent team:
- The ticket body + acceptance criteria
- Relevant runbooks (e.g. `docs/runbooks/m1-4-etl-collision-audit.md` for ETL stories)
- The Playwright smoke pre-flight: `cd dashboard && npm run test:e2e` must pass before commit (boots dashboard on `localhost:3030` — port 3000 reserved for other dev tooling)
- The vitest pre-flight: `npm test` in the relevant repo must pass before commit
- The TDD discipline: write the failing test FIRST, then implement, then assert green

Inner loop (the agent runs this; we don't):
```
write failing test → implement → npm test → playwright → all green? → commit
```

### 5. PR + watch

The Lead opens the PR. We watch:

```bash
gh pr view <N> --json mergeStateStatus,statusCheckRollup
```

Wait until `mergeStateStatus == CLEAN`. If `DIRTY` or any check fails, kick back to Ralph for a retry pass (Lead spawns a fix-cycle). Cap at 3 retries; if still red, escalate to Steve.

### 6. Merge

```bash
gh pr merge <N> --merge --delete-branch
git checkout main && git pull --rebase
```

Sync Mini if the change is runtime-affecting:
```bash
ssh dirtsyncmini@100.125.184.57 \
  'cd /Users/dirtsyncmini/MCMForge/forge-orchestrator && git pull && pm2 restart forge-orchestrator'
```

### 7. Close the ticket

```sql
INSERT INTO forge.issue_comments (issue_id, company_id, body, author_user_id) VALUES (...);
UPDATE forge.issues SET status='completed' WHERE identifier='<id>';
```

Audit comment must include: PR link, fixture/test paths, which AC items are checked off, owner agent.

### 8. Verify on production dashboard

For tickets where the user-facing state changes (ETL, RLS, push surface, etc.), Steve confirms on `mcmforge.com`. The audit comment names the URL Steve should open.

## Discipline

- **Tests first.** No commit before the failing test exists.
- **Local Playwright before push.** `cd dashboard && npm run dev &` then `npm run test:e2e`. Visual Critic blocks the push if anything red.
- **One PR per ticket.** Don't bundle (`feedback_one_miniwhy_at_a_time.md`).
- **Merge before next dispatch.** Per `feedback_merge_before_next_dispatch.md`.
- **Cap 3 retries inside Ralph.** Beyond that, surface to Steve — likely a SPEC issue, not an implementation issue.
- **Locked decisions D1–D5 are not relitigated.** They're inputs.

## Smoke-test fixtures

The Playwright smoke at `dashboard/e2e/smoke.spec.ts` covers `/issues`, `/runs`, `/agents` no-console-error baseline. Story-specific assertions go in additional `*.spec.ts` files under `dashboard/e2e/`. Keep one spec per ticket; don't muddy the smoke.

## Cost guidance

- Solo specialist (Factory Upgrader, Forge Builder) ticket: ~$0.50–2 / ticket
- Full Ralph (Lead + Coder + Test Runner + Visual Critic): ~$3–8 / ticket
- ETL / large refactor with multiple Ralph cycles: ~$10–20 / ticket

If a ticket runs >$25, abort and re-spec — almost always a sign the ticket was too big and should be split.

## Related

- PRD: `docs/prd-mcm-forge-restructure-2026-05.md`
- Tasklist: `docs/tasks-mcm-forge-restructure-2026-05.md`
- Loop scaffolding handoff: `docs/handoffs/2026-05-05-forge-341-m0-passed-handoff.md`
- Ralph base pattern: `feature-builder-lead` agent type
