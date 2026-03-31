---
name: coo-session-start
description: >
  Gold COO session bootstrap. Loads full context in 60 seconds so you ship from minute one.
  Run this at the START of every session before doing anything.
  Triggers on: start session, new session, good morning, let's go, what's the plan,
  where did we leave off, session start, boot up, catch me up.
allowed-tools: Read, Bash, Glob, Grep, mcp__supabase__execute_sql
context: fork
model: sonnet
---

## Goal

Bootstrap a fresh Claude session with full project context in under 60 seconds.
Load memory, check calendar, read latest handoff, assess git state, and present
a battle-ready brief. The session should feel like continuing yesterday's conversation.

## Definition of Done
**YOU ARE NOT DONE UNTIL THE BRIEF IS PRESENTED:**
1. Latest session handoff loaded from memory
2. Today's calendar checked for deadlines/events
3. Git status assessed (branch, uncommitted changes, open PRs)
4. Active battle plan / ship plan located and read
5. Infrastructure health checked (Mac Mini PM2)
6. Brief presented to Steve with priority-ordered action items

## Pre-Made Decisions

| Decision | Answer |
|----------|--------|
| Memory location | `~/.claude/projects/.../memory/MEMORY.md` → latest session handoff |
| Calendar range | Today + next 3 days |
| Git repos | MCMForge + DirtSync |
| Key skills to load | `dirtsync-routing-architect` for any routing work |
| Brief format | Phone-readable, 1 page max |

## Execution

### Step 1: Load Memory (15 seconds)
```bash
# Read the memory index
cat ~/.claude/projects/.../memory/MEMORY.md

# Read the latest session handoff (first entry under "Project")
cat ~/.claude/projects/.../memory/session{latest}_handoff.md
```

### Step 2: Check Calendar (10 seconds)
```bash
gws calendar events list --params '{
  "calendarId":"primary",
  "timeMin":"TODAY_START",
  "timeMax":"TODAY+3_END",
  "singleEvents":true,
  "orderBy":"startTime"
}'
```
Flag: deadlines, code freezes, demos, birthday events.

### Step 3: Git Status (10 seconds)
```bash
# MCMForge
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git branch --show-current && git status --short | head -10
gh pr list --state open | head -5

# DirtSync
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync
git branch --show-current && git status --short | head -10
gh pr list --state open | head -5
```

### Step 4: Battle Plan (10 seconds)
```bash
# Find active battle plans / ship plans
ls -t vault/decisions/*.md | head -3
# Read the most recent one
```

### Step 5: Infrastructure (5 seconds)
```bash
# Check Mac Mini PM2 status (if accessible)
ssh dirtsyncmini@100.125.184.57 'pm2 list' 2>/dev/null || echo "Mini not reachable"
```

### Step 6: Present Brief (10 seconds)

## Output Format

```markdown
# COO Session Brief — {date}

## Where We Left Off
{1-2 sentences from latest handoff}

## Today's Calendar
| Time | Event | Priority |
|------|-------|----------|
| ... | ... | ... |

## Deadlines
- Code Freeze: {date} ({days} away)
- Birthday Ride: {date} ({days} away)

## Git Status
- MCMForge: {branch}, {N} uncommitted changes
- DirtSync: {branch}, PR #{N} open

## Priority Stack (What to Build)
1. **{Highest impact item}** — {why it's first}
2. **{Second item}** — {dependency or deadline}
3. **{Third item}** — {nice to have}

## Skills to Load
- `dirtsync-routing-architect` — if doing any routing/nav work
- `coo-session-end` — run before stopping

## Quick Reference
- DirtSync Supabase: lldipxvwocpqncixlnxj
- MCMForge Supabase: ncwxeeqvujgyiggkviqq
- Mac Mini: ssh dirtsyncmini@100.125.184.57
- Test creds: test@dirtsync.app / TestPass123!
```

## Gotchas

| Issue | Solution |
|-------|----------|
| Session handoff might be stale | Check git log for recent commits after the handoff date |
| Calendar events might be updated by other sessions | Always re-read, don't rely on memory alone |
| Multiple open branches | Check which branch has the latest work (git log dates) |
| Mac Mini might be unreachable | Skip infra check, note it in brief |
| Steve might have done manual work | Check git log for commits not in handoff |

## After The Brief

Ask Steve: "This is where we are. What do you want to tackle first?"

Then load the relevant domain skill before starting work:
- Routing → `dirtsync-routing-architect`
- POI work → `poi-research` or `poi-geocoder`
- Agent work → `paperclip-agent-setup`
- Daily ops → `daily-ops`
