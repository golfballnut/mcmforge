#!/bin/bash
# Clean up agent branch pollution and stale git state
# Run manually or via cron: weekly on Sunday at midnight
#   0 0 * * 0 /Users/dirtsyncmini/MCMForge/dispatcher/scripts/clean-repos.sh >> /Users/dirtsyncmini/logs/clean-repos.log 2>&1

export PATH="/opt/homebrew/Cellar/node@20/20.20.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[$TIMESTAMP] === Repo Cleanup Starting ==="

clean_repo() {
  local REPO_DIR=$1
  local REPO_NAME=$2

  if [ ! -d "$REPO_DIR" ]; then
    echo "  $REPO_NAME: directory not found, skipping"
    return
  fi

  cd "$REPO_DIR"
  echo "  $REPO_NAME: starting cleanup"

  # Get default branch
  DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep "HEAD branch" | awk '{print $NF}')
  DEFAULT_BRANCH=${DEFAULT_BRANCH:-master}

  # Switch to default branch
  git stash --include-untracked 2>/dev/null
  git checkout "$DEFAULT_BRANCH" 2>/dev/null
  git pull origin "$DEFAULT_BRANCH" --quiet 2>/dev/null

  # Count branches before cleanup
  BRANCH_COUNT=$(git branch | wc -l | tr -d ' ')
  echo "  $REPO_NAME: $BRANCH_COUNT local branches before cleanup"

  # Delete merged branches (except default)
  git branch --merged "$DEFAULT_BRANCH" | grep -v "^\*" | grep -v "$DEFAULT_BRANCH" | xargs -r git branch -d 2>/dev/null

  # Delete agent/* branches older than 7 days that aren't merged
  for branch in $(git branch | grep "agent/" | tr -d ' *'); do
    LAST_COMMIT=$(git log -1 --format="%ct" "$branch" 2>/dev/null)
    SEVEN_DAYS_AGO=$(($(date +%s) - 604800))
    if [ "$LAST_COMMIT" -lt "$SEVEN_DAYS_AGO" ] 2>/dev/null; then
      echo "  $REPO_NAME: deleting stale branch $branch"
      git branch -D "$branch" 2>/dev/null
    fi
  done

  # Delete feature/* branches older than 7 days that aren't merged
  for branch in $(git branch | grep "feature/" | tr -d ' *'); do
    LAST_COMMIT=$(git log -1 --format="%ct" "$branch" 2>/dev/null)
    SEVEN_DAYS_AGO=$(($(date +%s) - 604800))
    if [ "$LAST_COMMIT" -lt "$SEVEN_DAYS_AGO" ] 2>/dev/null; then
      echo "  $REPO_NAME: deleting stale branch $branch"
      git branch -D "$branch" 2>/dev/null
    fi
  done

  # Clear old stashes (keep last 5)
  STASH_COUNT=$(git stash list | wc -l | tr -d ' ')
  if [ "$STASH_COUNT" -gt 5 ]; then
    echo "  $REPO_NAME: $STASH_COUNT stashes, dropping all but 5"
    while [ "$(git stash list | wc -l | tr -d ' ')" -gt 5 ]; do
      git stash drop 2>/dev/null
    done
  fi

  # Prune remote tracking branches
  git remote prune origin 2>/dev/null

  # Final state
  FINAL_BRANCHES=$(git branch | wc -l | tr -d ' ')
  FINAL_STASHES=$(git stash list | wc -l | tr -d ' ')
  echo "  $REPO_NAME: cleanup done. $FINAL_BRANCHES branches, $FINAL_STASHES stashes"
}

# Clean all repos
clean_repo "/Users/dirtsyncmini/DirtSync" "DirtSync"
clean_repo "/Users/dirtsyncmini/MCMForge" "MCMForge"

echo "[$TIMESTAMP] === Repo Cleanup Complete ==="
