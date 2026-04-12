# Skill: Lessons Learned Loop

> Last updated: April 9, 2026
> Used by: Every MCM Forge agent — specialists, routine agents, QA, Critique, Ship, CEO/COO, Factory Analyst
> Origin: Session of April 9, 2026 — closing the silent-failure gap where agents start cold every heartbeat and repeat bugs the factory already knows how to fix (`feedback_agent_learning_gap.md`, `project_auto_learning_loop_needed.md`)

---

## Goal

Make the factory's hard-won knowledge persist across agent restarts. Every agent keeps a `LESSONS.md` file in its own directory. On wake, the agent reads it and applies relevant lessons before touching code. On exit, the agent appends any non-trivial bugs it encountered this run — what broke, what it tried, whether the fix worked, and why. The next wake starts smarter than the last.

This skill is the enforcement contract. It is the reason Anvil Loop's Record phase exists. Without it, every strike re-learns what the factory already knew.

## Definition of Done

**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**

1. `LESSONS.md` exists in your agent directory (create with header if missing)
2. You read `LESSONS.md` **before** writing any code or running any tool that changes state
3. If a bug matches a recorded lesson, you try the recorded fix first
4. You appended one entry per non-trivial bug encountered this run, using the format below
5. Newest entries are at the top of the file
6. The `LESSONS.md` change is committed with the rest of your work on the same branch
7. You did not delete or edit older entries — append-only
8. If the file is over 50 entries, the oldest are rolled into `LESSONS_ARCHIVE.md` (Factory Analyst handles this weekly — you do not)

**If any item above is false, you are NOT done. This is enforced by HEARTBEAT.md step 1 and the HEARTBEAT.md final step.**

## Pre-Made Decisions

**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Where LESSONS.md lives | Your own agent directory — the same folder as your AGENTS.md and HEARTBEAT.md |
| File format | Markdown, newest entry at the top, `##` heading per entry with date and short title |
| Append-only | Yes. Never edit or delete older entries. Archival is Factory Analyst's job. |
| When to read | HEARTBEAT.md step 1 — before touching code or state |
| When to append | HEARTBEAT.md final step — before exit |
| What counts as a "non-trivial bug" | Anything that cost you a strike, burned > $0.20, or matched a gotcha in a skill file |
| What does NOT count | Typos, lint errors fixed on first try, syntax errors from your own code you caught immediately |
| Max entries | 50. Factory Analyst rolls older ones into `LESSONS_ARCHIVE.md` on Fridays. |
| Who edits your LESSONS.md | Only you, the agent who owns that directory. Never another agent. `feedback_agent_file_conflicts.md`. |

---

## Entry Format

Append this block to the top of `LESSONS.md`, immediately under the `---` divider that follows the header:

```markdown
## YYYY-MM-DD — <short title of the bug>
**Bug:** <what actually broke — one sentence, concrete>
**Attempted fix:** <what you tried — one sentence>
**Outcome:** <worked | didn't work | partial>
**Why:** <root cause if known, "unknown" if not>
**Cost:** $<approximate run cost in USD>
**Tag:** <optional keyword tag for grep — e.g. ferrostar, maplibre, supabase, xcuitest>
```

**Rules:**
- Date is the day the bug was hit, in ISO format
- Title is 3-8 words, grep-friendly, not a full sentence
- Bug line is concrete — "crash in MapCoordinator", not "map broke"
- Attempted fix is what YOU tried, not what you wish you had tried
- Outcome is one of three words. If "partial", add a second line explaining what's still broken
- Why is optional — "unknown" is acceptable and honest
- Cost is rounded to cents. This lets Factory Analyst calculate waste.
- Tag helps Factory Analyst grep for patterns across agents

---

## When to Apply a Recorded Lesson

On wake, scan `LESSONS.md` for entries tagged or titled with anything relevant to your current issue. If you find a match:

1. **Read the full entry** — not just the title
2. **Check the Outcome**:
   - `worked` → try this fix FIRST on your current bug. Don't reinvent.
   - `didn't work` → don't repeat it. Note what failed, try something different.
   - `partial` → read the note, understand what's still broken, decide if it's relevant.
3. **Record the outcome of applying the lesson** — this is what the Reflect phase of Anvil Loop uses to harden skills

The point is not to follow lessons blindly. The point is to never burn money re-learning something the factory already paid for.

---

## HEARTBEAT.md Wiring

Every agent's HEARTBEAT.md must have these two steps:

**New Step 1 (prepend, before any other step):**

```markdown
## 1. Read Your Lessons
Read `LESSONS.md` in your agent directory. If the file doesn't exist, create it with this header:

    # Lessons Learned — <Your Agent Name>

    Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

    ---

Scan for entries relevant to your current issue. If you find a match, try the recorded fix FIRST before inventing a new approach.
```

**New Final Step (append, before exit):**

```markdown
## Final — Append Lessons Learned
For every non-trivial bug you hit this run, append an entry to `LESSONS.md` using the format from `vault/agents/skills/lessons-learned-loop.md`. Commit the file change with the rest of your work. If you encountered no non-trivial bugs, skip this step — empty entries are noise.
```

---

## Gotchas

| Issue | Solution |
|-------|----------|
| Agent skips reading LESSONS.md on wake | HEARTBEAT step 1 is mandatory. Critique Agent should flag runs where LESSONS.md was not accessed. |
| Agent writes vague entries like "fixed a bug" | Entry must include concrete bug line, concrete attempted fix, and outcome. Vague entries are deleted by Factory Analyst weekly audit. |
| Agent edits older entries to "clean them up" | Hard fail. Append-only. Older entries are historical record — their wrongness is data, not dirt. |
| Two agents edit the same LESSONS.md | Hard fail. Every agent owns exactly one LESSONS.md — its own. No cross-agent writes. |
| LESSONS.md grows past 50 entries | Factory Analyst rolls the oldest into LESSONS_ARCHIVE.md on Fridays. Do not manually trim. |
| Agent uses relative dates like "yesterday" | Hard fail. Use ISO dates (YYYY-MM-DD) so entries remain meaningful after a week. Memory rule from project memory system. |
| Agent writes lessons on successful runs with no bugs | Don't. Empty "ran fine" entries are noise. Only record actual bugs. |
| Agent forgets to commit LESSONS.md | HEARTBEAT final step says "commit the file change." This is part of the work, not separate. |
| Lessons never get applied — agents keep repeating the same bug | Factory Analyst's Reflect phase. If the same tag appears 3+ times across agents, hardening moves into a skill file or HEARTBEAT update. Weekly. |
| Agent writes "root cause: unknown" every time | Acceptable but suspicious. If half your entries are "unknown", your systematic debugging skill is not being applied — check `superpowers:systematic-debugging`. |

---

## Reference Files

- Master Anvil Loop pattern → `vault/agents/skills/anvil-loop.md`
- Systematic debugging → `superpowers:systematic-debugging`
- Agent conflict memory → memory `feedback_agent_file_conflicts.md`
- Learning gap memory → memory `feedback_agent_learning_gap.md`
- Auto-learning gap → memory `project_auto_learning_loop_needed.md`

---

## Output

This skill produces ongoing mutations, not single artifacts:

1. A `LESSONS.md` in every agent directory, growing over time
2. A `LESSONS_ARCHIVE.md` per agent, rolled weekly by Factory Analyst
3. Skill and HEARTBEAT updates when patterns repeat 3+ times (Reflect phase of Anvil Loop)

---

## Checklist

### Before Starting (Wake)
- [ ] `LESSONS.md` exists in your agent dir — if not, create with header
- [ ] Read the file top-to-bottom (not just scan)
- [ ] Identify any entries relevant to your current issue
- [ ] If a `worked` lesson matches, plan to try that fix first

### During Execution (Strike)
- [ ] When a bug appears, check `LESSONS.md` first
- [ ] Note what you attempt and whether it works (you'll need this for the final step)
- [ ] Track approximate run cost so you can include it in the entry

### After Running (Exit)
- [ ] One entry per non-trivial bug encountered — no more, no less
- [ ] Each entry has all six required fields (Bug, Attempted fix, Outcome, Why, Cost, Tag)
- [ ] Newest entries at the top of the file
- [ ] `LESSONS.md` change committed with the rest of your work on the same branch
- [ ] You did not touch any other agent's `LESSONS.md`
