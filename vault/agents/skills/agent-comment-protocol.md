# Skill: Agent Comment Protocol

Every specialist posts structured comments on their assigned issue throughout a run. These comments are the human-in-the-loop channel — the CEO and Steve read them in real time to monitor progress, catch blockers, and verify work before merge.

## The 5 Tags

### [START]
Post immediately after picking up the issue, before touching any code.

**What to include:**
- What you understood the issue to be asking (1-2 sentences)
- Which files you plan to modify (file list)
- Estimated time or iteration count

**Example:**
```
[START] FORGE-42: Add cost breakdown chart to dashboard.
Plan: (1) read CostPage.tsx, (2) add BarChart component using recharts, (3) wire Supabase query.
Files: dashboard/src/app/costs/page.tsx. Est: 15 min.
```

---

### [PROGRESS]
Post on every major state transition: after checkout, after each implement phase, after build passes, after push.

**What to include:**
- What just completed
- Whether it succeeded or failed
- What's next

**Example:**
```
[PROGRESS] Build passes (0 errors). About to push branch agent/forge-42-cost-chart and open PR.
```

---

### [BLOCKED]
Post immediately when stuck for more than 2 minutes on any obstacle.

**What to include:**
- Exactly what you tried
- The error or missing information
- 2-3 options for how to unblock (let the COO pick)

**Example:**
```
[BLOCKED] Build fails: "Module not found: recharts". Not in package.json.
Options: (A) run npm install recharts and commit package-lock update, (B) use a different charting lib already installed, (C) wait for COO to approve the dep addition.
```

---

### [PROOF]
Post when the PR is ready, BEFORE calling `gh pr create`. Include concrete artifacts — not assertions.

**What to include:**
- Build output (last 5-10 lines of `npx next build`)
- PR branch and PR command you're about to run
- Curl snippet or test output confirming the feature works

**Example:**
```
[PROOF] Build tail:
  Route /costs: 2.1 kB (142ms)
  ✓ Compiled successfully
Branch: agent/forge-42-cost-chart
PR: feat(FORGE-42): cost breakdown chart
curl test: GET /api/costs → 200, { "total": 4.82, "breakdown": [...] }
```

---

### [DONE]
Post as the last action before exiting. Summarize the run.

**What to include:**
- What shipped (1 sentence)
- Branch and PR link
- Approximate cost and time
- Link to LESSONS.md entry if any was added

**Example:**
```
[DONE] FORGE-42: Cost chart shipped. Branch: agent/forge-42-cost-chart. PR #47.
~$0.18 / 8 min. No new lessons.
```

---

## How to Post a Comment

```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/comments" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body": "[START] ...", "tags": ["START"]}'
```

The `tags` field is optional metadata. The tag itself MUST appear in the body text as the first word (e.g. `[START]`).

---

## HEARTBEAT Integration

Each HEARTBEAT.md should require these posts at the following lifecycle points:

| Lifecycle point | Tag | Requirement |
|-----------------|-----|-------------|
| After LESSONS.md read, before any code | [START] | MANDATORY |
| After issue checkout | [PROGRESS] | MANDATORY |
| After each implement phase / major decision | [PROGRESS] | MANDATORY |
| After build passes | [PROGRESS] | MANDATORY |
| After push, before `gh pr create` | [PROOF] | MANDATORY |
| Any time stuck >2 min | [BLOCKED] | MANDATORY |
| Last action before exit | [DONE] | MANDATORY |

**Rule: Silence = broken.** If the COO sees no [START] comment on an issue after 5 minutes, the run is assumed stuck. If there's no [DONE], the run is assumed crashed. Post on every transition.
