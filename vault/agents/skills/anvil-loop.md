# Skill: Anvil Loop

> Last updated: April 9, 2026
> Used by: All MCM Forge specialist agents (Feature Builder, iOS Builder, Map Rendering Expert, Nav HUD Polish Expert, Explore UX Expert, Test Runner, Critique Agent, QA Rider, Ship Engineer)
> Origin: Session of April 9, 2026 — naming and formalizing the specialist-team learning pattern that replaces Ralph Loop

---

## Goal

Ship features that are **measurably done** by striking the same spec from multiple angles until every test row is green and every pixel matches the Gold Star. This skill is the named, documented version of the pattern the factory already runs — it exists so agents have one shared vocabulary for how work flows from an issue to a shipped PR.

The anvil is where metal becomes the thing. Each "strike" is a specialist agent run against a fixed spec. Quality is measured after every strike. The work is done when the shape matches the spec — not when the agent decides it looks fine.

## Definition of Done

**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**

1. Gold Star test matrix existed **before** the first strike (Spec phase)
2. A specialist agent executed against the spec on a clean feature branch (Strike phase)
3. XCUITest suite runs and reports pass/fail per row — no subjective grading (Measure phase)
4. Simulator screenshot captured and diffed against the Gold Star reference (Measure phase)
5. Every failed row is reflected as a new entry in the agent's `LESSONS.md` (Record phase)
6. Factory Analyst has visibility into the run in the next 7 AM sweep (Reflect phase)
7. Loop continues until every Gold Star row is green AND pixel diff is under threshold
8. Issue is marked `in_review` with a comment linking to the test report and screenshot
9. No row, no pixel, no rider-visible behavior is "close enough" — close enough is a fail

**If any item above is false, you are NOT done. Loop back to the phase that broke.**

## Pre-Made Decisions

**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Who writes the spec | The agent that owns the issue, BEFORE touching code. Gold Star format per `golden-feature.md`. |
| Who strikes | One specialist at a time per file. Never two agents on the same file (`feedback_agent_file_conflicts.md`). |
| Who measures | XCUITest + `dispatcher/visual-verify.ts` `pixelDiff()`. Not the striking agent. |
| Who judges pass/fail | The tests. If the test row is green, the row passes. No agent self-grading. |
| Where lessons go | Per-agent `LESSONS.md` in the agent's own directory. Append-only, newest at top. See `lessons-learned-loop.md`. |
| Loop ceiling | 5 strikes per issue. If spec isn't green by strike 5, the issue is escalated to Steve — something is wrong with the spec, not the code. |
| What "green" means | All Gold Star rows pass AND pixel diff < threshold (2% for iOS scenes, 1% for web views) AND the rider-facing behavior in the screenshot matches the mockup. |
| When to skip Strike phase | Research and audit tasks only. Any change to user-visible code goes through the full loop. |

---

## The Six Phases

### 1. Spec — Write the test contract BEFORE code

- Load the `golden-feature.md` skill. Apply Why → How → What.
- The **What** is the Gold Star test matrix — unit, integration, visual, and field rows.
- Every row has a **measurable** acceptance criterion. "Map follows rider" is not measurable. "`zoom == 18`, `pitch == 45°`, `trackingMode == .followWithCourse`" is.
- The Gold Star mockup (in Google Drive `DirtSync/Whys/Mini-Why {X}/Gold Star Target/`) is the visual oracle. No mockup, no Strike.
- **Output:** a test matrix in the issue body, a Gold Star mockup link, and a named spec file in the repo if the feature is large.

### 2. Strike — One specialist runs against the spec

- A single specialist agent picks up the issue. One specialist, one file set, one branch.
- The agent loads its own `LESSONS.md` FIRST (enforced by `lessons-learned-loop.md`). If this is a repeat bug, it tries the recorded fix first.
- The agent writes code that satisfies the **What** test matrix from Spec phase. Not more. Not less.
- The agent commits to its feature branch. Never to `main`.
- **Output:** a commit on a feature branch with code + tests + any updated skill references.

### 3. Measure — The tests judge, not the agent

- Run the XCUITest suite: `xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17"`.
- For each Gold Star row, capture pass/fail from the test report. No agent interpretation.
- Take a simulator screenshot of the rider-facing scene: `xcrun simctl io booted screenshot`.
- Run `pixelDiff(screenshot, mockup)` — import from `dispatcher/visual-verify.ts`. Record `diffPercent`.
- If ANY row fails OR `diffPercent > threshold`, the strike is a fail. Do not proceed to Record with success.
- **Output:** a measurement report — pass/fail per row + pixel diff percentage + screenshot.

### 4. Record — Every strike teaches the factory

- Append an entry to the agent's `LESSONS.md` using the format defined in `lessons-learned-loop.md`.
- An entry per **non-trivial bug encountered** during the strike, not one entry per strike. If the strike was clean, no entry.
- Each entry includes: what broke, what was tried, whether it worked, the root cause (if known), and the run cost.
- Commit the `LESSONS.md` change with the work.
- **Output:** updated `LESSONS.md` committed to the feature branch.

### 5. Reflect — Factory Analyst rolls up patterns

- Factory Analyst runs at 7 AM ET daily. It reads every agent's `LESSONS.md` delta over the last 24 hours.
- It identifies patterns: same bug hit by multiple agents, recurring root causes, lessons that keep getting written but never applied.
- It updates the affected agents' HEARTBEAT.md or skill files to harden the weak spots. This is how the factory gets smarter over time.
- **Output:** Factory Report comment on the Factory Analyst's own issue + any skill/HEARTBEAT updates.

### 6. Repeat — Until the spec is green

- If Measure showed failures, loop back to Strike with the failure report in hand.
- The agent has its updated `LESSONS.md`, the failed row(s), and the screenshot. It knows exactly what didn't match.
- Strike → Measure → Record → Strike → Measure... until every row is green AND the pixel diff is under threshold.
- If 5 strikes pass without reaching green, STOP. Escalate to Steve. Something is wrong with the Spec, not the code. Re-entering the loop without a Spec change will waste money.
- **Output:** green test matrix, green pixel diff, issue marked `in_review` with evidence.

---

## Why This Isn't Ralph Loop

Ralph Loop (Ralph Eschinger's pattern): solo agent, subjective reflection, text-only feedback, single-machine, stateless between runs.

| Dimension | Ralph Loop | Anvil Loop |
|-----------|-----------|-----------|
| Who strikes | One agent in isolation | A specialist team, one at a time per file |
| How quality is judged | Agent's own reflection | XCUITest + pixel diff, no self-grading |
| What persists between runs | Text logs | `LESSONS.md` per agent, loaded on wake |
| When it stops | When the agent decides "good enough" | When the test matrix is green and pixels match |
| Where failures go | Conversation history | Factory Analyst reflects and updates HEARTBEATs |
| Spec relationship | Spec + code evolve together | Spec is frozen before the first strike |
| Scale | One machine | The factory — many specialists, many issues in parallel |

The short version: Anvil is industrial, Ralph is academic. Anvil assumes the factory exists. Ralph assumes a single curious engineer.

---

## Gotchas

| Issue | Solution |
|-------|----------|
| Spec written AFTER code | Hard fail. Revert to Phase 1. The test matrix is the contract — code reads from it, never the reverse. |
| Two specialists on same file | Hard fail. One specialist per file per strike. Memory rule `feedback_agent_file_conflicts.md`. |
| Self-grading "looks good to me" | Hard fail. Measure phase uses tests and pixel diff, never agent opinion. |
| "Close enough" on pixel diff | Hard fail. Threshold is the threshold. Fix the code or update the Spec with Steve's approval. |
| Loop runs > 5 strikes | Stop and escalate. Something is wrong with the Spec. More strikes burn money without progress. |
| LESSONS.md not read on wake | Wire `lessons-learned-loop` skill into every agent's AGENTS.md frontmatter. This is enforced. |
| LESSONS.md not written on exit | HEARTBEAT.md final step must append. Missing = silent failure pattern (memory rule `project_auto_learning_loop_needed.md`). |
| Gold Star mockup missing | No mockup, no Strike. Mockup is the visual oracle. |
| Research/audit tasks forced through Strike phase | Skip Strike for pure research. Loop is for user-visible code changes. |
| Skipping Reflect phase | Factory Analyst must run. If it's paused, failure patterns accumulate silently. |
| Specialist picks up an issue with no Spec | Refuse the issue. Send it back for Spec. Do not write code without a test matrix. |
| Pixel diff threshold gamed by cropping | Screenshot the full rider-facing scene, not a cropped region. Gold Star reference must match the same region. |

---

## Reference Files

- Spec phase procedure → `vault/agents/skills/golden-feature.md`
- Lessons Learned contract → `vault/agents/skills/lessons-learned-loop.md`
- Pixel diff implementation → `dispatcher/visual-verify.ts` (exports `takeScreenshot`, `pixelDiff`, `visionJudge`)
- TDD discipline → `superpowers:test-driven-development`
- Verification before claiming done → `superpowers:verification-before-completion`
- DirtSync Gold Star spec (Apr 8) → memory `project_gold_star_spec_apr8.md`
- Master skill template → `vault/agents/skills/MASTER-SKILL-TEMPLATE.md`

---

## Output

Each Anvil Loop run produces:

1. **Spec artifact** — Gold Star test matrix in the issue body or a linked spec file
2. **Strike artifact** — commits on a feature branch (code + tests + LESSONS.md delta)
3. **Measurement artifact** — test report + simulator screenshot + pixel diff percentage, posted as an issue comment
4. **Reflection artifact** — any Factory Analyst-driven updates to agent HEARTBEAT or skill files the following morning

---

## Checklist

### Before Starting (Spec)
- [ ] Big Why and Mini-Why stated from the rider's perspective
- [ ] Gold Star mockup exists in Google Drive
- [ ] Test matrix has unit, integration, AND visual rows — every cell filled
- [ ] Every acceptance criterion is measurable (has numbers or exact states)
- [ ] Relevant feedback memories checked for gotchas
- [ ] One specialist is selected to own this issue — one owner, one file set

### During Execution (Strike → Measure → Record)
- [ ] Agent loaded its `LESSONS.md` before writing any code
- [ ] Feature branch created off `main` (never off a dirty branch)
- [ ] Tests written from the What matrix first — not after the code
- [ ] No other specialist is touching any file in this commit
- [ ] XCUITest suite runs clean (or fails cleanly with row-level reporting)
- [ ] Pixel diff computed against the Gold Star mockup
- [ ] Failure report includes which row failed, not just "tests failed"
- [ ] `LESSONS.md` appended with any non-trivial bugs from this strike
- [ ] Loop counter tracked — stop at strike 5 and escalate if not green

### After Running (Reflect)
- [ ] Issue marked `in_review` with a comment containing test report + screenshot + diff %
- [ ] Feature branch pushed, PR opened against `main`
- [ ] Steve pulls the branch for field test only when YOUR screenshot already matches the Gold Star
- [ ] Factory Analyst will pick up the LESSONS.md delta in tomorrow's 7 AM run — no manual handoff needed
- [ ] New gotchas discovered this loop appended to this skill file
