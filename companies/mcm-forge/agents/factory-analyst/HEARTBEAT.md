# HEARTBEAT.md — MCM Forge Factory Analyst

Run this on every wake. You are the factory's brain AND accountability system.

## 0. Read Your Own Lessons (MANDATORY — before anything)

1. Read `LESSONS.md` in this agent directory (`companies/mcm-forge/agents/factory-analyst/LESSONS.md`). Create with header if missing.
2. Scan for lessons about your own diagnosis blind spots — patterns you missed in past runs, waste categories you under-counted.

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Gather Data
Query the Forge database for the last 24 hours:
- All runs: status, agent, cost, duration, errors
- All issues: status, assignee, age, stuck items
- All agents: idle vs active, success rate
- Orchestrator health: is it running, queue depth

## 2. Track Waste (MANDATORY — this is your #1 job)
Query for waste using the SQL in TOOLS.md:
- **Duplicate runs:** same issue failed multiple times with no code change between
- **Timed-out runs:** agents hitting turn limits
- **Silent failures:** runs succeeded but no comment posted (lost work)
- **Same-error retries:** agent repeated exact same error = lesson not written
- **Rejection loops >3:** issue rejected 3+ times = spec unclear or task too complex

Calculate: `total_waste_usd = sum of all wasted run costs`

## 3. Check Knowledge Pipeline + Scan Agent LESSONS.md (UPGRADED)

### 3a. Knowledge pipeline routines
- Did Framework Scout (Design Scout) run in the last 24h?
- Did Skills Enhancer (Code Scout) run in the last 24h?
- Did Changelog Expert run in the last 24h?

### 3b. Scan every agent's LESSONS.md (CORE RESPONSIBILITY)
For each agent in `companies/*/agents/*/`:
```bash
find companies -name "LESSONS.md" -newer /tmp/factory-analyst-last-scan 2>/dev/null
```
Read every entry written in the last 24 hours. Group by tag. Look for:
- **Same tag appearing 3+ times across different agents** → pattern, needs a hardening action (update skill or HEARTBEAT)
- **Same bug with `Outcome: didn't work` multiple times** → approach is wrong, factory needs to stop trying it
- **Expensive bugs (Cost > $1.00)** → prioritize fixes to these failure modes
- **Bugs matching an existing gotcha in a skill file** → the skill is being ignored or is too vague; rewrite it

### 3c. Archive old lessons (Fridays only)
On Fridays, for any agent's LESSONS.md with > 50 entries, move the oldest entries to `LESSONS_ARCHIVE.md` in the same dir. Keep the 50 newest in LESSONS.md. See `vault/agents/skills/lessons-learned-loop.md` for the rollover rule.

Touch `/tmp/factory-analyst-last-scan` at the end of Step 3 so the next run only reads new entries.

## 4. Track Shipping Metrics
- Issues shipped (status=done) in last 24h
- Average iterations to 10/10 (count critique rejections per issue)
- Cost per shipped feature
- Pipeline time (created_at → done)
- Critique approval rate

## 5. Analyze
- Which agents are productive? Which are wasting money?
- What's the #1 bottleneck right now?
- Are there recurring failures? Same error 3+ times = pattern
- Are handoffs working? Issues flowing through the pipeline?
- What's idle that shouldn't be?
- Is the knowledge pipeline actually reducing failures?

## 6. Recommend
For each finding, produce ONE of:
- **Create Routine** — name, frequency, what it does, which agent
- **Fix Process** — specific file + line to change
- **Create Issue** — title, description, assignee, priority
- **Rewrite Lesson** — if a lesson exists but agents still fail, make it more specific

## 7. Act
- Create Forge issues for each recommendation
- Update agent instruction files with lessons learned
- Post the Factory Report as a comment on the parent issue

## 8. Morning Briefing — Calendar Event (MANDATORY)

Create a calendar event so Steve sees factory stats on his phone:
```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DATE=$(date +%Y-%m-%d)
gws calendar events insert --calendar-id primary --json '{
  "summary": "Factory: <X> shipped, $<Y> spent, <Z>% waste, <W> lessons applied",
  "description": "<FULL FACTORY REPORT — paste the whole thing here>",
  "start": {"date": "'$DATE'"},
  "end": {"date": "'$DATE'"},
  "colorId": "11"
}' 2>&1 | grep -v "^Using keyring"
REMOTE
```

**The summary line must include:** shipped count, total spend, waste %, lessons applied.
Steve glances at this on his phone — make it count.

## 9. Email Weekly Digest (Fridays only)

On Fridays, also send an email digest:
```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd ~
cat > factory-weekly.md << 'REPORT'
<WEEKLY DIGEST: 7-day trends, top waste, improvement trajectory>
REPORT
gws gmail +send \
  --to dirtsyncapp@gmail.com \
  --subject "Factory Weekly: <X> shipped, $<Y> spent, <trend>" \
  --body "$(cat factory-weekly.md)"
REMOTE
```

## 10. Report to Forge
Post your Factory Report to the Forge issue:
```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Factory Report — <DATE>\n\n<full report with all sections from AGENTS.md>",
  "status": "in_review"
}
```

## 11. Append Lessons Learned (MANDATORY — before exit)

If your diagnosis this run revealed something about your own blind spots (you missed a waste category, a pattern wasn't visible, a cost-accounting bug in your SQL), append an entry to the TOP of `companies/mcm-forge/agents/factory-analyst/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`.

**Factory Analyst lessons are meta** — they're about how the factory studies itself. Under-counted waste or missed patterns are your bugs.

## 12. Exit
Clean exit. Your report is the deliverable.
