#!/bin/bash
# MCM Forge — Brain Brief (SessionStart hook)
# Reads the latest brain state and injects it into Claude's context.
# Runs on every session start and after context compaction.

MEMORY_FILE="$HOME/.claude/projects/-Users-stevemcmillian-llama-3-agents-Apps-projects-MCMForge/memory/MEMORY.md"
VAULT_DIR="$(dirname "$0")/../../vault"

echo "=== MCM FORGE BRAIN BRIEF ==="
echo ""

# 1. Load persistent memory (first 200 lines — MEMORY.md is our index)
if [ -f "$MEMORY_FILE" ]; then
  echo "## Persistent Memory (MEMORY.md)"
  head -200 "$MEMORY_FILE"
  echo ""
fi

# 2. Detect active company from cwd or git remote
ACTIVE_COMPANY=""
CWD=$(pwd)
if echo "$CWD" | grep -qi "dirtsync"; then
  ACTIVE_COMPANY="dirtsync"
elif echo "$CWD" | grep -qi "mcmforge\|MCMForge"; then
  ACTIVE_COMPANY="mcmforge"
elif echo "$CWD" | grep -qi "linkschoice"; then
  ACTIVE_COMPANY="linkschoice"
elif echo "$CWD" | grep -qi "golfballnut"; then
  ACTIVE_COMPANY="golfballnut"
elif echo "$CWD" | grep -qi "hotgolf"; then
  ACTIVE_COMPANY="hotgolfbrands"
else
  # Try git remote
  REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if echo "$REMOTE" | grep -qi "dirtsync"; then
    ACTIVE_COMPANY="dirtsync"
  elif echo "$REMOTE" | grep -qi "mcmforge"; then
    ACTIVE_COMPANY="mcmforge"
  fi
fi

if [ -n "$ACTIVE_COMPANY" ]; then
  echo "## Active Company: $ACTIVE_COMPANY"
  # Load company-specific vault doc if exists
  COMPANY_FILE="$VAULT_DIR/companies/$ACTIVE_COMPANY.md"
  if [ -f "$COMPANY_FILE" ]; then
    echo "### Company Profile"
    head -50 "$COMPANY_FILE"
    echo ""
  fi
fi

# 3. Latest vault decisions (last 5)
if [ -d "$VAULT_DIR/decisions" ]; then
  echo "## Recent Decisions"
  ls -t "$VAULT_DIR/decisions/" 2>/dev/null | head -5 | while read f; do
    TITLE=$(head -1 "$VAULT_DIR/decisions/$f" | sed 's/^# //')
    echo "  - $f → $TITLE"
  done
  echo ""
fi

# 4. Latest vault intelligence (last 3)
if [ -d "$VAULT_DIR/intelligence" ]; then
  echo "## Recent Intelligence"
  ls -t "$VAULT_DIR/intelligence/" 2>/dev/null | head -3 | while read f; do
    TITLE=$(head -1 "$VAULT_DIR/intelligence/$f" | sed 's/^# //')
    echo "  - $f → $TITLE"
  done
  echo ""
fi

# 5. Quick system health check (if on same machine as Mini)
if ssh -o ConnectTimeout=3 -o BatchMode=yes dirtsyncmini@100.125.184.57 "echo ok" 2>/dev/null | grep -q ok; then
  echo "## Mac Mini Status"
  ssh dirtsyncmini@100.125.184.57 "export PATH=/opt/homebrew/Cellar/node@20/20.20.0/bin:/opt/homebrew/bin:\$PATH && pm2 jlist 2>/dev/null" 2>/dev/null | python3 -c "
import json,sys
try:
  procs = json.load(sys.stdin)
  for p in procs:
    status = p.get('pm2_env',{}).get('status','?')
    name = p.get('name','?')
    restarts = p.get('pm2_env',{}).get('restart_time',0)
    uptime = p.get('pm2_env',{}).get('pm_uptime',0)
    print(f'  - {name}: {status} (restarts: {restarts})')
except: print('  - Could not parse PM2 status')
" 2>/dev/null
  echo ""
fi

echo "## Action Items"
echo "  - Check MEMORY.md for current session context and priorities"
echo "  - Check vault/decisions/ for recent architectural decisions"
echo "  - Save findings to brain before session ends"
echo ""
echo "=== END BRAIN BRIEF ==="
