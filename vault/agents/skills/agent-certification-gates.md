# Skill: Agent Certification Gates (G1–G5)

> Created: 2026-04-21
> Applies to: every MCM Forge specialist agent
> Rule: **No agent runs at a privilege level higher than its current gate.**

---

## Why this exists

Untested agents running autonomously = wasted money + eroded trust. We were dispatching agents based on "it worked once" as proof. That's not a dial-in. The Certification Gates force explicit, evidenced promotion before each level of autonomy.

Steve's mandate, 2026-04-21 03:45 UTC: *"Don't let them run unless they have been fully tested and dialed in."*

---

## The 5 Gates

| Gate | Name | What it proves | Who signs | Evidence required |
|---|---|---|---|---|
| **G1** | Skill-complete | AGENTS.md + HEARTBEAT + skills frontmatter + LESSONS.md all present and correctly wired | CEO (offline review) | Checklist PASS per section 2 below |
| **G2** | Manual dry-run | Every command in HEARTBEAT works on the Mini when typed by a human | CEO (supervised on Mini) | Annotated transcript of each HEARTBEAT step actually running, posted to the agent's Certification issue |
| **G3** | Supervised live run | One full issue shipped with human in the loop, intervening on first failure | Steve + CEO | `[PROOF]` comment on an issue with ≥1 artifact, human approval |
| **G4** | Match test | Agent reproduces a task that CEO did manually first, to within acceptable diff | CEO (automated check) | Side-by-side diff of manual result vs agent result |
| **G5** | Autonomous clearance | 2+ consecutive G3-quality runs across different issues, zero human intervention required | Steve | Explicit approval comment on the agent's Certification issue |

**No gate skips.** An agent at G1 cannot run on G3-level work. An agent at G4 is still shadowed — Steve spot-checks every dispatch.

---

## 1. Per-agent Certification Issue

Every agent gets one long-lived Forge issue titled:
```
Certification: <Agent Name>
```

- Company: the agent's company (DirtSync or MCM Forge)
- Status stays `in_progress` for the agent's lifetime
- Gate promotions are comments on this issue, tagged `[GATE-PASSED <N>]`
- Gate failures are comments tagged `[GATE-FAILED <N>]` with remediation plan
- The issue description has a state table showing current gate + evidence links

## 2. G1 — Skill-complete review (checklist)

Run this against every agent before it ever gets G2 attention. Takes ~15 min per agent.

**Frontmatter (AGENTS.md):**
- [ ] `name`, `company`, `companyId` present
- [ ] `role` one-liner accurate
- [ ] `skills:` array — every skill file exists in `vault/agents/skills/`
- [ ] `adapter` set (claude / codex / gemini)
- [ ] `model` set (sonnet / opus / haiku, with reason)

**Identity (AGENTS.md body):**
- [ ] 1-paragraph identity + when-I'm-used + when-I'm-NOT-used
- [ ] Explicit boundary list ("I never touch X, Y, Z")
- [ ] Success metric named + measurable
- [ ] Failure modes from LESSONS.md captured in "My failure modes" section

**Lifecycle (HEARTBEAT.md):**
- [ ] Step 0: Read LESSONS.md (MANDATORY)
- [ ] Step 1: Post `[START]` within 60s of wake
- [ ] Every code/command step has an explicit post-action `[PROGRESS]` or `[BLOCKED]`
- [ ] Final step: Post `[DONE]` with summary + append new lessons
- [ ] Guardrails declared (max_iterations, max_minutes, max_cost_usd, escalate_on)
- [ ] `[PROOF]` step requires ≥1 artifact upload per `agent-comment-protocol.md`

**Tools (TOOLS.md):**
- [ ] Every env var the agent reads is listed
- [ ] Every `xcrun`, `curl`, `gh`, `git`, or shell command is copy-paste ready with variables
- [ ] No dead commands from older docs
- [ ] Auth pattern explicit (agent API token, service role, OAuth, etc.)

**Lessons (LESSONS.md):**
- [ ] File exists with header stanza
- [ ] If empty, "No lessons yet — this agent is new" note
- [ ] Format per `vault/agents/skills/lessons-learned-loop.md`

**Adapter config in DB (forge.agents row):**
- [ ] `adapter_config.command` set (non-empty)
- [ ] `adapter_config.dangerouslySkipPermissions` if using claude
- [ ] `adapter_config.cwd` points to the correct repo
- [ ] `instructions_file` full absolute path to AGENTS.md
- [ ] `status` = `paused` (so nothing auto-dispatches during G1 review)

**Promotion:** Post `[GATE-PASSED 1]` comment on Certification issue with a link to the filled-out checklist. Agent moves to G2 eligibility.

## 3. G2 — Manual dry-run (Mini supervised)

CEO (me) ssh into Mini. Steve spot-checks (audio or video).

1. Open the agent's HEARTBEAT.md on laptop.
2. For each numbered step, type the exact command from the HEARTBEAT into the Mini ssh session.
3. Verify the expected output.
4. If a command fails: note the failure in the Certification issue, update the TOOLS.md or HEARTBEAT with the fix, retry. This is the "dial-in" moment.
5. Any step that requires an actual Claude child process (the full run itself) — skip. G2 is about the *procedure*, not the LLM.
6. Upload a screenshot or log snippet per step as attachment on the Certification issue.

**Definition of pass:** every non-LLM step in HEARTBEAT runs cleanly start-to-finish, once, with current repo state. Post `[GATE-PASSED 2]` with the evidence bundle.

## 4. G3 — Supervised live run

CEO queues one real issue for the agent. Steve is watching the dashboard. The run fires under full guardrails (5 iter / 60-90 min / $4-8).

- CEO watches for `[START]` within 60s. If silent >60s, kill + fail G3.
- CEO watches `[PROGRESS]` frequency. Silence >5 min = kill.
- On `[BLOCKED]`: if the handoff is clean (valid `@mention`, clear options), that's still a pass. The agent knowing when to stop is part of G3.
- On `[PROOF]`: verify ≥1 artifact attached, verify the artifact actually shows what the comment claims.
- On `[DONE]`: Steve opens the PR, reviews the diff, either `[APPROVED]` or rejects.

**Definition of pass:** one issue shipped or cleanly handed off, human intervention was limited to spot-checks (not corrections), all 8 Dummy-Proof Rules held throughout.

**Definition of fail:** any of the 8 Rules broken; agent fast-exited or spun silently; PR required substantial human rewrite.

On pass: `[GATE-PASSED 3]` + snapshot evidence. On fail: `[GATE-FAILED 3]` + specific remediation items → back to G1/G2 as needed.

## 5. G4 — Match test

CEO performs the task manually end-to-end on a test issue. Records the exact steps + final artifacts. Wipes the result (revert commits, drop DB rows, etc.).

Dispatches the agent on the same issue with no additional guidance beyond what's in its AGENTS.md + issue description.

Compares agent's output to CEO's reference:
- File diffs: if files match, PASS. If differ substantively but produce equivalent behavior, PASS with note. If substantively different AND behavior different, FAIL.
- Comments/proof: did the agent attach similar-quality evidence?
- Timing: did the agent complete within 2× the human's time?

**Definition of pass:** agent reproduces an acceptable result on a clean slate with only its documentation. This is the test of whether the agent's knowledge is actually transferable to new situations, not just handled once with close oversight.

## 6. G5 — Autonomous clearance

After 2 consecutive G3 passes on different issues, Steve reviews the agent's dashboard history (last ~5 runs). Criteria:
- No silent runs
- No guardrail breaches
- No uploaded evidence that misrepresents state
- No scope creep

If all clean, Steve posts `[GATE-PASSED 5] — autonomous clearance` on the Certification issue.

The agent's DB row `status` moves from `active` (supervised) to `active_autonomous` (a new status we need to add). Orchestrator rules:
- Agents at `active_autonomous` can pick up any assigned issue on heartbeat
- Agents at `active` only pick up issues with an explicit `[DISPATCH-OK]` comment from CEO or Steve
- Agents below G3 cannot be dispatched at all (orchestrator skips them)

---

## The dispatch guard (enforcement)

Orchestrator's `run-executor` loop checks, before spawning:

```pseudo
for each queued run:
  agent = agents.findById(run.agent_id)
  gate = agent.certification_gate  // new field, populated from Certification issue
  if gate < 3:
    // agent not cleared to run — cancel the run
    run.status = 'blocked'
    run.error = "agent at G${gate}; needs G3+ for autonomous dispatch"
    continue
  if gate < 5 and run.invocation_source != 'ceo_manual' and run.invocation_source != 'steve_manual':
    // supervised only — needs explicit manual trigger
    run.status = 'blocked'
    run.error = "agent at G${gate}; needs ceo_manual or steve_manual invocation"
    continue
  spawn(run)
```

The guard is HARD. No env var overrides. No bypass. If Steve wants to run a G1 agent, he has to promote it first.

---

## Current agent gate-state (snapshot 2026-04-21)

| Agent | Company | Current Gate | Blockers to next |
|---|---|---|---|
| Forge Builder | MCM Forge | G1 (arguably G2 — ships PRs but fast-exits) | Formalize G1 checklist; redo G2 manual dry-run |
| Feature Builder | DirtSync | G1 | G1 audit pending; gave up on DIRA-218 hard problem |
| DirtSync Simulator Specialist | DirtSync | G1 (1 successful-ish run tonight) | Redo G2 dry-run; protocol discipline |
| Map Rendering Expert | DirtSync | **G0 (paused)** | G1 full audit needed; never run |
| Nav HUD Polish Expert | DirtSync | **G0 (paused)** | G1 full audit needed; never run |
| Knowledge Synthesizer | MCM Forge | **G0 (broken)** | Rebuild per FORGE-277; then G1 |
| Trail Data Engineer | DirtSync | **G0 (broken)** | 9-sec failed runs; audit before restart |
| Visual Judge | MCM Forge | G0 (never run) | G1 audit needed |

All remaining (app-designer, ceo, code-scout, etc.) — **G0 presumed** until audited.

---

## Rollout

**Phase 1 (this week):**
- Forge Builder → G2 full audit → G3 supervised on FORGE-276
- Sim Specialist → G2 full audit → G3 supervised on DIRA-220 baseline replay

**Phase 2 (days 4-10):**
- Map Rendering Expert → G1 → G2 → G3 supervised on DIRA-219 (the MapLibre fix)
- Feature Builder → G2 redo

**Phase 3 (days 10-20):**
- Nav HUD Polish Expert, Knowledge Synthesizer, Visual Judge → G1 → G2

**Phase 4 (days 20-34, pre-Memorial Day):**
- Any agent hitting G5 can run autonomously on DirtSync bug cluster
- Fluvanna Golden Ride passes fully autonomous

---

## Related

- `vault/agents/skills/agent-comment-protocol.md` — the 5-tag grammar
- `vault/agents/skills/anvil-loop-guardrails.md` — per-run hard caps
- `vault/agents/skills/issue-prep-rubric.md` — what makes an issue dispatchable
- `vault/agents/skills/mcm-forge-orchestration.md` — the factory's full architecture
- `vault/agents/skills/lessons-learned-loop.md` — how LESSONS.md grow
