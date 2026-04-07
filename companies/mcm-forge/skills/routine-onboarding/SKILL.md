---
name: routine-onboarding
description: >
  Set up a recurring routine agent in MCM Forge. Creates the routine DB record, assigns an agent,
  configures the cron schedule, and validates locally before enabling auto-schedule.
  Triggers on: add routine, create routine, set up routine, new routine, schedule routine.
---

# Routine Onboarding

Routines are the eyes and ears of the team. They run on a schedule, check things,
and create issues when something needs attention. A bad routine = noise. A good routine
= problems caught before Steve sees them.

## Prerequisites

- Company is onboarded (`/company-onboarding`)
- The agent who will RUN this routine already exists (`/agent-onboarding`)
- You know: what to check, how often, what "bad" looks like

## Inputs Required

| Field | Example | Required |
|-------|---------|----------|
| Routine title | "Trail Data Health Check" | YES |
| Description | What it checks and why | YES |
| Assigned agent | Agent ID of the runner | YES |
| Cron expression | `0 8 * * *` (daily 8am) | YES |
| Timezone | America/New_York | YES |
| Project ID | Which project this routine belongs to | YES |
| Prompt template | The exact instructions for each run | YES |
| Concurrency policy | skip_if_active (default) | NO |
| Catch-up policy | skip_missed (default) | NO |

## Procedure

### Step 1: Write the Prompt Template

The prompt template is what the agent receives on every routine run. It must be:
- **Specific:** Exact checks to perform, exact commands to run
- **Measurable:** What does PASS look like? What does FAIL look like?
- **Actionable:** If something fails, what issue should be created?

Template structure:
```markdown
## Routine: <Title>

### What to Check
1. <specific check with exact command or query>
2. <specific check>
3. <specific check>

### Pass Criteria
- <measurable condition> = PASS
- <measurable condition> = PASS

### Fail Actions
- If <condition>: Create issue with title "<title>" and priority <level>
- If <condition>: Comment on existing issue <id>

### Report Format
Summarize results as:
- Checks run: N
- Passed: N
- Failed: N
- Issues created: <list or "none">
```

**CRITICAL:** Never write "check if things look good." Define EXACTLY what "good" means with numbers, thresholds, or concrete conditions. Visual grading is forbidden — measurable criteria only.

### Step 2: Create Agent Onboarding Files (if routine agent is new)

If the assigned agent doesn't exist yet, run `/agent-onboarding` first with:
- role: routine
- adapter_type: haiku or gemini (routines should be cheap)
- maxTurnsPerRun: 5 (routines are short)

The 3-file pattern for routine agents:
1. **AGENTS.md** — routine agent identity + domain
2. **HEARTBEAT.md** — the routine procedure (same as prompt template but in file form)
3. **TOOLS.md** — available commands and limits

SOUL.md is optional for routine agents (they don't need personality, just precision).

### Step 3: Create DB Record

```sql
INSERT INTO forge.routines (
  id, company_id, project_id, title, description,
  assignee_agent_id, priority, status,
  cron_expression, timezone,
  concurrency_policy, catch_up_policy,
  prompt_template
) VALUES (
  gen_random_uuid(),
  '<company-id>',
  '<project-id>',
  '<Routine Title>',
  '<what this routine checks and why>',
  '<agent-id>',
  'medium',
  'paused',            -- ALWAYS start paused
  '<cron-expression>',
  '<timezone>',
  'skip_if_active',    -- default: don't stack up
  'skip_missed',       -- default: don't catch up
  '<prompt-template>'
);
```

**IMPORTANT:** Always create routines with `status = 'paused'`. Never activate until Step 4 passes.

### Step 4: Dial In Locally

Run the routine MANUALLY before enabling auto-schedule:

1. Trigger the routine by hand (create an issue with the prompt template, assign to the agent)
2. Watch the run in the dashboard
3. Check:
   - Did it run the right checks?
   - Did it produce a clear report?
   - Did it correctly identify PASS vs FAIL?
   - Did it create issues for failures (if applicable)?
   - Was the cost reasonable for a routine? (should be < $0.50)
4. **If output is good** -> proceed to Step 5
5. **If output is bad** -> rewrite the prompt template, retry

**Do NOT skip this step.** A routine that runs every 6 hours and produces garbage = 4x garbage per day at $2/day = $60/month wasted.

### Step 5: Activate

Only after local dial-in passes:

```sql
UPDATE forge.routines SET status = 'active' WHERE id = '<routine-id>';
```

### Step 6: Monitor First Auto-Run

After the first cron-triggered run:
- Check the `routine_runs` table for the execution
- Verify the linked issue was created correctly
- Verify the agent's output matches the local dial-in quality
- Check cost

## Cron Expression Quick Reference

| Expression | Meaning |
|-----------|---------|
| `0 8 * * *` | Daily at 8:00 AM |
| `0 */6 * * *` | Every 6 hours |
| `0 8 * * 1-5` | Weekdays at 8:00 AM |
| `*/30 * * * *` | Every 30 minutes |
| `0 8,20 * * *` | Twice daily (8 AM, 8 PM) |

## Completion Report

```
Routine Onboarded: <Title>
- ID: <uuid>
- Company: <company-name>
- Agent: <agent-name>
- Schedule: <cron> (<timezone>)
- Local dial-in: PASS/FAIL
- Status: paused | active
- Estimated cost: $<amount>/run
```

## CONSEQUENCES

- Skipping local dial-in = bad routine runs on schedule = noise + wasted budget
- Vague prompt template = agent guesses what to check = useless reports
- Starting as active (not paused) = first run might be garbage with no review
- No measurable criteria = visual grading = unreliable pass/fail
