# Phase 5: Post-Ship

**Always the last phase. Fires on every outcome — success, rejection, AND blocked.**

---

## Step 15: STOP

**Do NOT start the next issue. Wait for COO review.**

The COO will:
- Read your issue comments
- Look at your screenshots and video
- Check the test results and step tracker
- Post a review (approve or reject with reasoning)
- Merge your PR (so the next issue builds on your work)
- Rate your run 1-10 with gap tags

**WHY MERGE MATTERS:** If COO approves but forgets to merge, the next branch won't include your fix. The bug will reappear. This has happened before.

**Track:** `step_15: {done: true}`

---

## Step 15.5: Propose Improvements

**MANDATORY on every outcome.** Success, rejection, and blocked runs ALL teach something.

Reflect: did you hit any obstacle NOT covered by the skill or knowledge base?

**If YES:**
```
## Step 15.5: Skill Improvement Proposal

### Obstacle
[What went wrong that the skill didn't prepare you for]

### What I did
[The workaround or fix you discovered]

### Proposed skill change
[Exact step or rule to add/modify in the skill phases]

### Proposed knowledge entry
- Title: [short, searchable]
- Tags: [2-5 tags]
- Confidence: proven | suspected
- Body: [root cause + what worked + what didn't]
```

**If NO obstacles:** Post "Step 15.5: No skill gaps encountered."

**Update your LESSONS.md:**
```markdown
## YYYY-MM-DD — <short title>
**Bug:** <what went wrong>
**Attempted fix:** <what I tried>
**Outcome:** <worked / didn't work>
**Why:** <root cause if known>
```

**Track:** `step_15.5: {done: true, proposal: true/false, lesson_added: true/false}`

---

**All phases complete. Wait for COO.**
