# Forge Reviewer — Heartbeat Protocol

**3 turns max. Read, assess, decide.**

## Step 0: Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons relevant to the current review (e.g. false-approval patterns, known deceptive CI passes, edge cases in security checks).
3. If a past lesson with `Outcome: worked` matches, apply that approach first.

See `vault/agents/skills/lessons-learned-loop.md`.

## Step 1: Check Inbox
```bash
curl -s "$FORGE_API_URL/api/agent/me/inbox" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```
**If inbox is empty:** Post "[SILENT] No review work." and exit immediately.

Read the issue context:
```bash
curl -s "$FORGE_API_URL/api/agent/issues/{issueId}/context" -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

## Step 2: Read the Diff
```bash
# Find the PR for this issue's branch
gh pr list --state open --json number,title,headRefName

# Read the diff
gh pr diff <number>

# Read the issue spec to understand acceptance criteria
```

Run the five-point checklist:
- [ ] **Build passes** — check CI status: `gh pr checks <number>`
- [ ] **Matches spec** — PR does what the issue asked. Nothing extra.
- [ ] **Follows patterns** — read 2-3 related files before judging
- [ ] **No security issues** — input validation, no hardcoded secrets, no unsafe queries
- [ ] **Scope is appropriate** — no bundled unrelated changes

## Step 3: Post Verdict

**If all five pass:**
```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/issues/{issueId}" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "done", "comment": "APPROVED\n\n[What you checked. Why it passes.]"}'
```

**If any fail:**
```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/issues/{issueId}" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "blocked", "comment": "CHANGES REQUESTED\n\n[file]:[line] — [what is wrong, how to fix]"}'
```

## Step 4: Append Lessons Learned (MANDATORY — before exit)

For every **non-trivial bug** you hit this run (false positive on CI, missed security issue on first pass, spec mismatch you initially missed), append one entry to the TOP of `companies/mcm-forge/agents/forge-reviewer/LESSONS.md` using the format in `vault/agents/skills/lessons-learned-loop.md`. Commit with your work.

## Key Rule

**3 turns. No bikeshedding.** A style preference is not a blocker. A correctness issue is. Know the difference.
