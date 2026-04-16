# DirtSync: Issue to Ship

**Follow these phases IN ORDER. Load one file at a time. Complete every step before loading the next phase.**

## Phases

| # | File | Steps | When |
|---|------|-------|------|
| 0 | `00-pre-setup.md` | 0, 0.25, 0.4, 0.5, 0.75 | ALWAYS — every issue |
| 1 | `01-understand.md` | 1, 2, 3, 4 | ALWAYS — every issue |
| 2 | `02-tdd-loop.md` | 4.5, 4.75, 4.8, 5, 6, 6.5 | ALWAYS — every issue |
| 3 | `03-visual-proof.md` | 7, 8, 8.5, 9 | IF issue involves anything visible (map, HUD, UI, labels, colors) |
| 4 | `04-ship.md` | 10, 11, 12, 13, 14 | ALWAYS — every issue |
| 5 | `05-post-ship.md` | 15, 15.5 | ALWAYS — every issue |

## Skip Rules

- **Skip Phase 3** ONLY if the issue is pure logic with zero visual impact (e.g., trail detection distance threshold, ride recording state machine, data parsing). If in doubt, DON'T skip.
- **NEVER skip Phases 0, 1, 2, 4, or 5.** No exceptions. No shortcuts.

## Environment

```bash
export SUPA_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/forge-orchestrator/.env | cut -d= -f2-)
export SUPA_URL="https://ncwxeeqvujgyiggkviqq.supabase.co"
export COMPANY_ID="99338dee-5fdc-4cbf-a344-5c08ec112a2b"
```

## How to Post to Issue

```bash
curl -s "$SUPA_URL/rest/v1/issue_comments" -X POST \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" -H "Content-Profile: forge" \
  -d "{\"issue_id\":\"$ISSUE_ID\", \"company_id\":\"$COMPANY_ID\", \"body\":\"YOUR_COMMENT\"}"
```

## How to Track Steps

```bash
# Track step completion — COO watches this in real time
python3 -c "
import json,subprocess,os
ISSUE_ID=os.environ['ISSUE_ID']
STEP='STEP_ID'  # e.g., '0.25', '4.8', '5'
DATA={'done':True}  # Add fields: {'done':True,'basemap':'satellite'}
SUPA_URL=os.environ['SUPA_URL']
SUPA_KEY=os.environ['SUPA_KEY']
r=subprocess.run(['curl','-s',SUPA_URL+'/rest/v1/issues?id=eq.'+ISSUE_ID+'&select=step_tracker','-H','apikey: '+SUPA_KEY,'-H','Authorization: Bearer '+SUPA_KEY,'-H','Accept-Profile: forge'],capture_output=True,text=True)
tracker=json.loads(r.stdout)[0].get('step_tracker') or {}
tracker[STEP]=DATA
subprocess.run(['curl','-s',SUPA_URL+'/rest/v1/issues?id=eq.'+ISSUE_ID,'-X','PATCH','-H','apikey: '+SUPA_KEY,'-H','Authorization: Bearer '+SUPA_KEY,'-H','Content-Type: application/json','-H','Content-Profile: forge','-d',json.dumps({'step_tracker':tracker})])
"
```

**Track EVERY step. The COO dashboard shows a progress bar. Missing steps = looks like you skipped them.**

## Rules (apply to ALL phases)

1. **Post to issue at every step.** No exceptions.
2. **Track every step in step_tracker.** No exceptions.
3. **Never claim done without proof.** Screenshots, test output, video.
4. **Never commit secrets.** Reference by env var name only.
5. **One issue at a time.** Finish or STOP.
6. **If stuck: post "BLOCKED: [reason]" and STOP.** Don't loop forever.
7. **Test on SATELLITE basemap.** That's what users see. Not offline.
8. **XCUITest for visual features.** Config-checking unit tests are NOT acceptable.

## Start

**Load `00-pre-setup.md` and begin.**
