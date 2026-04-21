# Skill: Issue Prep Rubric (10-Item Dispatch Checklist)

> Last updated: April 20, 2026
> Applies to: anyone filing a `forge.issue` before it ships to an agent
> Enforced by: CEO review before `status` transitions from `todo` → `in_progress` with an assignee

---

## Goal

Make every issue **ready to ship before it's dispatched**. An agent shouldn't have to infer, search, or ask. Tight spec = A+. Loose spec = B+. Loose spec with no file paths = agent spirals and burns tokens.

## The 10 items

Every issue MUST pass all 10 before dispatch:

1. **Acceptance criteria** — numbered list, measurable (`grep -c X == 0`, `xcodebuild exit 0`, `assertion spec X passes`). No "verify in the field" without a specific harness.

2. **File paths (exact)** — every file the agent will create or modify, full path. Never "find the right place for this."

3. **Out-of-scope list** — what NOT to touch (other routes, other services, other agents' files, refactor opportunities).

4. **Assigned specialist(s)** — primary agent name + adapter type. If team work, list each specialist and what each is responsible for. Match specialist to task:
   - **Feature Builder** — general dashboard/app features, Swift or TS
   - **Forge Builder** — MCMForge orchestrator, dashboard TS, infrastructure
   - **iOS Builder** — iOS-specific compilation & Xcode gymnastics
   - **Map Rendering Expert** — MapLibre styles, tile logic, map rendering
   - **Nav HUD Polish Expert** — TurnCardView, ETA, maneuver UI
   - **Explore UX Expert** — pre-nav trail discovery, POI, onboarding
   - **DirtSync Trail Data Engineer** — OSM / Valhalla / trail detection
   - **Test Writer / Test Runner** — XCUITest authoring and execution
   - **QA Recorder** — sim harness, screenshot/video capture
   - **Critique Agent / Visual Judge** — compare to Gold Star reference
   - **Solutions Architect** — design before code for non-trivial changes

5. **Agent team trigger** — if the task crosses domains (code + test + UI), assign a team and give each specialist a different file set. Per memory `feedback_agent_file_conflicts`: never assign 2 agents to the same file.

6. **Dispatch environment** — cwd, required env vars, CLI tool. Example: `cwd=/Users/dirtsyncmini/DirtSync, claude CLI, CLAUDE_CODE_OAUTH_TOKEN required`.

7. **Guardrails** — per `anvil-loop-guardrails.md`: max_iterations, max_minutes, max_cost_usd, escalate_on.

8. **Proof protocol** — how "done" is verified. Not "agent says it works":
   - For dashboard: Vercel preview URL + curl of happy + failure path
   - For iOS: sim harness (FORGE-265) — build + login + GPX replay + log capture + screenshot/video + assertion check
   - For scripts: stdout matches expected + exit 0
   - For data migrations: row count before/after + spot check

9. **Dependencies** — which PRs/issues must merge first. Explicit: `depends_on: [FORGE-265, PR #415]`. No silent reliance.

10. **Repo target + PR body template** — target repo (MCMForge/DirtSync), branch pattern (`agent/<issue-slug>`), PR body MUST include:
    - `Closes #<IDENTIFIER>` on line 1
    - Proof URLs (screenshots, sim logs, video)
    - Build output tail
    - Manual test instruction if applicable

## The rubric in practice (copy-paste template for new issues)

```markdown
## Problem
<what's broken / missing>

## Root cause
<why, if known>

## Acceptance criteria
1. <measurable check>
2. <measurable check>

## File paths
- CREATE: <full path>
- MODIFY: <full path>

## Out of scope
- Do NOT touch <path>
- Do NOT refactor <thing>
- Do NOT add new deps

## Specialist
- Primary: <agent name>
- Team: <if applicable — list each with responsibility>

## Dispatch env
- cwd: <full path>
- adapter: claude / gemini / codex
- required env: <vars>

## Guardrails
- max_iterations: 5
- max_minutes: 90
- max_cost_usd: 8
- escalate_on: [iterations, time, cost, same_mode_3x]

## Proof protocol
- <exact harness command or verification procedure>

## Dependencies
- depends_on: <PR or issue IDs, or "none">

## Repo + PR template
- Repo: <golfballnut/mcmforge or golfballnut/DirtSync>
- Branch: `agent/<issue-slug>`
- PR body MUST have:
  - `Closes #<IDENTIFIER>` on line 1
  - <specific proof URLs>
```

## Definition of Done (for this skill)

1. Every new issue uses this template
2. CEO rejects with `[ISSUE-PREP]` comment if any of the 10 items are missing
3. Zero issues dispatched without all 10 items present
4. Issues that fail via "agent couldn't find the right file" auto-get a prep-quality post-mortem

## Why

April 20 session: FORGE-256 shipped clean because I gave a tight 8-item spec. DIRA-213 shipped clean but the proof step was skipped because I didn't specify the harness. The delta between clean-ship and scope-spiral is prep quality, not agent skill.

Ready-for-dispatch is a state. Not a suggestion.
