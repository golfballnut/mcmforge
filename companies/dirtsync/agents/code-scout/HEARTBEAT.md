# HEARTBEAT.md — DirtSync Skills Enhancer (Code Scout)

Run this on every wake. You make agents smarter.

## 1. Read Assignment
- Read the issue and ALL comments
- If routine (daily enhancement): follow the full scan below
- If specific (one framework/agent): focus on that area only

## 2. Gather Intelligence Sources

### A. Framework Scout Report (latest)
```bash
# Find latest framework report in Forge issues
curl -s http://127.0.0.1:3200/api/agent/me/inbox \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" | python3 -c "
import sys,json
issues = json.load(sys.stdin)
for i in issues:
  if 'Framework' in i.get('title','') or 'Scout' in i.get('title',''):
    print(f\"{i['identifier']}: {i['title']}\")
"
```
Read the full issue with comments to get the Framework Scout's findings.

### B. QA Iterations (Google Drive)
```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# List all issue folders in QA Iterations
gws drive files list --params "q='1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X' in parents and trashed=false" 2>&1 | grep -v "^Using keyring"
REMOTE
```
For each issue folder, check if there are critique.md and fix-list.md files.

### C. Factory Analyst Reports
Check recent FORGE issues from Factory Analyst for failure patterns.

## 3. Detect Patterns

Look for:
- **Same rejection 2+ times** across different issues → permanent instruction
- **Framework version gap** → version-specific instructions
- **Build error pattern** → add to TOOLS.md "Common Errors" section
- **New best practice** from reference repos → add to relevant agent

## 4. Write Lessons into Agent Files

**CRITICAL: Read the file FIRST, then edit. Never overwrite.**

Agent instruction files on Mini:
```
/Users/dirtsyncmini/MCMForge/companies/dirtsync/agents/
  ios-builder/    → AGENTS.md, HEARTBEAT.md, TOOLS.md
  test-runner/    → AGENTS.md, HEARTBEAT.md, TOOLS.md
  critique-agent/ → AGENTS.md, HEARTBEAT.md, TOOLS.md
  qa-rider/       → AGENTS.md, HEARTBEAT.md, TOOLS.md
```

For each lesson:
1. Read the target file
2. Find the right section (or create a new ### section)
3. Add the lesson with source tag
4. Re-read the file to verify coherence

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
cd ~/MCMForge

# Example: Add a lesson to iOS Builder
cat >> companies/dirtsync/agents/ios-builder/AGENTS.md << 'LESSON'

### Lesson: <Title> (Source: <where you learned this>)
<Specific, actionable instruction with file paths and code examples>
LESSON

# Verify the edit
tail -10 companies/dirtsync/agents/ios-builder/AGENTS.md
REMOTE
```

## 5. Clear Agent Sessions

After updating instructions, clear session_id so agents read the new files:
```bash
# Via Forge API or direct SQL
curl -X PATCH http://127.0.0.1:3200/api/agent/issues/<ISSUE_ID> \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -d '{"comment": "Skills enhanced. Cleared sessions for: iOS Builder, Test Runner."}'
```

**IMPORTANT:** After writing lessons, the orchestrator should clear session_id for affected agents. Post which agents were updated in your report.

## 6. Commit Changes

```bash
ssh dirtsyncmini@100.125.184.57 << 'REMOTE'
cd ~/MCMForge
git add companies/dirtsync/agents/*/AGENTS.md companies/dirtsync/agents/*/TOOLS.md companies/dirtsync/agents/*/HEARTBEAT.md
git commit -m "enhance: skills update from Code Scout — <date>

<list of lessons added>

Co-Authored-By: Code Scout <agent@mcmforge.com>"
git push origin feature/d-and-c-fixes
REMOTE
```

## 7. Post Report to Forge

```
PATCH /api/agent/issues/<ISSUE_ID>
{
  "comment": "## Skills Enhancement Report — <DATE>\n\n### Lessons Written\n| Agent | File | What | Source |\n...\n\n### Patterns Detected\n...\n\n### Sessions Cleared\n- <agent list>",
  "status": "done"
}
```

## 8. Exit
Clean exit. Agents are now smarter for their next run.
