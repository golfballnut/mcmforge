#!/usr/bin/env bash
# forge-dispatch-ticket-lead.sh — FORGE-338
# Launches a Ticket Lead Claude Code session for a single ticket.
# The Lead runs the full pipeline (Spec→Coder→Test→Critic→Fixer→Shipper)
# via Task() subagents, without any DB stage-advance trigger involvement.
#
# Usage:
#   forge-dispatch-ticket-lead.sh <ISSUE_ID> <ISSUE_IDENTIFIER>
#
# Example:
#   forge-dispatch-ticket-lead.sh 6d3a8f2b-... DIRA-277
#
# Env (optional overrides):
#   FORGE_LEAD_MODEL     default "claude-sonnet-4-6"
#   FORGE_LEAD_MAX_TURNS default 200
#   FORGE_MCM_DIR        default "/Users/dirtsyncmini/MCMForge"
#
# What it does:
#   1. Validates inputs + confirms issue exists in DB via psql
#   2. Verifies use_ticket_lead=true on the issue (abort if false — legacy path)
#   3. Sets CLAUDE_CODE_FORK_SUBAGENT=1 so Task() forks isolated processes
#   4. Launches: claude -p "forge-ticket-lead.md" with issue ID + identifier injected
#   5. Emits structured JSON on exit with run summary

set -euo pipefail

ISSUE_ID="${1:?Usage: $0 <ISSUE_ID> <ISSUE_IDENTIFIER>}"
ISSUE_IDENTIFIER="${2:?Usage: $0 <ISSUE_ID> <ISSUE_IDENTIFIER>}"
MODEL="${FORGE_LEAD_MODEL:-claude-sonnet-4-6}"
MAX_TURNS="${FORGE_LEAD_MAX_TURNS:-200}"
MCM_DIR="${FORGE_MCM_DIR:-/Users/dirtsyncmini/MCMForge}"
SKILL_PATH="$MCM_DIR/vault/agents/skills/forge-ticket-lead.md"

log() { echo "[forge-dispatch-ticket-lead] $*" >&2; }

# ── 1. Validate skill file exists ──────────────────────────────────────────
if [[ ! -f "$SKILL_PATH" ]]; then
  echo '{"error":"skill_not_found","skill_path":"'"$SKILL_PATH"'"}'
  exit 1
fi

# ── 2. Verify issue exists + use_ticket_lead=true ──────────────────────────
# Uses Supabase MCP via claude CLI in script mode — or fall through if psql not configured.
ISSUE_CHECK=$(psql "$SUPABASE_DB_URL" -t -A -c \
  "SELECT identifier || ':' || use_ticket_lead::text FROM forge.issues WHERE id='$ISSUE_ID' LIMIT 1" \
  2>/dev/null || echo "")

if [[ -n "$ISSUE_CHECK" ]]; then
  DB_IDENTIFIER="${ISSUE_CHECK%%:*}"
  DB_USE_LEAD="${ISSUE_CHECK##*:}"

  if [[ "$DB_IDENTIFIER" != "$ISSUE_IDENTIFIER" ]]; then
    echo '{"error":"identifier_mismatch","db_identifier":"'"$DB_IDENTIFIER"'","arg_identifier":"'"$ISSUE_IDENTIFIER"'"}'
    exit 1
  fi

  if [[ "$DB_USE_LEAD" != "t" ]]; then
    echo '{"error":"use_ticket_lead_false","identifier":"'"$ISSUE_IDENTIFIER"'","message":"This issue uses the legacy stage pipeline. Set use_ticket_lead=true to dispatch via Ticket Lead."}'
    exit 1
  fi

  log "DB check: identifier=$DB_IDENTIFIER use_ticket_lead=$DB_USE_LEAD OK"
else
  log "WARN: psql not reachable — skipping DB pre-check. Claude will verify identity."
fi

# ── 3. Build the Lead prompt ───────────────────────────────────────────────
PROMPT="$(cat "$SKILL_PATH")

---
## Dispatch context

FORGE_ISSUE_ID=$ISSUE_ID
FORGE_ISSUE_IDENTIFIER=$ISSUE_IDENTIFIER

You are the Ticket Lead for $ISSUE_IDENTIFIER. Begin execution per your skill's Core Loop.
Step 1: read the issue from DB using FORGE_ISSUE_ID above.
Step 2: confirm identifier matches $ISSUE_IDENTIFIER. If not, abort with [LEAD-ABORT].
Step 3: post [LEAD-START] comment and begin pipeline.
"

# ── 4. Launch Lead ─────────────────────────────────────────────────────────
log "Launching Ticket Lead for $ISSUE_IDENTIFIER (model=$MODEL max_turns=$MAX_TURNS)"
log "CLAUDE_CODE_FORK_SUBAGENT=1 is set"

export CLAUDE_CODE_FORK_SUBAGENT=1
export FORGE_ISSUE_ID="$ISSUE_ID"
export FORGE_ISSUE_IDENTIFIER="$ISSUE_IDENTIFIER"

LEAD_EXIT=0
claude \
  --model "$MODEL" \
  --max-turns "$MAX_TURNS" \
  --dangerously-skip-permissions \
  -p "$PROMPT" \
  --cwd "$MCM_DIR" \
  2>&1 || LEAD_EXIT=$?

log "Lead exited with code $LEAD_EXIT"

# ── 5. Emit summary JSON ───────────────────────────────────────────────────
python3 - "$ISSUE_IDENTIFIER" "$ISSUE_ID" "$LEAD_EXIT" <<'PY'
import sys, json, datetime
identifier, issue_id, exit_code = sys.argv[1:4]
print(json.dumps({
  "identifier": identifier,
  "issue_id": issue_id,
  "lead_exit_code": int(exit_code),
  "dispatched_at": datetime.datetime.utcnow().isoformat() + "Z",
  "status": "completed" if int(exit_code) == 0 else "failed"
}))
PY

exit "$LEAD_EXIT"
