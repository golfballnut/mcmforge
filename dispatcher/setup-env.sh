#!/bin/bash
# Creates dispatcher/.env on Mac Mini
# Usage: bash setup-env.sh

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
ANON_KEY="${ANON_KEY}.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jd3hlZXF2dWpneWlnZ2t2aXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODI2NzIsImV4cCI6MjA4NzQ1ODY3Mn0"
ANON_KEY="${ANON_KEY}.It-Egjlzh2UimIOx0et62DZvE8aneId80KT_PdGiPEk"

cat > .env << ENVEOF
MCMFORGE_SUPABASE_URL=https://ncwxeeqvujgyiggkviqq.supabase.co
MCMFORGE_SUPABASE_KEY=${ANON_KEY}
AGENT_EMAIL=agent@mcmforge.com
AGENT_PASSWORD=MCMForge2026!
POLL_INTERVAL_MS=300000
REPO_BASE_DIR=/Users/dirtsyncmini
DEFAULT_COST_CAP=2
MAX_COST_CAP=5
MAX_DURATION_MINUTES=30
STEVE_EMAIL=steve@linkschoice.com
ENVEOF

echo "Created .env:"
cat .env
echo ""
echo "Done. Run: npx tsx dispatcher.ts"
