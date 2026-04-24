# CEO Session Handoff — 2026-04-24

**If you're post-compact, read this first. Everything you need to resume is below.**

## The mission (set by Steve, must ship TODAY)

Ship **DIRA-277** (Waze Home search sheet freeze) perfectly today. On-device green. Factory does it without CEO code edits. Steve field-tests + signs off.

If factory can't do this, we have a fundamental problem.

## Iron rules (saved to memory)

1. **CEO never writes code** — not on laptop, not on Mini, not via Task() subagents. Factory is the only code path. (`feedback_ceo_never_writes_code_anywhere.md`)
2. **One active issue per company** — exactly one, all others archived. No new ticket until the active one ships with 110% confidence. (`feedback_one_active_issue_per_company.md`)

## Dashboard state (cleaned at handoff)

**DirtSync (company 99338dee-5fdc-4cbf-a344-5c08ec112a2b):**
- ONE active issue: `DIRA-277` (`b10237a4-3273-4394-b75d-bde837733aee`) — "Waze Home search sheet freezes on tap". Status `pending`. BLOCKED on FORGE-339 merge.
- 20 other DirtSync issues archived.

**MCM Forge (company 170ebe36-d689-4f15-91f1-7474df6c98cd):**
- ONE active issue: `FORGE-339` (`dbbb3880-6ad5-47d0-9567-aa599da4becc`) — "Scoped tool profiles: stop specialist agents reading cross-ticket forge.issues". Status `in_progress`. **Not yet dispatched** — post-compact first action.
- 22 other MCM Forge issues archived.

## Why FORGE-339 is the gate

Tonight's 3 DIRA-277 dispatch attempts all failed because Spec/Coder agents drift across tickets via their Supabase MCP access — they read `forge.issues`, pick whatever feels in_progress, write code for wrong tickets. Skill prompts can't stop it (tried 3 times: FORGE-335 guard, FORGE-338 Ticket Lead, all drifted). Root cause is tool access, not prompt content.

FORGE-339 physically removes Supabase MCP from specialist agents' toolbelts at launch time + adds scope-lock trigger on stage_artifacts. Once that's in, DIRA-277 can be dispatched with confidence.

## Next actions (post-compact)

### Step 1 — Dispatch FORGE-339 to Factory Upgrader

- Factory Upgrader agent id: `8369ecf7-79b3-42e3-9c67-52638def488e`
- Clear its session_id first: `UPDATE forge.agents SET session_id=NULL, status='idle' WHERE id='8369ecf7-79b3-42e3-9c67-52638def488e';`
- Insert run:
  - `company_id`: MCM Forge (`170ebe36-d689-4f15-91f1-7474df6c98cd`)
  - `agent_id`: Factory Upgrader (above)
  - `status`: `queued`
  - `invocation_source`: `ceo_manual`
  - `trigger_detail`: `[CEO-DISPATCH] FORGE-339 — scoped tool profiles`
  - `context_snapshot`: `{issueId: dbbb3880-..., identifier: FORGE-339, workBranch: feat/FORGE-339-tool-profiles, designDoc: <none, spec is in ticket body>, baseBranch: main, forceFreshSession: true, scopeLock: 'MCMForge repo only'}`
  - `priority`: 10
  - `stage`: null
- Update DIRA-277: `assignee_agent_id = <agent_id>`, `execution_run_id = <new run id>`

### Step 2 — Monitor the run (do NOT admin-merge on CI green)

- PR opens on branch `feat/FORGE-339-tool-profiles`
- Run these SQL verifications manually:
  - `SELECT column_name FROM information_schema.columns WHERE table_schema='forge' AND table_name='agents' AND column_name='tool_profile';`
  - `SELECT name FROM forge.agents WHERE (role='specialist' OR metadata->>'factory_stage' IS NOT NULL) AND NOT (tool_profile->'denied_mcp_servers' ? 'supabase');` (must return 0 rows)
  - `head -20 vault/agents/skills/forge-spec.md | grep -q '## Single-ticket lock (READ FIRST)'`
  - `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name='forge_trigger_scope_violation_reject';`
- Run `bash forge-orchestrator/scripts/forge-canary-scope-lock.sh` and confirm it both exits 0 (obey case) and exits ≥1 with `[SCOPE-LOCK-ERROR]` (violate case).
- Only if ALL pass → `gh pr merge --admin --squash --delete-branch`.
- If any fail → post `[CEO-REVIEW-FAIL]` comment listing the gaps + dispatch a follow-up run (do NOT merge partial work).

### Step 3 — SSH Mini to pull merged code

```
ssh dirtsyncmini@100.125.184.57 "cd /Users/dirtsyncmini/MCMForge && git fetch origin && git reset --hard origin/main"
```

### Step 4 — Dispatch DIRA-277

After FORGE-339 is live:
- Clear DirtSync Stage Spec session: `UPDATE forge.agents SET session_id=NULL, status='idle' WHERE id='e9efc45c-7259-4735-95cb-2947c7bea941';`
- Clear Map Rendering Expert session: `UPDATE forge.agents SET session_id=NULL, status='idle' WHERE id='fce43183-9464-47d5-8724-c7d4866d7074';`
- Clear DirtSync Fixer session: `UPDATE forge.agents SET session_id=NULL, status='idle' WHERE id='2df0ada3-3052-456e-8d90-b42caddbb1d9';`
- Update DIRA-277 status: `UPDATE forge.issues SET status='in_progress', use_ticket_lead=false, execution_run_id=NULL WHERE identifier='DIRA-277';`  (use_ticket_lead=false → use stage pipeline, which now has tool-access lockdown)
- Insert Spec run with rich context_snapshot including:
  - `identifier: DIRA-277`
  - `scopeLock.filesGlob: ['DirtSync/DirtSyncApp/Waze/Home/**','DirtSync/DirtSyncApp/Waze/WazeLaunchRouter.swift','DirtSync/DirtSyncApp/DirtSyncApp.swift','DirtSync/DirtSyncApp/Views/MapCoordinator.swift','DirtSync/DirtSyncUITests/DIRA277*.swift']`
  - `scopeLock.forbiddenPaths: ['Trail','MainTab','Onboarding','DIRA27[0-6]']`
  - `referenceVideoDriveId: 1oZmbW3yVpf_TCqRcm-Ah0TfMnuVcJkP5`
  - `diffThreshold: 15`
  - `videoLoopRequired: true`

### Step 5 — Watch DIRA-277 progress

- Stage-advance trigger should fire spec → coder → test_runner → video_critic → shipper
- Watch for `[SCOPE-LOCK-ERROR]` in any stage artifact — that's FORGE-339 working. Kill + retry with tighter scope.
- Video Critic should reject first candidate (freeze still present) → Fixer → second pass.

### Step 6 — Acid test results

- Pipeline succeeds → PR opens → CEO admin-merges → branch deleted
- SSH Mini, git reset v2-road-first to origin
- Post `[SHIP] DIRA-277 ready for field-test` comment with PR URL, merge SHA, test evidence, video-diff score, total cost
- Notify Steve

## Critical IDs

- **DirtSync Stage Spec agent**: `e9efc45c-7259-4735-95cb-2947c7bea941`
- **Map Rendering Expert (Coder)**: `fce43183-9464-47d5-8724-c7d4866d7074`
- **DirtSync Fixer**: `2df0ada3-3052-456e-8d90-b42caddbb1d9`
- **DirtSync Test Runner**: `88bec9f8-17e3-4a02-862c-20f607997359`
- **DirtSync Visual Critic**: `7d3b8243-31c2-45bd-90bd-ced04aca0a68`
- **DirtSync Video Critic**: `b9ac26e5-1ef5-46d6-8663-de1db038e689`
- **DirtSync Shipper**: `9dbeabed-bb38-43a7-a77d-794c36b6e0fd`
- **Factory Upgrader**: `8369ecf7-79b3-42e3-9c67-52638def488e`
- **DirtSync Ticket Lead** (deprecated post-FORGE-339): `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- **Forge Project Manager** (paused): `618051e1-d133-4363-ad7f-3681f29ddd79`

## Critical Paths

- Laptop MCMForge: `/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge`
- Laptop DirtSync: `/Users/stevemcmillian/llama-3-agents/Apps/projects/DirtSync`
- Mini MCMForge: `/Users/dirtsyncmini/MCMForge`
- Mini DirtSync: `/Users/dirtsyncmini/DirtSync`
- Mini PATH prefix: `export PATH=/opt/homebrew/bin:$PATH` (pm2, brew tools)
- Supabase project: `ncwxeeqvujgyiggkviqq` (mcmforge-brain)
- Drive proof root: `11nELNPmv8GmuCbhpLNTTQfYT_SY5pFPj`
- Reference clip (DIRA-277): `1oZmbW3yVpf_TCqRcm-Ah0TfMnuVcJkP5`

## Timeline

- Steve checks back in ~1 hour from compact
- Target: FORGE-339 shipped + DIRA-277 dispatched (ideally in progress)
- Stretch: DIRA-277 PR opened for Steve to field-test

## What "wow" means

Clean dashboard (only DIRA-277 + FORGE-339 visible), FORGE-339 shipped cleanly through the factory with CEO review gate holding, DIRA-277 dispatched under new toolprofile lockdown, no drift to DIRA-273/274/275/276.
