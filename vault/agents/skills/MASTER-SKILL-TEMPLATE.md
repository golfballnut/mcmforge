# MCM Forge — Master Skill Template v1.1 (GOLD STANDARD)
> Last updated: March 23, 2026
> Used by: MCM Forge COO, DirtSync COO, all engineers
> Source: Anthropic's official skill guide + video breakdown + DirtSync 1-04 cherry-picks
> This is the GOLD STANDARD. All skills across all companies follow this format.

---

## How to Use This Template
1. Copy this structure when creating any new skill
2. Follow the principles below — they matter more than the format
3. After each skill runs, improve it (add gotchas, refine scripts, update data)
4. When this template itself improves, all future skills benefit
5. Run `/enhance-skill [skill-name]` to upgrade any existing skill to this standard

---

## Principles (Read This First)

### 1. Skills Shift Claude's Distribution — Don't Restate Defaults
A skill should push Claude AWAY from its default high-probability output. If Claude would already do it without the skill, don't put it in the skill. Encode YOUR lived experience, YOUR business context, things Claude doesn't know from training data.

**Bad:** "Search the web for competitor prices and compare them"
**Good:** "Nike balls at $0.15 and bulk at $0.10 are our floor. Anything below that is a red flag — either counterfeit or water-damaged inventory. We learned this after the Tampa batch in Q3."

### 2. Goal-Oriented, Not Step-by-Step (Don't Railroad)
Tell Claude WHAT you want and WHY, not HOW to do every step. Rigid recipes collapse Claude's solution space and give identical outputs every run.

**Bad (railroading):**
```
Step 1: Go to lostgolfballs.com
Step 2: Search for "Pro V1 Mint"
Step 3: Copy the price
Step 4: Compare to yesterday's price
```

**Good (goal-oriented):**
```
Find pricing opportunities we're missing across our competitor set.
Context: our current prices are in the attached sheet.
Focus on gaps > 15% — those are actionable.
```

### 3. Gotchas Are the Most Valuable Section
Like training a new employee — don't just tell them what to do, tell them what to watch out for. Every time a skill produces bad output, add a gotcha. This is the flywheel that makes skills compound in value.

### 4. Progressive Disclosure — Don't Cram Everything in One File
Keep SKILL.md focused (under 100 lines). Move detailed reference material to separate files. Claude loads only what it needs, keeping context high-signal.

### 5. Pre-Build Scripts — Save Tokens Every Run
If a skill calls an API, fetches data, or does repetitive computation, put it in a script. Claude composes the scripts and focuses on analysis/insight, not API plumbing.

### 6. Store Data Between Runs — Skills Should Have Memory
A skill that doesn't know what it did last time will repeat itself, re-flag the same issues, and waste your review time. Keep state in a data/ directory.

### 7. Descriptions Are Routing Logic, Not Marketing Copy
Include trigger keywords that users would actually say. Claude uses the description to decide when to auto-invoke the skill.

### 8. Pre-Made Decisions Eliminate Back-and-Forth (NEW in v1.1)
If a decision has already been made (which tools to use, how many items to analyze, what format to output), put it in a Pre-Made Decisions table. Claude should NOT ask about these — they're settled.

### 9. Definition of Done Prevents Incomplete Work (NEW in v1.1)
Every skill needs an explicit "you are NOT done until" section. Without it, Claude will do 80% of the work and call it finished. Be specific about what "done" means.

### 10. Checklists Catch What Goals Miss (NEW in v1.1)
Goal-oriented doesn't mean unstructured. Use Before/During/After checklists as verification gates — not as step-by-step recipes, but as "did you cover everything?" checks.

---

## Directory Structure

```
.claude/skills/skill-name/
├── SKILL.md              ← Goal + context + gotchas (core file, <100 lines)
├── references/           ← Detailed knowledge loaded on demand
│   ├── competitors.md    ← Who we track and why
│   ├── api-patterns.md   ← How our APIs work
│   └── categories.md     ← Classification schemas
├── scripts/              ← Pre-built scripts Claude composes
│   ├── fetch-data.py     ← API calls, data fetching
│   ├── analyze.py        ← Data processing, comparisons
│   └── output.py         ← Report generation, formatting
├── data/                 ← State between runs
│   ├── last-run.json     ← What happened last time
│   ├── history.json      ← Rolling 30-day data
│   └── flagged.json      ← Already-reported items (don't repeat)
└── config.json           ← Per-company config (optional, for shared skills)
```

---

## SKILL.md Format

```yaml
---
name: skill-name
description: >
  What this skill does in one sentence.
  Triggers on: keyword1, keyword2, keyword3, phrase user would say,
  another phrase, yet another trigger phrase.
argument-hint: "[optional-argument]"
allowed-tools: Read, Grep, Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/*), mcp__supabase__execute_sql
context: fork
model: sonnet
---

## Goal
[WHAT you want accomplished. 2-3 sentences. Focus on the outcome,
not the process. Give Claude room to figure out the best approach.]

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. [Specific deliverable exists]
2. [Quality bar met — be explicit]
3. [Output in correct location]
4. [State updated for next run]
5. [Checklist below is 100% complete]

**If any item above is false, you are NOT done. Go back and finish.**

## Pre-Made Decisions
**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| [What tool to use] | [Specific answer] |
| [How many items] | [Specific number] |
| [Output format] | [Specific format] |
| [Where output goes] | [Specific path or location] |

## Context
[Live data injected before Claude sees the prompt]
- Last run results: !`cat ${CLAUDE_SKILL_DIR}/data/last-run.json 2>/dev/null || echo "First run"`
- Relevant live data: !`python3 ${CLAUDE_SKILL_DIR}/scripts/fetch-data.py`
- Current date: !`date +%Y-%m-%d`

[Static context that Claude needs]
- Company: [which company this serves]
- Schedule: [when this runs]
- Cost cap: [budget per run]

## Gotchas
[THE MOST VALUABLE SECTION. Updated continuously.]
[Each gotcha should explain WHAT to avoid and WHY.]

| Issue | Solution |
|-------|----------|
| [Thing that goes wrong] | [How to handle it] |
| [Another failure mode] | [The fix] |
| [Edge case from production] | [What to do instead] |

## Reference Files
[Tell Claude what's available and WHEN to use each file]
- For competitor details → see [references/competitors.md]
- For API documentation → see [references/api-patterns.md]
- For category definitions → see [references/categories.md]

## Output
[One example of what GOOD output looks like. Not a rigid template —
Claude should adapt the format to what makes sense for this run's findings.]

## Checklist

### Before Starting
- [ ] [Prerequisite exists / is readable]
- [ ] [Context loaded from last run]
- [ ] [User approval if required]

### During Execution
- [ ] [Core deliverable created]
- [ ] [Quality bar met for each item]
- [ ] [No gotcha violations]

### After Running
- [ ] data/last-run.json updated with this run's key findings
- [ ] data/flagged.json updated (don't re-report same items)
- [ ] New gotchas appended if discovered
- [ ] [Skill-specific cleanup]
```

---

## Anti-Patterns (Don't Do These)

### 1. Railroading with Rigid Steps
Don't write "Step 1, Step 2, Step 3..." recipes. Give goals and context. Let Claude figure out the best approach. Use checklists for verification, not as a sequential process.

### 2. Restating Claude's Defaults
Don't put "search the web" or "analyze the data" in your skill. Claude already does this. Only include things that shift its behavior to YOUR specific needs.

### 3. One Giant File
If your SKILL.md is over 100 lines, you're cramming. Move reference material to references/, scripts to scripts/, data to data/.

### 4. Stateless Skills
If your skill doesn't know what it did last time, it will repeat itself. Always maintain data/last-run.json at minimum.

### 5. Marketing Descriptions
"A comprehensive tool for monitoring deployment lifecycle" tells Claude nothing about WHEN to trigger. Use trigger keywords instead: "Triggers on: check deploy, is CI passing, babysit this PR, watch the pipeline."

### 6. Duplicate Skills
Skills should be complementary, not overlapping. If two skills do similar things, merge them or make one call the other.

### 7. Missing Definition of Done
Without an explicit "you are NOT done until..." section, Claude will do 80% and stop. Always define the finish line.

### 8. Asking Settled Questions
If you've already decided something (tool choice, format, scope), put it in Pre-Made Decisions. Don't let Claude waste time asking about things that are already settled.

---

## Skill Quality Checklist (v1.1)

Before shipping any skill, verify:

- [ ] SKILL.md is under 100 lines
- [ ] Description includes 5+ trigger keywords/phrases
- [ ] Goal section describes WHAT, not HOW
- [ ] **Definition of Done is explicit with numbered criteria**
- [ ] **Pre-Made Decisions table covers all settled questions**
- [ ] Gotchas section has at least 3 entries (table format preferred)
- [ ] **Before/During/After checklists present**
- [ ] Reference files exist for any detailed knowledge (not crammed in SKILL.md)
- [ ] Scripts exist for any API calls or data fetching
- [ ] data/last-run.json pattern is documented
- [ ] allowed-tools is scoped (not wide open)
- [ ] Tested at least once with real data
- [ ] Flywheel: plan to add gotchas after first 3 runs

---

## Migration Guide (Existing Skills → Gold Standard)

For each existing skill:

1. **Extract the goal** — find the 2-3 sentences that describe WHAT the skill accomplishes
2. **Write Definition of Done** — explicit, numbered, "you are NOT done until" format
3. **Build Pre-Made Decisions table** — any decision that's been made goes here
4. **Extract gotchas** — pull out all edge cases, warnings → gotchas table format
5. **Add Before/During/After checklists** — verification gates, not sequential recipes
6. **Identify scripts** — any API calls, data fetching, or processing that repeats → scripts/
7. **Identify references** — any detailed knowledge (competitor lists, schemas, API docs) → references/
8. **Delete the recipes** — remove step-by-step instructions. Trust Claude with the HOW.
9. **Add trigger keywords** — write the description as routing logic
10. **Add data/ pattern** — define what state to maintain between runs

---

## Version History
- **v1.1 (Mar 23, 2026):** GOLD STANDARD. Added from DirtSync 1-04: Definition of Done, Pre-Made Decisions table, Before/During/After checklists. Added 3 new principles (#8-10), 2 new anti-patterns (#7-8), expanded quality checklist and migration guide.
- **v1.0 (Mar 23, 2026):** Initial template based on Anthropic's official skill guide + video breakdown. Covers: distribution shifting, anti-railroading, progressive disclosure, scripts, data between runs, gotchas flywheel.
