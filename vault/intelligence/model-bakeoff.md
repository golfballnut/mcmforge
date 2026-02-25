# Model Bake-Off Results

> This file tracks comparative performance of Claude, Gemini, and Codex across task types.
> Updated by agents and COO after each significant task execution.
> Related: [[agents/bakeoff/]] for detailed per-task results.

## Status: In Progress (ongoing evaluation)

---

## Current Model Assignments (Best Known)

| Task Type | Primary Model | Backup Model | Notes |
|-----------|--------------|--------------|-------|
| Complex code tasks (3+ files) | Claude | Gemini | Claude follows plans precisely, less scope creep |
| Simple bug fixes (1 file) | Codex | Claude | Codex is fastest for focused changes |
| Visual bug analysis | Claude | Gemini | Requires vision capability (rules out Codex) |
| Planning and architecture | Gemini | Claude | Gemini thinks broadly, Claude is more focused |
| Research and analysis | Gemini | Claude | Gemini is fast, handles large context well |
| SEO content generation | Gemini | Claude | Gemini produces more natural-sounding content |
| Code review | Claude | Gemini | Claude is most thorough at finding issues |
| Quick PR creation | Codex | Claude | Codex ships fastest for clear-scoped tasks |

---

## Test Results

### Test 1: Gemini 3.1 Pro -- Code Task (2026-02-24)
- **Task:** Add health check endpoint to MCMForge dashboard
- **Model:** Gemini 3.1 Pro Preview
- **Result:** PR created successfully
- **Quality:** POOR -- went WAY beyond scope
  - Touched every dashboard page instead of just adding one endpoint
  - 8 merge conflicts with concurrent changes
  - Classic scope creep pattern
- **Verdict:** Can write code and create PRs. Needs MUCH tighter scoping in prompts.
- **Action:** Add explicit "What This Does NOT Change" section to all Gemini prompts
- **Lesson learned:** Gemini interprets tasks broadly; Claude interprets them literally. Match model to task accordingly.

### Test 2: Overnight Research Tasks (2026-02-24)

| Model | Tasks Assigned | Tasks Completed | Quality | Avg Time | Notes |
|-------|---------------|----------------|---------|----------|-------|
| Claude | 7 | 6 | Good | ~8 min | 1 stuck (HGB SKUs -- task was underspecified), rest solid |
| Gemini | 8 | 8 | Good | ~5 min | All completed. Intermittent 429 rate limits but retried successfully |
| Codex | 3 | 3 | Good | ~3 min | Fast execution, focused output. Limited to simpler tasks. |

**Key observations:**
- Claude is most reliable for tasks requiring precision
- Gemini is fastest but needs rate limit handling
- Codex is fastest for simple tasks but has narrower capability range
- All three can handle research tasks; differentiation shows in code tasks

### Test 3: Telegram Routing Fix (2026-02-24)
- **Task:** Fix Telegram webhook to route tasks by company (not hardcode DirtSync)
- **Model:** Claude (edge function rewrite)
- **Result:** Successfully deployed edge function v5 with multi-company routing
- **Quality:** GOOD -- focused changes, clear logic, no scope creep
- **Verdict:** Claude excels at system-level code with clear requirements

### Test 4: Research Email Formatting (2026-02-24)
- **Task:** Fix raw markdown in research delivery emails
- **Model:** Claude
- **Result:** Fixed -- emails now render HTML properly
- **Quality:** GOOD -- minimal, targeted fix
- **Verdict:** Claude handles format/output bugs well

---

## Model Strengths Matrix

| Capability | Claude | Gemini | Codex |
|-----------|--------|--------|-------|
| Follow precise instructions | 9/10 | 6/10 | 7/10 |
| Broad creative thinking | 7/10 | 9/10 | 5/10 |
| Code quality | 9/10 | 7/10 | 8/10 |
| Speed | 6/10 | 8/10 | 9/10 |
| Scope discipline | 9/10 | 4/10 | 8/10 |
| Vision (screenshots) | YES | YES | NO |
| Multi-file changes | 9/10 | 7/10 | 6/10 |
| Research depth | 8/10 | 9/10 | 5/10 |
| Error handling | 8/10 | 7/10 | 6/10 |
| PR descriptions | 9/10 | 7/10 | 6/10 |

---

## Model Configuration Notes

### Claude (Claude Code 2.1.39)
- Flags: `--print --dangerously-skip-permissions`
- Strengths: Precision, instruction following, code quality
- Weaknesses: Slower than Gemini/Codex, can be verbose
- Best for: Complex multi-file code tasks, code review, visual bugs

### Gemini (CLI 0.29.7, gemini-3.1-pro-preview)
- Flags: `-m gemini-3.1-pro-preview`
- Strengths: Speed, broad knowledge, research, creative solutions
- Weaknesses: Scope creep, sometimes over-engineers, 429 rate limits
- Best for: Research, planning, SEO content, competitive analysis
- **Critical:** Always include explicit scope boundaries in prompts

### Codex (CLI 0.99.0)
- Flags: `exec --dangerously-bypass-approvals-and-sandbox`
- Strengths: Speed, focus, minimal output
- Weaknesses: No vision, limited multi-file capability, simpler reasoning
- Best for: Quick focused fixes, single-file changes, script generation

---

## Upcoming Tests Needed
- [ ] Head-to-head: Claude vs Gemini on scoped code tasks with acceptance criteria
- [ ] Codex on multi-file task (test its limits)
- [ ] Gemini with strict scope boundaries vs previous unbounded prompt
- [ ] Claude on large research task (test speed vs Gemini)
- [ ] All three on identical DirtSync feature task (apples-to-apples comparison)

---

## Related
- Skill templates: [[agents/skills/]] (model recommendations per skill)
- Decision: [[decisions/2026-02-24-skills-architecture.md]]
- Company (manages agents): [[companies/mcmforge.md]]
