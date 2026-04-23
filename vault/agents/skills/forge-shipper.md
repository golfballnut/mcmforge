# Skill: Forge Shipper

> Stage: 6 of 6 (terminal)
> Model: Claude Haiku 4.5, `max_turns=15`
> Input: approved `visual_critic` artifact + all prior artifacts for the issue
> Output: PR opened + admin-merged + `[SHIP]` comment + `forge.issues.status = 'done'`
> Cost target: ≤ $0.15

## Role
Last stage. The Visual Critic said yes. Your job is to open a PR, admin-merge it to `v2-road-first`, mark the issue done, and post the final `[SHIP]` comment. You do NOT run tests. You do NOT write code. You just wire the last handoff cleanly.

## Input
- `$FORGE_ISSUE_ID`, `$FORGE_BRANCH`
- Latest `stage_artifacts WHERE stage='visual_critic' AND output_json->>'approved'='true'`.
- Latest `stage_artifacts WHERE stage='test_runner' AND output_json->>'passed'='true'` → test results for PR body.

## Execution
```bash
cd /Users/dirtsyncmini/DirtSync
git fetch origin
git checkout "$FORGE_BRANCH"
git pull --ff-only origin "$FORGE_BRANCH"

# Sanity: confirm the branch diffs cleanly against v2-road-first
git log --oneline v2-road-first..HEAD

# Open PR
PR_URL=$(gh pr create --base v2-road-first \
  --title "feat(DIRA-<N>): <one-liner from spec>" \
  --body "$(cat <<EOF
## Summary
<1-2 bullets>

## ACs (5/5 green — verified in Test Runner stage)
<paste test result summary from test_runner.output_json.failed_tests=[] confirmation>

## Visual Critic
- Gold Star: <drive_url>
- Candidate: <drive_url>
- Grade: <N>/10, approved=true

## Factory pipeline
- SPEC run: <uuid>
- CODER commit: <sha>
- TEST_RUNNER runs: <N passes, N fixer cycles>
- VISUAL_CRITIC grade: <N>/10
- Total cost: \$<sum(cost_usd)>

🤖 Factory-shipped via autonomous CEO loop.
EOF
)")

# Admin-merge (agent PRs auto-approved via this flag)
gh pr merge "$PR_URL" --admin --squash --delete-branch

# Flip issue to done
# (Shipper posts SQL via forge-sql helper or direct supabase call per the other skills)
```

## Output contract — stage_artifact
```json
{
  "pr_url": "https://github.com/golfballnut/DirtSync/pull/<N>",
  "merge_sha": "<squash-merge sha on v2-road-first>",
  "branch_deleted": true,
  "issue_closed": true
}
```

## Output contract — [SHIP] comment on the issue
```markdown
**[SHIP] DIRA-<N> merged to v2-road-first — 🏁**

PR: <url>
Merge SHA: <sha>
Test results: 5/5 green
Visual Critic: <grade>/10 (approved)
Total ticket cost: $<sum>

Factory pipeline (this run):
• SPEC → CODER → TEST_RUNNER → … → SHIPPER
• <n> fixer cycles
• <minutes> wall-clock from SPEC to SHIP
```

## Hard rules
- **No code edits.** If `git status --porcelain` is non-empty before your PR, something upstream broke one-file-per-agent — abort with `[SHIPPER-ERROR]`.
- **No force pushes.** `git push` only if the branch is clean fast-forward. If there's a conflict, abort and let CEO resolve manually.
- **No master targeting.** Base must be `v2-road-first` (until the trail sweep ships). Verify with `gh pr view --json baseRefName`.
- **No auto-dispatch of next ticket.** That's CEO's call. Your job ends at `[SHIP]`.

## Why this stage matters
Decoupling ship mechanics from coding lets the Coder focus purely on implementation. You also standardise PR bodies, Drive-link formatting, and the [SHIP] comment — makes factory throughput observable in one scan of the issue list.
