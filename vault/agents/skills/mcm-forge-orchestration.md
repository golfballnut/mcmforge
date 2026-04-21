# Skill: MCM Forge Agent Orchestration

> Created: 2026-04-21
> Status: v1 — the durable vision. Read this one file and you understand the whole factory.
> Owner: CEO (laptop session) + Steve (owner)

---

## The Thesis

**MCM Forge is a graph of narrow specialists connected by issue comments, gated by durable artifacts.**

The unit of work is an Issue. The unit of motion is a Heartbeat. The unit of communication is a Comment. The unit of truth is an uploaded Artifact. Everything else — the dashboard, the orchestrator, the AGENTS.md files — is plumbing in service of this shape.

When all four units work together under eight hard rules, a tired operator at 3 am cannot accidentally burn $100 on a broken agent. That's the dummy-proof promise.

---

## The 5 Load-Bearing Components

### 1. The Issue is the atomic unit

An issue is not a "task" and not a "PR." It's the durable container for all work:

- **Spec** — the description
- **Conversation** — comments in the 5-tag grammar (see Component 4)
- **Evidence** — attachments in `forge.issue_attachments` (linked to Supabase storage objects)
- **State** — status / assignee / parent / blockers
- **Ledger** — runs (agent invocations) + issue_events (status changes, reassignments, approvals)

Everything happens on an issue. The dashboard is the control tower.

**Identifier rule:** `FORGE-N` for MCM Forge company, `DIRA-N` for DirtSync company. Prefix mismatch = bug. Enforced by the agent API using `companies.issue_prefix`.

**1 PR = 1 Issue** (from `companies/mcm-forge/PR-RULES.md`). No bundled PRs. No PRs without an issue.

### 2. Specialists, never generalists

Every agent is narrow. Five files define an agent:

| File | Purpose |
|---|---|
| `AGENTS.md` | Identity + scope + frontmatter (company, skills, adapter, model) |
| `HEARTBEAT.md` | Step-by-step lifecycle from wake to exit |
| `TOOLS.md` | Canonical copy-paste commands |
| `LESSONS.md` | Append-only scars (format in `lessons-learned-loop.md`) |
| `GATES.md` | Current certification gate (G1-G5) + evidence links |

A specialist never crosses domains. A sim specialist doesn't fix UI. A map renderer doesn't ship dashboard code. When work falls outside scope, the specialist posts `[BLOCKED] @<other-specialist>` and exits.

**Boundaries are first-class.** Each AGENTS.md has a "What I MUST NOT do" section. Violations kill trust.

### 3. The Heartbeat is the metronome

Every ~60s, the orchestrator's 7 loops run once:

1. `run-executor` — polls `forge.runs WHERE status='queued'`, spawns Claude children
2. `heartbeat-scheduler` — wakes agents on their cron schedule
3. `routine-scheduler` — fires routine agents (daily, weekly)
4. `orphan-reaper` — kills silent or timed-out runs
5. `mention-watcher` — detects `@agent-name` in new comments → queues runs
6. `goal-watcher` — breaks sub-goals into issues
7. `agent-advisor` — (advisory loop — TBD)

Nothing in the factory fires faster than a heartbeat; nothing fires slower than 15 min.

**The heartbeat is where the Certification Gate guard lives** (see Component 5). No dispatch bypasses it.

### 4. Comments are the message bus

Issue comments carry both the agent-to-human signal AND the agent-to-agent signal. Two grammars overlap on the same channel:

**Agent grammar (5 tags, from `agent-comment-protocol.md`):**

| Tag | When | Required |
|---|---|---|
| `[START]` | Within 60s of wake, before any code | Plan + files + est time |
| `[PROGRESS]` | Every major transition | What just happened, what's next |
| `[BLOCKED]` | Stuck > 2 min | What was tried, 2-3 unblock options |
| `[PROOF]` | Before `gh pr create` | Build output + PR info + **≥1 uploaded artifact** (hard rule) |
| `[DONE]` | Last action before exit | Ship summary + lessons link |

**Meta grammar (role-tagged):**

| Tag | Who | Purpose |
|---|---|---|
| `[GATE-PASSED N]` | COO | Agent cleared certification gate N; downstream dispatch unblocked |
| `[GATE-FAILED N]` | COO | Remediation required; agent drops back to prior gate |
| `[HANDOFF @agent]` | specialist | Explicit work transfer; target picks up on next heartbeat |
| `[APPROVED]` | Steve or CEO | Human approved a `[PROOF]` or a PR |
| `[DISPATCH-OK]` | CEO | Supervised agent authorized to pick up this specific issue |

**Steve's pattern (2026-04-21):** *"Once the agents are dialed in and the COO determines that a gate has passed, it can post a comment to the issue and the assigned agent can pickup the task on the next heartbeat."*

That pattern is Components 3 + 4 composed. Comments drive the orchestration plane. Heartbeat fires the next actor.

### 5. Certification Gates (G1-G5) are the law

Every agent has a gate level. Promotion is explicit and evidenced. No agent runs at a privilege higher than its gate. See `agent-certification-gates.md` for the full SOP.

- **G1** Skill-complete (checklist review)
- **G2** Manual dry-run (every HEARTBEAT command works on Mini)
- **G3** Supervised live run (one issue shipped with human watching)
- **G4** Match test (reproduces manually-done task)
- **G5** Autonomous clearance (2+ consecutive G3 passes)

The orchestrator's `run-executor` enforces this at spawn time. Hard. No env override.

---

## The 8 Dummy-Proof Rules

Each rule is a constraint, not a guideline. Each has an enforcement point.

| # | Rule | Enforcement point |
|---|---|---|
| 1 | No agent runs before G3 autonomous | `run-executor` spawn guard |
| 2 | No `[PROOF]` without ≥1 attachment | `comments` POST endpoint validator |
| 3 | No merge without `[PROOF]` + `[APPROVED]` | GitHub branch protection + CI gate |
| 4 | No work outside scope | Boundary list in AGENTS.md + reviewer check |
| 5 | No silence > 5 min on a running agent | `orphan-reaper` kill |
| 6 | No duplicate dispatches per agent+issue | Idempotency guard in queue (FORGE-273) |
| 7 | No stale work orders on cold boot (>24h orchestrator downtime) | Startup halt + inspect before activate |
| 8 | Every action writes a durable artifact | `[PROOF]` tag requires attachment |

When all 8 hold, the factory is idiot-proof. When one breaks, we learn and re-engineer the enforcement point.

---

## The Quality Ratchet — Golden Ride Loop

See `docs/superpowers/specs/2026-04-20-golden-ride-sop.md` for the full SOP. Summary:

Every DirtSync feature passes through a **failing real field ride**. That ride becomes a deterministic fixture:
- GPX (bit-for-bit input to the sim)
- Device video (human reference)
- Manifest (9+ assertions with log patterns, numeric thresholds, timestamps)

Specialists fix bugs iteratively. Sim replays after each fix. Assertions go green one by one. When all green → Steve drives the real ride on device → on-device matches sim expectations → the ride closes as **GOLD**. The GPX stays in the permanent regression suite forever.

**No DirtSync feature ships without passing a Golden Ride.**

Fluvanna 2026-04-20 is Golden Ride #1. Every future field test adds #N.

---

## The Learning Loop (the factory gets smarter every issue)

Steve's framing (2026-04-21): *"the COO has all the data to route back through the anvil loop and all the data to keep the agents from making the same mistake is in the issue comments."*

The learning loop has 4 wires. Today only wire 4 is partial; 1-3 are manual.

**Wire 1 — Auto-harvest.** On every `[BLOCKED]` comment AND every failed run >5 min old, orchestrator enqueues a Knowledge Synthesizer run. (FORGE-277 builds this.)

**Wire 2 — Distillation.** Synthesizer reads the issue's last ~20 comments, extracts {what went wrong, what was tried, root cause, recommended next action}, writes a `LESSONS.md` entry in the affected agent's directory per the format in `lessons-learned-loop.md`.

**Wire 3 — Pattern promotion.** When a root-cause tag appears in ≥3 different agents' LESSONS.md, Synthesizer promotes it: opens a PR editing the relevant `vault/agents/skills/<skill>.md`. Skill PRs require Steve's approval (never auto-merged).

**Wire 4 — Dispatch enforcement.** HEARTBEAT Step 0 = "Read your LESSONS.md." Orphan-reaper kills any run that doesn't post `[START]` within 60s (proves the agent actually woke + read its lessons, didn't hot-resume a stale session).

**When all 4 wires run:** every scar becomes a rule. Every rule becomes part of the next agent's wake-up context. No agent makes the same mistake twice. That's how "smarter every issue" becomes literal, not aspirational.

---

## The Factory Math

- 10 specialists × 8 productive hours × 34 days (to Memorial Day 2026-05-25) = **~2,700 agent-hours available**
- Average issue: 2-3 agent-hours → **~1,000 issues shippable in the window**
- DirtSync needs: ~30-40 P0/P1 bug fixes + 9 Fluvanna assertions + ~15 follow-on Golden Ride assertions = **~60 issues**
- **Capacity is 10× the need. Constraint is gate discipline, not horsepower.**

Cost envelope: $8/run × 3-5 concurrent runs × 8 hours = $200-300/day during active sessions. $5-10/day overnight (CEO solo docs + planning, no agent dispatches). Memorial Day total budget ≈ $3-5K. Cheap for the outcome.

---

## The Rollout to Memorial Day

**Days 1-7 (now, 2026-04-21 → 2026-04-28):**
- Certify Forge Builder G3 (via FORGE-276 Attachments panel)
- Certify Map Rendering Expert G2 → G3 (via DIRA-219 MapLibre fix)
- Certify Sim Specialist G3 (via DIRA-220 Fluvanna baseline replay)
- Ship: Attachments panel (FORGE-276), MapLibre crash fix (DIRA-219), first Fluvanna sim baseline FAIL (DIRA-220)
- Rebuild Knowledge Synthesizer (FORGE-277), certify G2

**Days 8-20 (2026-04-29 → 2026-05-10):**
- Certify Feature Builder G3 redo
- Certify Nav HUD Polish Expert G2 → G3
- Ship all 9 DIRA-208..216 Fluvanna fixes (nav mode, Valhalla roads, arrival, recording threshold, realtime retry, presence merge, landscape, glyph, basemap switch)
- Fluvanna passes Golden Ride in sim (all 17 assertions green)
- Second field test → Golden Ride #2 filed

**Days 21-34 (2026-05-11 → 2026-05-25 Memorial Day):**
- Steve drives Fluvanna on device → confirms sim parity → Fluvanna marked GOLD
- Cross-agent learning compounds (wire 2 + 3 running autonomously by then)
- Harden, reduce hand-holding, widen the specialist pool
- Memorial Day: DirtSync v1 ships

---

## The Long View (post-Memorial Day)

The factory is product-agnostic. Certification gates, comment protocol, Golden Ride pattern, specialist registry, Attachments panel — all work for any company. DirtSync is the first customer; Company #2 onboards in June.

Forge Builder has already shipped 5 PRs on MCMForge itself (the factory code). **The factory builds itself.** When a factory can improve its own plumbing using its own agents, the team has found escape velocity.

---

## Related Skills (the full skill stack)

Read in order to understand the whole machine:

1. `mcm-forge-orchestration.md` (this file) — the vision
2. `agent-certification-gates.md` — G1-G5 SOP
3. `agent-comment-protocol.md` — the 5-tag grammar + artifact upload path
4. `anvil-loop-guardrails.md` — per-run hard caps
5. `issue-prep-rubric.md` — 10-item dispatchability checklist
6. `lessons-learned-loop.md` — LESSONS.md format + dispatch rule
7. `golden-feature.md` — test-matrix-before-code pattern
8. `ios-simulator-mastery.md` — the sim specialist's canonical commands
9. `docs/superpowers/specs/2026-04-20-golden-ride-sop.md` — the field-to-sim regression pattern

---

## Authority + accountability

- **Owner:** Steve. Approves all gate promotions, all PR merges, all skill PRs.
- **CEO (laptop Claude session):** writes the vision, files the issues, dispatches under supervised mode, reviews runs, patches skills. Does not write production code autonomously.
- **COO (future — see FORGE-270):** routing layer enforcing the 8 rules + gate state. Not an LLM writing work; a rules engine + narrow LLM agent making routing decisions.
- **Specialists:** execute narrow work inside their scope, communicate via the 5-tag grammar, never cross domains.

If any layer violates its role, trust erodes. Trust is the actual currency. Dollars are cheap; trust is slow to build and fast to lose.

---

*One factory. One protocol. One quality ratchet. Scale the wins; kill the mistakes at the gate.*
