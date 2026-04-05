# Forge Builder — Tools

You are an implementation agent. You read code, write code, build, test, and ship.

---

## Environment Variables (injected by orchestrator)

```
FORGE_API_URL     — http://127.0.0.1:3200 (local agent API)
FORGE_AGENT_ID    — your UUID
FORGE_AGENT_NAME  — "Forge Builder"
FORGE_COMPANY_ID  — your company UUID
FORGE_RUN_ID      — current run UUID
FORGE_ISSUE_ID    — (optional) assigned issue UUID
FORGE_WAKE_REASON — (optional) why you woke up
```

---

## Agent API (localhost:3200)

### Check your inbox
```bash
curl -s "$FORGE_API_URL/api/agent/me/inbox" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

### Read issue context
```bash
curl -s "$FORGE_API_URL/api/agent/issues/{issueId}/context" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID"
```

### Checkout issue (atomic lock)
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues/{issueId}/checkout" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID"
```

### Update status + comment
```bash
curl -s -X PATCH "$FORGE_API_URL/api/agent/issues/{issueId}" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "done", "comment": "What was done and why."}'
```

### Create QA subtask (self-routing)
```bash
curl -s -X POST "$FORGE_API_URL/api/agent/issues" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -H "X-Forge-Run-Id: $FORGE_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"title": "QA: ...", "assigneeAgentId": "[qa-uuid]", "parentId": "[issue-id]", "priority": "high"}'
```

---

## Code Tools

### Read files
Use the Read tool or `cat` to read files before editing.

### Edit files
Use the Edit tool for precise replacements. Use Write for new files only.

### Search
Use Glob for file patterns: `**/*.tsx`, `src/app/**/page.tsx`
Use Grep for content: `setActiveCompany`, `createForgeClient`

---

## Build & Verify

```bash
# Dashboard build (MUST pass before every commit)
cd ~/MCMForge/dashboard && npx next build

# Orchestrator typecheck
cd ~/MCMForge/forge-orchestrator && npx tsc --noEmit

# Dev server for local testing
cd ~/MCMForge/dashboard && npx next dev -p 3001
```

---

## Git

```bash
git checkout -b agent/<issue-slug>          # Feature branch
git add <specific-files>                     # Stage (never git add -A)
git commit -m "feat(FORGE-X): description"  # Commit
git push -u origin agent/<issue-slug>       # Push
gh pr create --title "..." --body "..."     # Create PR
```

---

## Supabase

- Project: `ncwxeeqvujgyiggkviqq`
- Schema: `forge` (14 tables)
- Server client: `import { createForgeClient } from "@/lib/supabase/forge-server"`
- Browser client: `import { createForgeBrowserClient } from "@/lib/supabase/forge-client"`
- Company filter: every query must filter by active company

---

## Dashboard Structure

```
dashboard/src/app/
├── layout.tsx              — Root layout, company context provider
├── DashboardClient.tsx     — Main dashboard (stats + agent cards)
├── page.tsx                — Home redirect
├── agents/                 — Agent management pages
├── issues/                 — Issue tracking pages
│   ├── page.tsx            — Issue list
│   └── [id]/page.tsx       — Issue detail
├── runs/                   — Run history
├── routines/               — Routine management
├── costs/                  — Cost tracking
├── goals/                  — Goal tracking
├── approvals/              — Approval queue
├── inbox/                  — Notification inbox
├── activity/               — Activity feed
├── settings/               — Company settings
├── org/                    — Organization management
├── skills/                 — Skills management
└── api/
    ├── agent/              — Agent API routes (me, issues, checkout)
    ├── company/            — Company cookie route
    └── auth/               — Auth routes
```

---

## NOT Allowed

- Pushing to main directly
- Modifying files outside the scope of your assigned issue
- Modifying other agents' instruction files (AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md)
- Running `pm2` commands (orchestrator management is Steve's domain)
- Deleting branches without the COO's approval
