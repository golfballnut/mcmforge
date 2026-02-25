#!/bin/bash
# MCM Forge Keep-Alive — Run as cron job every 15 minutes
# Ensures dispatcher and night-ops stay running, repos stay clean
#
# Cron entry (on Mac Mini):
#   */15 * * * * /Users/dirtsyncmini/MCMForge/dispatcher/scripts/keep-alive.sh >> /Users/dirtsyncmini/logs/keep-alive.log 2>&1
#
# Vault sync cron (every 6 hours):
#   0 */6 * * * cd /Users/dirtsyncmini/MCMForge/dispatcher && npx tsx vault-sync.ts >> /Users/dirtsyncmini/logs/vault-sync.log 2>&1

export PATH="/opt/homebrew/Cellar/node@20/20.20.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[$TIMESTAMP] Keep-alive check starting"

# 1. Check PM2 processes
DISPATCHER_STATUS=$(pm2 show mcmforge-dispatcher 2>/dev/null | grep "status" | head -1 | awk '{print $4}')
NIGHTOPS_STATUS=$(pm2 show mcmforge-night-ops 2>/dev/null | grep "status" | head -1 | awk '{print $4}')

if [ "$DISPATCHER_STATUS" != "online" ]; then
  echo "[$TIMESTAMP] ALERT: Dispatcher not online (status: $DISPATCHER_STATUS). Restarting..."
  pm2 restart mcmforge-dispatcher
fi

if [ "$NIGHTOPS_STATUS" != "online" ]; then
  echo "[$TIMESTAMP] ALERT: Night-ops not online (status: $NIGHTOPS_STATUS). Restarting..."
  pm2 restart mcmforge-night-ops
fi

# 2. Check memory usage (restart if >500MB — likely memory leak)
DISP_MEM=$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try:
  procs = json.load(sys.stdin)
  for p in procs:
    if p.get('name') == 'mcmforge-dispatcher':
      print(p.get('monit',{}).get('memory',0) // (1024*1024))
      break
  else:
    print(0)
except: print(0)
")

if [ "$DISP_MEM" -gt 500 ] 2>/dev/null; then
  echo "[$TIMESTAMP] ALERT: Dispatcher using ${DISP_MEM}MB. Restarting to free memory..."
  pm2 restart mcmforge-dispatcher
fi

# 3. Pull latest code (git pull on MCMForge repo)
cd /Users/dirtsyncmini/MCMForge 2>/dev/null && git pull --quiet origin main 2>/dev/null
echo "[$TIMESTAMP] MCMForge repo updated"

# 4. Ensure DirtSync repo is on default branch (prevent agent branch drift)
DIRTSYNC_DIR="/Users/dirtsyncmini/DirtSync"
if [ -d "$DIRTSYNC_DIR" ]; then
  cd "$DIRTSYNC_DIR"
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep "HEAD branch" | awk '{print $NF}')
  DEFAULT_BRANCH=${DEFAULT_BRANCH:-master}

  if [ "$CURRENT_BRANCH" != "$DEFAULT_BRANCH" ]; then
    echo "[$TIMESTAMP] ALERT: DirtSync on branch '$CURRENT_BRANCH', switching to '$DEFAULT_BRANCH'"
    git stash --include-untracked 2>/dev/null
    git checkout "$DEFAULT_BRANCH" 2>/dev/null
    git pull origin "$DEFAULT_BRANCH" --quiet 2>/dev/null
  fi
fi

echo "[$TIMESTAMP] Keep-alive check complete"
