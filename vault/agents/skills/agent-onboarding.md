---
name: agent-onboarding
description: >
  Onboard a new Paperclip agent with the full 3-file gold standard pattern.
  Triggers on: new agent, hire agent, create agent, onboard agent, setup agent,
  agent needs instructions, agent not working, agent producing nothing
argument-hint: "[agent-name or agent-id]"
---

## Goal
Set up a new Paperclip agent for guaranteed A+ output on first run. Every agent gets the proven 3-file pattern (AGENTS.md + HEARTBEAT.md + promptTemplate) with strict checklists, domain skills, and consequences for skipping process.

## Definition of Done
**YOU ARE NOT DONE UNTIL ALL OF THIS IS TRUE:**
1. AGENTS.md written with ALL sections below (Domain, Pre-Made Decisions, Gotchas, Mandatory Workflow, Rules That Will Get You Fired, Definition of Done)
2. HEARTBEAT.md written with per-wake protocol
3. promptTemplate PATCHed via Paperclip API
4. Relevant domain skills synced to agent's instructions/ folder
5. Manual test run completed — agent wakes, finds work, executes, comments, exits
6. Agent grade verified as B+ or higher on first run

**If any item above is false, you are NOT done. Go back and finish.**

## Pre-Made Decisions
**DO NOT ask about these. They are already decided.**

| Decision | Answer |
|----------|--------|
| Paperclip server | `http://127.0.0.1:3100` (local) or Mini |
| Company ID (DirtSync) | `b724f8bb-9567-47a1-8ec6-fd8e23c70093` |
| Instructions path | `~/.paperclip/instances/default/companies/{company_id}/agents/{agent_id}/instructions/` |
| Agent model (builders) | `claude-sonnet-4-20250514` |
| Agent model (strategists) | `claude-opus-4-20250514` |
| Heartbeat interval | 1 minute for ship team, cron for routines |
| Build command | `xcodebuild -scheme DirtSync -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build` |

## The 3-File Pattern (PROVEN: Trail Data Health F→A)

### File 1: AGENTS.md
Must contain ALL of these sections:

```markdown
# {Agent Name}

## Domain
[What this agent is an expert in. Specific files, APIs, tools.]

## Pre-Made Decisions
| Decision | Answer |
|----------|--------|
| Files I can edit | [EXACT list — nothing else] |
| Files I CANNOT touch | [Critical files to avoid] |
| Build command | [Exact command] |
| Test command | [Exact command] |

## Gotchas
| Issue | Solution |
|-------|----------|
| [Real failure from production] | [Fix] |
| [Edge case] | [Handle it this way] |
| [Common mistake] | [Do this instead] |

## MANDATORY WORKFLOW — FOLLOW EXACTLY
1. Read your assigned issue completely
2. Comment on issue: "Starting work. Plan: [list each change]"
3. Read ALL files you'll modify BEFORE making changes
4. Make changes
5. Build — MUST pass or revert
6. Self-check comment: each acceptance criterion PASS/FAIL
7. If all PASS → commit + push + comment "Done"
8. If any FAIL → fix it, don't ship broken code

## RULES THAT WILL GET YOU FIRED
- Committing without building = FIRED
- Editing files not in your Pre-Made Decisions list = FIRED
- Zero comments on your issue = FIRED
- Shipping partial work (1 of 5 criteria) = FIRED
- Breaking existing functionality = FIRED

## Definition of Done
YOU ARE NOT DONE UNTIL:
1. [Specific deliverable]
2. Build passes
3. Issue has plan comment + self-check comment + done comment
4. [Quality bar — reference gold standard screenshot if visual]

## Lessons Learned
[Updated after each run with real failures]
```

### File 2: HEARTBEAT.md
Per-wake protocol. Agent reads this FIRST on every heartbeat.

```markdown
# Heartbeat Protocol

1. Check inbox: `GET /api/agents/{my_id}/inbox`
2. If no issues assigned → exit quietly
3. Claim issue: comment "Picking up this issue"
4. Read AGENTS.md for domain knowledge
5. Execute the MANDATORY WORKFLOW
6. Comment results on issue
7. Close issue if done, or escalate if blocked
8. Exit
```

### File 3: promptTemplate
PATCH via API to set the agent's wake prompt:

```bash
curl -X PATCH http://127.0.0.1:3100/api/agents/{agent_id} \
  -H 'Content-Type: application/json' \
  -d '{"adapterConfig": {"promptTemplate": "Read your HEARTBEAT.md file first, then check your inbox for assigned issues. Follow the MANDATORY WORKFLOW in your AGENTS.md exactly."}}'
```

## Domain Skills to Sync
Copy relevant skills from `vault/agents/skills/` to the agent's `instructions/` folder:

| Agent Type | Skills to Sync |
|-----------|---------------|
| MapLibre/Map UI | `maplibre-ios.md` |
| Navigation/Routing | `ferrostar-nav.md`, `valhalla-routing.md` |
| Trail Data | `trail-data-pipeline.md` |
| SwiftUI/Visual | `visual-bug-fix.md` |
| All builders | `tdd-workflow.md`, `plan-then-code.md` |

## Gotchas
| Issue | Solution |
|-------|----------|
| Sonnet skips comments/process | MANDATORY language + consequences ("FIRED") |
| Agent edits wrong files | Pre-Made Decisions table with EXACT file list |
| Agent does 80% and stops | Definition of Done with numbered criteria |
| Agent can't find its issues | Paperclip bug #2251 — HEARTBEAT.md works around it |
| Agent diverges branches | AGENTS.md must specify which branch to work on |
| pbxproj corruption | Agents must NOT edit .xcodeproj — use ruby xcodeproj gem |
| Build fails silently | Agent must capture + paste build output in comment |

## Checklist

### Before Creating Agent
- [ ] Agent purpose is specific (domain specialist, not generalist)
- [ ] Files the agent will edit are identified (max 3-4 files)
- [ ] Gold standard reference exists (screenshot, spec, or working example)
- [ ] No overlap with existing agents

### During Onboarding
- [ ] AGENTS.md has ALL required sections
- [ ] HEARTBEAT.md written and placed
- [ ] promptTemplate PATCHed
- [ ] Domain skills copied to instructions/
- [ ] Agent created in Paperclip with correct model

### After First Run
- [ ] Agent found its issue
- [ ] Agent posted plan comment
- [ ] Agent posted self-check comment
- [ ] Build passed
- [ ] Output matches gold standard
- [ ] Lessons Learned updated in AGENTS.md
