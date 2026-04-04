# Skill: Golden Feature

> Last updated: April 1, 2026
> Used by: MCM Forge COO, DirtSync COO, all engineers
> Origin: Session 69 — Steve's Why/How/What formula applied to DirtSync navigation

---

## Goal
Turn any rider need (a "mini-why") into a fully tested, shippable feature using the Why → How → What loop. The Why defines the rider's need. The How maps the workflow and tech. The What is a test contract — unit, integration, and field tests that MUST all pass before shipping. Gold = every row in the What passes. This skill replaces "tell Claude how to build stuff" with "give Claude the Why and let it prove the What."

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. Mini-Why is stated in one sentence from the rider's perspective
2. How workflow diagram + tech stack table exist
3. What test matrix has unit, integration, AND field test rows
4. All unit tests pass
5. All integration tests pass
6. Field test matrix presented to Steve with pass/fail columns
7. Steve runs field test and marks all rows pass
8. PR merged to master
9. Gotchas from this run appended to this skill

**If any item is false, you are NOT done. Loop back.**

## Pre-Made Decisions
**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Planning tool | superpowers:writing-plans |
| Execution tool | superpowers:subagent-driven-development |
| Test approach | TDD — What (tests) defined before How (code) is built |
| Branch strategy | Feature branch → PR → Steve approves → merge |
| Voice of the Why | Always from rider's perspective, never technical |
| Gold criteria | 100% of What test matrix rows pass |
| Failure response | Diagnose → fix → re-test (never ship with fails) |

## Execution Flow

### Phase 1: WHY — What does the rider need?
- State the Big Why (product purpose) in one sentence
- Break into Mini-Whys (individual rider wants)
- Each mini-why = one sentence, rider's voice: "Where are my buddies right now?"
- Prioritize: which mini-why ships next?
- **Output:** Prioritized mini-why list

### Phase 2: HOW — Workflow + tech stack
For the selected mini-why:
- Map the rider workflow (what happens step by step in the real world)
- Draw the technical workflow (what systems fire in what order)
- Tech stack table: Layer | Tech | Role
- Identify existing code vs. new code needed
- **Read the official docs FIRST** — build a reference skill or use context7 before guessing at APIs
- **Capture a Waze reference screenshot** showing what "done" looks like for this behavior
- If a mini-why has multiple visible behaviors, split into **super-mini-hows** (one per visual behavior)
- **Output:** Workflow diagram + tech stack table + procedure + reference screenshot

### Phase 3: WHAT — The test contract
This is the most important phase. Define BEFORE building. **4 layers, never skip one:**

**Layer 1: Unit tests** — Does the logic work in isolation?
| # | Test | Input | Expected | Proves |

**Layer 2: Integration tests** — Do the components work together in code?
| # | Test | GPX/Sim | Expected Behavior | Proves |

**Layer 3: Visual verification** — Screenshots graded against measurable acceptance criteria
| # | State | Screenshot | Acceptance Criteria | Pass/Fail |

**Rules for Layer 3:**
- BEFORE building, define a **visual acceptance spec**: what "done" looks like with MEASURABLE criteria (zoom level, tilt angle, element positions, colors). Vague criteria like "map follows" are not acceptance criteria.
- Use `simctl screenshot` + `simctl recordVideo` for iOS capture.
- For GPS simulation: `cat waypoints.txt | xcrun simctl location $DEVICE start --speed=6.7 --interval=1 -`
- Always use CoreLocationProvider (not SimulatedLocationProvider) so one GPS stream drives both camera and Ferrostar.
- **Grade each screenshot against criteria before presenting to Steve.** If ANY criterion fails, loop back to Build. Do NOT present failing screenshots.
- Compare against Waze reference screenshots. If your screenshot doesn't look like Waze, it's not done.
- **Self-grading trap:** "Nav UI is active" does NOT mean the feature works. Check what the RIDER sees, not what the code reports.

**Layer 4: Field tests** — Does the real experience deliver the Why?
| # | Action | What Steve Sees | What Steve Does NOT See | Pass/Fail |

Gold = every row in every layer has a check. Any empty cell = not done.

### Phase 4: BUILD — Invoke superpowers
- Use writing-plans to create implementation plan FROM the What
- Tests are written FIRST (the What drives the How)
- Use subagent-driven-development to execute
- Each subagent gets: the mini-why, the relevant What rows, and the How context

### Phase 5: VERIFY — Self-learning loop
```
Run unit tests → all pass?
  NO → read failure, diagnose, fix, re-run (don't guess)
  YES ↓
Run integration tests → all pass?
  NO → gather context (logs, state), diagnose, fix, re-run
  YES ↓
Present field test matrix to Steve
Steve runs live test → all rows pass?
  NO → Steve describes what happened, loop to Phase 2 or 5
  YES ↓
GOLD ✅ → Ship it
```

### Phase 6: SHIP
- PR with the What test matrix as the description
- Steve approves
- Merge
- Append any new gotchas learned

## Google Drive Workflow — Every Mini-Why

Every mini-why gets a folder in Google Drive under `DirtSync/Whys/`. This is the visual record of the Why→What→How process.

```
DirtSync/
└── Whys/
    └── Mini-Why {X} — {Name}/
        ├── Gold Star Target/        ← Approved mockup (the visual target)
        │   ├── mockup.png           ← What "done" looks like
        │   └── mockup.html          ← Interactive mockup (if applicable)
        ├── V1 — Previous Attempts/  ← Failed iterations (learning record)
        │   └── screenshots, video   ← Evidence of what went wrong
        ├── V2 — Current Iteration/  ← Graded screenshots from current build
        │   └── screenshots, video   ← Evidence graded against Gold Star
        └── Accepted/                ← Final screenshots that matched Gold Star
            └── screenshots, video   ← Steve-approved proof
```

**Process:**
1. **Research** the Why — competitive analysis, rider needs
2. **Create mockup** → upload to Gold Star Target
3. **Steve approves mockup** — this is the visual acceptance criteria
4. **Agents build** — grading every screenshot against Gold Star
5. **Move failing screenshots to V{N}** — they're learning, not trash
6. **When screenshots match Gold Star** → move to Accepted → Ship

**Rules:**
- No code is written until the Gold Star mockup is approved
- Every screenshot is graded against the Gold Star before presenting to Steve
- Failed attempts move to V{N} folders — increment version on each iteration
- The Gold Star is the ONLY acceptance criteria for visual features
- Agents cannot change the Gold Star — only Steve approves changes

## Gotchas

| Issue | Solution |
|-------|----------|
| Claude builds first, tests second | What (tests) MUST be defined in Phase 3 before Phase 4 starts |
| "Close enough" on field tests | One failed row = not gold. Loop back. No exceptions. |
| Mini-why too big | If a mini-why needs >8 tasks in the plan, decompose further |
| Tech-speak in the Why | The Why is always rider voice. "Reroute after deviation" → "If I take a wrong turn, how do I get back?" |
| Skipping field tests | Unit + integration passing ≠ gold. Steve's live test is the final gate |
| Claude says "I can't test this" | Then define what Steve should test and what he should see. The What always exists. |
| Ferrostar/Valhalla gotchas compound | Check feedback memories before Phase 2 — past gotchas are encoded there |
| Multiple mini-whys in one PR | One mini-why = one PR. Don't bundle. |
| **Skipping integration tests** | Unit pass ≠ ready for field test. Run EVERY layer you can without Steve. |
| "I'll let Steve find the bugs" | YOU prove the How. Steve validates the Why. |
| **No visual proof** | Tests passing ≠ UI working. Screenshot each state and compare against Waze reference. |
| **SimulatedLocationProvider ≠ visual GPS** | Feeds Ferrostar only, NOT MapLibre. Use `simctl location start` with waypoints for visual QA. |
| **Guessing at APIs** | Read official docs FIRST. Build reference skill with key APIs. Stop trial-and-error. |
| **Mini-why too broad** | If it has multiple visible behaviors, split into super-mini-hows. Camera ≠ rerouting. |
| **No Waze reference screenshot** | Every visual mini-how needs a "what done looks like" reference. Waze is the gold standard. |
| **Self-grading trap** | "Nav UI is active" ≠ feature works. Session 70: presented z14 overview screenshot as proof of z18 follow-camera. Always grade against MEASURABLE criteria (zoom level, pitch, rotation, element position) — not "does the HUD show up." |
| **Vague acceptance criteria** | "Map auto-centers" is not testable. "Zoom == 18, pitch == 45°, trackingMode == .followWithCourse, map rotated to GPS course" IS testable. Every Layer 3 row needs numbers. |
| **Testing overlay, not experience** | Session 70: tested HUD chrome (trail bar, stats, speed badge) but NOT the map (zoom level, centering, POI clutter, trail styling). The rider sees the WHOLE SCREEN. Acceptance criteria must cover the map state too. |
| **Wrong mini-why** | Session 70: Steve said "map follows me" → built Waze turn-by-turn. The Why was FREE riding. Restate the Why back to Steve before writing code. |
| **Sending Steve to field test broken builds** | Session 70: sent Steve out 4 times with broken builds. NEVER present to Steve until YOUR screenshot matches the Gold Star. Steve's time is the most expensive resource. |
| **Wrong test coordinates** | Session 70: tested at UITesting coords (Lexington VA) with no MBTiles coverage. Always test where trail data EXISTS (Burning Rock: 37.68,-81.30). |
| **MBTiles zoom limits** | MBTiles range is z8-z16. Setting zoom > z16 = blank map (no trail tiles). z15 is max ride zoom. |
| **QA agent missing from workflow** | Builder agents can't grade their own work. Need a QA agent that compares screenshot vs Gold Star mockup before presenting to Steve. |

## Reference Files
- For the Why/How/What example → see this conversation (Session 69: reroute mini-why)
- For superpowers planning → invoke superpowers:writing-plans
- For execution → invoke superpowers:subagent-driven-development
- For DirtSync nav context → see memory/session68_handoff.md
- For master skill format → see vault/agents/skills/MASTER-SKILL-TEMPLATE.md

## Output
Each Golden Feature produces three artifacts:
1. **Why doc** — Mini-why + prioritization (saved to spec)
2. **How doc** — Workflow + tech stack + procedure (saved to plan)
3. **What doc** — Full test matrix with pass/fail results (saved to PR description)

## Checklist

### Before Starting
- [ ] Big Why is clear for this product
- [ ] Mini-why selected and stated in rider voice
- [ ] Existing code/features reviewed (don't rebuild what exists)
- [ ] Feedback memories checked for relevant gotchas

### During Execution
- [ ] What test matrix defined BEFORE any code written
- [ ] Tests written first (TDD)
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] No gotcha violations

### After Running
- [ ] Field test matrix presented to Steve
- [ ] All field test rows pass
- [ ] PR merged
- [ ] New gotchas appended to this skill
- [ ] Memory updated with session results
