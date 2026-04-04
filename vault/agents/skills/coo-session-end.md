---
name: coo-session-end
description: >
  Gold COO session wrap-up. Saves everything so the next session starts at full speed.
  Run this at the END of every session before stopping.
  Triggers on: end session, wrap up, session end, save progress, handoff,
  done for now, stopping, wind down, save state.
allowed-tools: Read, Write, Edit, Bash, mcp__supabase__execute_sql
context: fork
model: sonnet
---

## Goal

Capture every decision, discovery, and state change from this session so the
next session starts with zero ramp-up. Write to memory, calendar, and Drive.
The next Claude session should feel like continuing the same conversation.

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL 7 STEPS ARE COMPLETE:**
1. Session handoff memory file created/updated
2. MEMORY.md index updated
3. Calendar events updated with progress notes
4. Battle plan / ship plan checklist updated
5. All code committed and pushed
6. Google Drive session log written
7. Next session agenda created in calendar

## Pre-Made Decisions

| Decision | Answer |
|----------|--------|
| Memory location | `~/.claude/projects/.../memory/session{N}_handoff.md` |
| Calendar tool | `gws calendar events patch` with `--json` for body |
| Drive folder | DirtSync session logs folder (see reference_drive_folder_ids.md) |
| Commit style | Descriptive message + Co-Authored-By |
| Time zone | America/New_York |

## Execution

### Step 1: Session Handoff Memory
Write/update `session{N}_handoff.md` with:
- What was built (with screenshot proof references)
- Key technical discoveries (architecture, gotchas, bugs found)
- What's broken or incomplete
- Exact next steps for the next session
- Branch names, PR numbers, file paths changed

### Step 2: Update MEMORY.md Index
- Add/update the session handoff entry
- Add any new feedback rules discovered
- Add any new project context
- Archive superseded session handoffs

### Step 3: Update Calendar
For each feature shipped or progressed:
```bash
gws calendar events patch --params '{"calendarId":"primary","eventId":"ID"}' \
  --json '{"summary":"STATUS: Event Name","description":"Progress notes..."}'
```
- Use colorId "2" (sage/green) for shipped items
- Add progress notes to code freeze and demo events

### Step 4: Update Battle Plan / Ship Plan
Check for active battle plans in `vault/decisions/` and update checklists:
- [x] completed items
- [ ] remaining items
- Add new items discovered during session

### Step 5: Commit and Push
```bash
git add -A && git status
git commit -m "session {N} wrap-up: {summary}"
git push
```
Verify branch is pushed. Note any uncommitted changes.

### Step 6: Google Drive Session Log
Write a session summary to Google Drive for long-term reference:
```bash
gws drive files create --params '{"name":"Session {N} — {date} — {title}","parents":["FOLDER_ID"],"mimeType":"application/vnd.google-apps.document"}' \
  --json '{"title":"Session {N}"}'
```
Include: features shipped, PRs created, decisions made, blockers found.

### Step 7: Create Next Session Agenda
Create or update a calendar event for the next session:
- Title: "DirtSync COO: {next priority}"
- Description: exact steps to start, files to read, what to build
- Include the `dirtsync-routing-architect` skill load instruction

## Output

```markdown
# Session {N} Wrap-Up Complete

## Saved To:
- Memory: session{N}_handoff.md
- Calendar: {N} events updated
- Drive: Session log written
- Git: {branch} pushed ({N} commits)

## Next Session Starts With:
1. Load `dirtsync-routing-architect` skill
2. Read session{N}_handoff.md
3. {First task}
4. {Second task}

## Momentum Score: {X}/10
```

## Gotchas

| Issue | Solution |
|-------|----------|
| Calendar patch needs eventId | Always list events first to get IDs |
| gws outputs "Using keyring" line | Pipe through `grep -v "^Using keyring"` |
| Large memory files slow context | Keep handoffs under 200 lines, archive old ones |
| Relative dates in memory decay | Always use absolute dates (2026-03-30, not "today") |
| Don't save ephemeral task state | Only save what's useful in FUTURE sessions |
