#!/bin/bash
# Close duplicate/stale PRs on DirtSync
# Run manually after review, or via cron
#
# Usage: ./close-duplicate-prs.sh [--dry-run]

export PATH="/opt/homebrew/Cellar/node@20/20.20.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO="golfballnut/DirtSync"
DRY_RUN=false

if [ "$1" == "--dry-run" ]; then
  DRY_RUN=true
  echo "=== DRY RUN MODE — no PRs will be closed ==="
fi

echo "=== Scanning open PRs on $REPO ==="

# Get all open PRs as JSON
PRS=$(gh pr list --repo "$REPO" --state open --json number,title,headRefName,createdAt --limit 50)

if [ -z "$PRS" ] || [ "$PRS" == "[]" ]; then
  echo "No open PRs found."
  exit 0
fi

echo "$PRS" | python3 -c "
import json, sys
from collections import defaultdict

prs = json.load(sys.stdin)

# Group PRs by normalized intent
def normalize(title):
    t = title.lower()
    for prefix in ['feat:', 'fix:', 'deploy', 'implement:', 'agent:']:
        t = t.replace(prefix, '')
    for suffix in ['(claude)', '(gemini)', '(codex)']:
        t = t.replace(suffix, '')
    return ' '.join(sorted(t.split()))

groups = defaultdict(list)
for pr in prs:
    key = normalize(pr['title'])
    groups[key].append(pr)

# Find duplicates (groups with >1 PR)
print()
for key, group in sorted(groups.items()):
    if len(group) > 1:
        # Keep the newest, close the rest
        group.sort(key=lambda p: p['createdAt'], reverse=True)
        keeper = group[0]
        dupes = group[1:]
        print(f'KEEP: #{keeper[\"number\"]} - {keeper[\"title\"]}')
        for d in dupes:
            print(f'  CLOSE: #{d[\"number\"]} - {d[\"title\"]}')
        print()

# Also flag very old PRs (>7 days)
import datetime
now = datetime.datetime.now(datetime.timezone.utc)
for pr in prs:
    created = datetime.datetime.fromisoformat(pr['createdAt'].replace('Z', '+00:00'))
    age = (now - created).days
    if age > 7:
        print(f'STALE ({age}d): #{pr[\"number\"]} - {pr[\"title\"]}')
" > /tmp/pr-analysis.txt

cat /tmp/pr-analysis.txt

if [ "$DRY_RUN" == "true" ]; then
  echo ""
  echo "=== Dry run complete. Review above and run without --dry-run to close. ==="
  exit 0
fi

echo ""
read -p "Close the CLOSE PRs listed above? (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# Close duplicate PRs
echo "$PRS" | python3 -c "
import json, sys, subprocess
from collections import defaultdict

prs = json.load(sys.stdin)

def normalize(title):
    t = title.lower()
    for prefix in ['feat:', 'fix:', 'deploy', 'implement:', 'agent:']:
        t = t.replace(prefix, '')
    for suffix in ['(claude)', '(gemini)', '(codex)']:
        t = t.replace(suffix, '')
    return ' '.join(sorted(t.split()))

groups = defaultdict(list)
for pr in prs:
    key = normalize(pr['title'])
    groups[key].append(pr)

for key, group in groups.items():
    if len(group) > 1:
        group.sort(key=lambda p: p['createdAt'], reverse=True)
        keeper = group[0]
        for d in group[1:]:
            num = d['number']
            print(f'Closing #{num}: {d[\"title\"]} (superseded by #{keeper[\"number\"]})')
            subprocess.run([
                'gh', 'pr', 'close', str(num),
                '--repo', '$REPO',
                '--comment', f'Closing as duplicate. Superseded by #{keeper[\"number\"]}.'
            ])
"

echo "=== Done ==="
