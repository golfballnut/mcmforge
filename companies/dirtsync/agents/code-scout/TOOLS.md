# TOOLS.md — DirtSync Skills Enhancer (Code Scout)

> **Runs on Claude Sonnet** with file read/write, Bash, and Forge API.

## Available Tools
- **File read/write** — read agent instruction files, write lessons into them
- **Bash** — SSH to Mini for file edits, git commits, Drive access
- **Forge API** — read Framework Scout reports, Factory Analyst reports, post enhancement report
- **Grep** — search for patterns across agent instruction files

## Agent Instruction Files (on Mini)

```
/Users/dirtsyncmini/MCMForge/companies/dirtsync/agents/
├── ios-builder/
│   ├── AGENTS.md      ← Framework patterns, code conventions, common errors
│   ├── HEARTBEAT.md   ← Step-by-step build procedure, mandatory checks
│   ├── SOUL.md        ← Voice and principles (rarely update)
│   └── TOOLS.md       ← Available tools, API references, version info
├── test-runner/
│   ├── AGENTS.md      ← Test patterns, simulator commands, known issues
│   ├── HEARTBEAT.md   ← Test procedure, screenshot, email, Drive upload
│   └── TOOLS.md       ← Build commands, simulator commands, gws
├── critique-agent/
│   ├── AGENTS.md      ← Gold Star specs, color tables, measurement tolerances
│   ├── HEARTBEAT.md   ← Grading procedure, Drive tagging, verdict format
│   └── TOOLS.md       ← Spec locations, Forge API, Drive commands
├── qa-rider/
│   ├── AGENTS.md      ← QA patterns, test matrix, framework-specific checks
│   └── TOOLS.md       ← Test tools, xcodebuild, simctl
└── ship-engineer/
    ├── AGENTS.md      ← PR creation, rebase, code review checklist
    └── TOOLS.md       ← gh CLI, git commands
```

## Google Drive — QA Iterations

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
QA_FOLDER="1Vi2av_kjmCFDmV5dxgYwTQktfeUvgT1X"

# List issue folders
gws drive files list --params "q='${QA_FOLDER}' in parents and trashed=false" 2>&1 | grep -v "^Using keyring"

# List versions for an issue
ISSUE_FOLDER_ID="<from above>"
gws drive files list --params "q='${ISSUE_FOLDER_ID}' in parents and trashed=false" 2>&1 | grep -v "^Using keyring"

# Download a critique or fix list
gws drive files get --file-id FILE_ID --params "alt=media" 2>&1 | grep -v "^Using keyring"
```

## Pattern Detection Queries

```bash
# Find common rejection reasons across issues
ssh dirtsyncmini@100.125.184.57 'cd ~/MCMForge && grep -r "REJECTED" companies/dirtsync/agents/critique-agent/ 2>/dev/null'

# Check what lessons already exist
ssh dirtsyncmini@100.125.184.57 'cd ~/MCMForge && grep "### Lesson:" companies/dirtsync/agents/*/AGENTS.md 2>/dev/null'

# Find all framework version references
ssh dirtsyncmini@100.125.184.57 'cd ~/MCMForge && grep -rn "ferrostar\|maplibre\|valhalla" companies/dirtsync/agents/*/TOOLS.md 2>/dev/null'
```

## Forge API

```
BASE_URL: http://127.0.0.1:3200
Headers:
  X-Forge-Agent-Id: $FORGE_AGENT_ID
  X-Forge-Run-Id: $FORGE_RUN_ID

GET  /api/agent/me/inbox
GET  /api/agent/issues/:id/context
PATCH /api/agent/issues/:id        — post enhancement report
```

## What You CANNOT Do
- Write production Swift code
- Run tests or take screenshots
- Delete existing agent instructions (only add/update)
- Skip reading the source intelligence before writing
- Write lessons without source tags
