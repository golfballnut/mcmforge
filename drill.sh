#!/bin/bash
# drill.sh — Autonomous agent loop for MCM Forge
# Adapted from Ralph (snarktank/ralph) for the MCM Forge factory
#
# Usage: ./drill.sh <drill-file> [--max-iterations N] [--target mini|local]
#
# Example:
#   ./drill.sh tasks/drill-route-comparison.json --max-iterations 10 --target mini
#   ./drill.sh tasks/drill-route-comparison.json --target local

set -e

# ============================================================
# Configuration
# ============================================================
DRILL_FILE=""
MAX_ITERATIONS=10
TARGET="local"  # "local" = this laptop, "mini" = Mac Mini factory
MINI_HOST="dirtsyncmini@100.125.184.57"
MINI_CLAUDE="/Users/dirtsyncmini/.local/bin/claude"
MINI_CWD="/Users/dirtsyncmini/DirtSync"
LOCAL_CLAUDE="claude"
PROGRESS_FILE=""
SUPABASE_PROJECT="ncwxeeqvujgyiggkviqq"
SUPABASE_URL="https://ncwxeeqvujgyiggkviqq.supabase.co"
SUPABASE_KEY="${SUPABASE_SERVICE_KEY:-}"

# Load key from dispatcher .env if not set
if [[ -z "$SUPABASE_KEY" ]]; then
  ENV_FILE="$(dirname "$0")/dispatcher/.env"
  if [[ -f "$ENV_FILE" ]]; then
    SUPABASE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
  fi
fi

# ============================================================
# Parse arguments
# ============================================================
while [[ $# -gt 0 ]]; do
  case $1 in
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --max-iterations=*)
      MAX_ITERATIONS="${1#*=}"
      shift
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    --target=*)
      TARGET="${1#*=}"
      shift
      ;;
    *)
      if [[ -z "$DRILL_FILE" ]]; then
        DRILL_FILE="$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "$DRILL_FILE" ]]; then
  echo "Usage: ./drill.sh <drill-file.json> [--max-iterations N] [--target mini|local]"
  exit 1
fi

if [[ ! -f "$DRILL_FILE" ]]; then
  echo "Error: Drill file not found: $DRILL_FILE"
  exit 1
fi

# Derive progress file from drill file
PROGRESS_FILE="${DRILL_FILE%.json}-progress.txt"

# ============================================================
# Initialize progress file
# ============================================================
if [[ ! -f "$PROGRESS_FILE" ]]; then
  cat > "$PROGRESS_FILE" << 'HEADER'
# Drill Progress Log

## Codebase Patterns
(Patterns discovered during iterations — add here, not at bottom)

---
HEADER
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "Drill file: $DRILL_FILE" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

# ============================================================
# Helper: get next story to work on
# ============================================================
get_next_story() {
  # Find the highest-priority story where passes=false and all blockers are done
  jq -r '
    .stories
    | sort_by(.id)
    | map(select(.passes == false))
    | map(select(
        (.blockedBy | length == 0) or
        (reduce .blockedBy[] as $blocker (
          true;
          . and (
            [input_filename] | length > 0  # placeholder — real check below
          )
        ))
      ))
    | first
    | .id // "NONE"
  ' "$DRILL_FILE" 2>/dev/null || echo "NONE"
}

# Simpler approach: just get first story with passes=false
get_next_story_simple() {
  jq -r '[.stories[] | select(.passes == false)] | first | .id // "NONE"' "$DRILL_FILE"
}

get_story_details() {
  local story_id="$1"
  jq -r --arg id "$story_id" '.stories[] | select(.id == $id)' "$DRILL_FILE"
}

get_story_field() {
  local story_id="$1"
  local field="$2"
  jq -r --arg id "$story_id" --arg f "$field" '.stories[] | select(.id == $id) | .[$f]' "$DRILL_FILE"
}

mark_story_done() {
  local story_id="$1"
  local tmp_file="${DRILL_FILE}.tmp"
  jq --arg id "$story_id" '
    .stories = [.stories[] |
      if .id == $id then .passes = true
      else . end
    ]
  ' "$DRILL_FILE" > "$tmp_file" && mv "$tmp_file" "$DRILL_FILE"
}

all_stories_done() {
  local remaining
  remaining=$(jq '[.stories[] | select(.passes == false)] | length' "$DRILL_FILE")
  [[ "$remaining" == "0" ]]
}

# ============================================================
# Helper: update Forge issue status
# ============================================================
update_forge_issue() {
  local issue_id="$1"
  local status="$2"
  if [[ -n "$SUPABASE_KEY" && "$issue_id" != "none" && "$issue_id" != "null" ]]; then
    curl -s -o /dev/null "$SUPABASE_URL/rest/v1/issues?id=eq.$issue_id" \
      -X PATCH \
      -H "apikey: $SUPABASE_KEY" \
      -H "Authorization: Bearer $SUPABASE_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"status\":\"$status\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
      && echo "  Forge issue $issue_id → $status"
  fi
}

# ============================================================
# Helper: get specialist instructions path
# ============================================================
get_specialist_instructions() {
  local specialist="$1"
  local base_path

  if [[ "$TARGET" == "mini" ]]; then
    base_path="/Users/dirtsyncmini/MCMForge"
  else
    base_path="$(pwd)"
  fi

  # Check dirtsync agents first, then mcm-forge
  for company in dirtsync mcm-forge; do
    local path="$base_path/companies/$company/agents/$specialist/AGENTS.md"
    if [[ "$TARGET" == "mini" ]]; then
      # Can't check file existence on mini easily, just return the path
      echo "$path"
      return
    elif [[ -f "$path" ]]; then
      echo "$path"
      return
    fi
  done

  # Fallback: no specialist found
  echo ""
}

# ============================================================
# Helper: build the prompt for one iteration
# ============================================================
build_prompt() {
  local story_id="$1"
  local story_json
  story_json=$(get_story_details "$story_id")

  local title
  title=$(echo "$story_json" | jq -r '.title')

  local forge_issue_id
  forge_issue_id=$(echo "$story_json" | jq -r '.forgeIssueId // "none"')

  local criteria
  criteria=$(echo "$story_json" | jq -r '.acceptanceCriteria | join("\n- [ ] ")')

  local branch_name
  branch_name=$(jq -r '.branchName' "$DRILL_FILE")

  local progress
  progress=""
  if [[ -f "$PROGRESS_FILE" ]]; then
    progress=$(cat "$PROGRESS_FILE")
  fi

  cat << PROMPT
You are an autonomous coding agent. You have ONE job: implement a single user story.

## Your Story
**ID:** $story_id
**Title:** $title
**Forge Issue:** $forge_issue_id

## Acceptance Criteria
- [ ] $criteria

## Branch
Work on branch: $branch_name
If you're not on it, check it out or create it from master.

## Progress from Previous Iterations
Read this FIRST — it contains patterns and gotchas from prior work:

$progress

## Process (follow exactly)
1. Read the acceptance criteria above
2. Check you're on the correct branch
3. Read any LESSONS.md in your agent directory
4. Implement the story:
   - Read the file(s) listed in acceptance criteria
   - Make the required changes
   - Build/verify as specified in acceptance criteria
5. Commit with message: feat: [$story_id] $title
6. **VISUAL VERIFICATION (for any story that changes UI):**
   - Start the dev server if not running: cd dashboard && npm run dev &
   - Wait 5 seconds for server to start
   - Use Playwright MCP tools to take screenshots:
     a. Navigate to the relevant page at http://localhost:3000
     b. Resize browser to mobile (375x812) and take screenshot — save to /tmp/drill-after-mobile-$story_id.png
     c. Resize browser to desktop (1280x800) and take screenshot — save to /tmp/drill-after-desktop-$story_id.png
   - Post a comment on the Forge issue ($forge_issue_id) with the verification result:
     Use Bash to run: curl -X POST http://localhost:3000/api/agent/issues/$forge_issue_id/comments -H 'Content-Type: application/json' -d '{"body":"## Visual Verification — $story_id\\n\\nScreenshots captured at mobile (375px) and desktop (1280px).\\nFiles: /tmp/drill-after-mobile-$story_id.png, /tmp/drill-after-desktop-$story_id.png\\n\\n**Status:** VERIFIED","agent_name":"drill-loop"}'
   - If the UI doesn't look right, fix it before signaling completion
7. Append your learnings to the progress file (what worked, what didn't, patterns discovered)

## Quality Gate
- Build MUST succeed
- Tests MUST pass (if they exist)
- Do NOT commit broken code
- Keep changes focused — ONE story only
- **UI stories: screenshot MUST be taken and posted to the issue**

## When Done
If ALL acceptance criteria pass AND visual verification passes (for UI stories), end your response with EXACTLY this text on its own line:
<promise>COMPLETE</promise>

If you cannot complete the story (blocked, unclear requirements), end with:
<promise>BLOCKED: [reason]</promise>

IMPORTANT: Output the <promise> tag as the LAST thing in your response. Do not output anything after it.

## Important
- Work on ONE story only
- Commit frequently
- Do NOT touch files unrelated to this story
- Read Codebase Patterns in progress before starting
PROMPT
}

# ============================================================
# Main loop
# ============================================================
echo ""
echo "============================================================"
echo "  MCM Forge Drill Loop"
echo "  Drill file: $DRILL_FILE"
echo "  Target: $TARGET"
echo "  Max iterations: $MAX_ITERATIONS"
echo "============================================================"
echo ""

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "============================================================"
  echo "  Iteration $i of $MAX_ITERATIONS"
  echo "============================================================"

  # Check if all done
  if all_stories_done; then
    echo ""
    echo "ALL STORIES COMPLETE!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"

    # Mark PRD issue as done
    PRD_ISSUE_ID=$(jq -r '.prdIssueId // ""' "$DRILL_FILE")
    if [[ -n "$PRD_ISSUE_ID" ]]; then
      update_forge_issue "$PRD_ISSUE_ID" "done"
    fi

    # Auto-create PR if on a feature branch
    BRANCH_NAME=$(jq -r '.branchName // ""' "$DRILL_FILE")
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" == "$BRANCH_NAME" || "$CURRENT_BRANCH" == agent/* ]]; then
      echo ""
      echo "Pushing and creating PR..."
      git push -u origin "$CURRENT_BRANCH" 2>&1 || true

      # Build PR body from progress file
      STORY_LIST=$(jq -r '.stories[] | "- **\(.id):** \(.title)"' "$DRILL_FILE")
      PR_URL=$(gh pr create \
        --title "feat: $(jq -r '.project' "$DRILL_FILE") — $(jq -r '.stories | length' "$DRILL_FILE") stories shipped" \
        --body "$(cat <<PRBODY
## Summary
$STORY_LIST

## Drill Stats
- Iterations: $i of $MAX_ITERATIONS
- Target: $TARGET
- Drill file: $DRILL_FILE

## Test plan
See individual story acceptance criteria in Forge issues.

🤖 Generated with drill.sh
PRBODY
)" --base main 2>&1) || true
      echo "PR created: $PR_URL"

      # Post Vercel preview URL to Forge PRD issue
      if [[ -n "$SUPABASE_KEY" && -n "$PRD_ISSUE_ID" && "$PRD_ISSUE_ID" != "null" && "$PR_URL" =~ /pull/([0-9]+) ]]; then
        PR_NUMBER="${BASH_REMATCH[1]}"
        # Try to get Vercel preview URL from PR checks
        PREVIEW_URL=$(gh pr view "$PR_NUMBER" --json statusCheckRollup 2>/dev/null \
          | jq -r '.statusCheckRollup[]? | select((.name // "") | test("Vercel"; "i")) | .targetUrl // .detailsUrl' \
          | grep -E '^https?://' | head -1)
        if [[ -z "$PREVIEW_URL" ]]; then
          PREVIEW_URL="https://dashboard-git-${CURRENT_BRANCH//\//-}-mcmforge.vercel.app"
        fi
        # Look up company_id for the PRD issue
        COMPANY_ID=$(curl -s "$SUPABASE_URL/rest/v1/issues?id=eq.$PRD_ISSUE_ID&select=company_id" \
          -H "apikey: $SUPABASE_KEY" \
          -H "Authorization: Bearer $SUPABASE_KEY" \
          -H "Accept-Profile: forge" \
          | jq -r '.[0].company_id // empty')
        if [[ -n "$COMPANY_ID" ]]; then
          COMMENT_BODY="## PR Created\n\nPR: #${PR_NUMBER}\nPreview: ${PREVIEW_URL}\n\nReview on your phone."
          curl -s -o /dev/null "$SUPABASE_URL/rest/v1/issue_comments" \
            -X POST \
            -H "apikey: $SUPABASE_KEY" \
            -H "Authorization: Bearer $SUPABASE_KEY" \
            -H "Content-Type: application/json" \
            -H "Content-Profile: forge" \
            -d "$(jq -n --arg cid "$COMPANY_ID" --arg iid "$PRD_ISSUE_ID" --arg body "$COMMENT_BODY" \
              '{company_id:$cid, issue_id:$iid, body:$body, author_user_id:"drill-loop"}')" \
            && echo "  Posted preview URL to Forge issue $PRD_ISSUE_ID"
        fi
      fi
    fi

    # Append final status to progress
    echo "" >> "$PROGRESS_FILE"
    echo "## DRILL COMPLETE — $(date)" >> "$PROGRESS_FILE"
    echo "All stories passed in $i iterations." >> "$PROGRESS_FILE"

    exit 0
  fi

  # Get next story
  STORY_ID=$(get_next_story_simple)
  if [[ "$STORY_ID" == "NONE" ]]; then
    echo "No more stories to work on (all done or blocked)"
    exit 0
  fi

  STORY_TITLE=$(get_story_field "$STORY_ID" "title")
  SPECIALIST=$(get_story_field "$STORY_ID" "specialist")
  INSTRUCTIONS=$(get_specialist_instructions "$SPECIALIST")

  echo "Story: $STORY_ID — $STORY_TITLE"
  echo "Specialist: $SPECIALIST"
  echo "Instructions: ${INSTRUCTIONS:-none}"
  echo ""

  # Mark Forge issue as in_progress
  FORGE_ISSUE_ID=$(get_story_field "$STORY_ID" "forgeIssueId")
  update_forge_issue "$FORGE_ISSUE_ID" "in_progress"

  # Build the prompt
  PROMPT=$(build_prompt "$STORY_ID")

  # Write prompt to temp file (avoids shell quoting issues)
  PROMPT_FILE="/tmp/drill-prompt-$$.md"
  echo "$PROMPT" > "$PROMPT_FILE"

  # Run the agent
  if [[ "$TARGET" == "mini" ]]; then
    echo "Dispatching to Mac Mini..."
    OUTPUT=$(ssh "$MINI_HOST" "cd $MINI_CWD && $MINI_CLAUDE -p \"\$(cat $PROMPT_FILE)\" --dangerously-skip-permissions" 2>&1 | tee /dev/stderr) || true
  else
    echo "Running locally..."
    OUTPUT=$($LOCAL_CLAUDE -p "$(cat "$PROMPT_FILE")" --dangerously-skip-permissions 2>&1 | tee /dev/stderr) || true
  fi

  rm -f "$PROMPT_FILE"

  # Check for completion
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Story $STORY_ID COMPLETED"
    mark_story_done "$STORY_ID"

    # Update Forge issue to done
    FORGE_ISSUE_ID=$(get_story_field "$STORY_ID" "forgeIssueId")
    update_forge_issue "$FORGE_ISSUE_ID" "done"

    # Append to progress
    echo "" >> "$PROGRESS_FILE"
    echo "## $(date) — $STORY_ID: $STORY_TITLE" >> "$PROGRESS_FILE"
    echo "- Status: COMPLETED" >> "$PROGRESS_FILE"
    echo "- Specialist: $SPECIALIST" >> "$PROGRESS_FILE"
    echo "- Forge issue: $FORGE_ISSUE_ID → done" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  elif echo "$OUTPUT" | grep -q "<promise>BLOCKED"; then
    REASON=$(echo "$OUTPUT" | grep -o '<promise>BLOCKED:.*</promise>' | sed 's/<promise>BLOCKED: //' | sed 's/<\/promise>//')
    echo ""
    echo "Story $STORY_ID BLOCKED: $REASON"

    # Update notes in drill file
    local tmp_file="${DRILL_FILE}.tmp"
    jq --arg id "$STORY_ID" --arg note "BLOCKED: $REASON" '
      .stories = [.stories[] |
        if .id == $id then .notes = $note
        else . end
      ]
    ' "$DRILL_FILE" > "${DRILL_FILE}.tmp" && mv "${DRILL_FILE}.tmp" "$DRILL_FILE"

    # Append to progress
    echo "" >> "$PROGRESS_FILE"
    echo "## $(date) — $STORY_ID: $STORY_TITLE" >> "$PROGRESS_FILE"
    echo "- Status: BLOCKED — $REASON" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  else
    echo ""
    echo "Story $STORY_ID did not signal completion. Continuing to next iteration..."

    # Append to progress
    echo "" >> "$PROGRESS_FILE"
    echo "## $(date) — $STORY_ID: $STORY_TITLE" >> "$PROGRESS_FILE"
    echo "- Status: INCOMPLETE (no completion signal)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi

  echo "Iteration $i complete."
  sleep 2
done

echo ""
echo "Drill reached max iterations ($MAX_ITERATIONS) without completing all stories."
echo "Check $PROGRESS_FILE for status."
exit 1
