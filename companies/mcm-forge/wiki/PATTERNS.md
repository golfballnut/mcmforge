# MCM Forge Code Patterns

## Dark Theme Tokens
```
bg:      #0d1117
surface: #161b22
border:  #30363d
accent:  #00d4aa
text:    #e6edf3
muted:   #8b949e
danger:  #f85149
warning: #d29922
```

## Supabase Client
- Server-side: `createForgeClient()` — uses service role key
- Client-side: `createForgeBrowserClient()` — uses anon key + RLS
- Always use `forge` schema: `.schema('forge')` on every query

## Page Pattern
- Every page filters by active company via `getActiveCompany()`
- Company ID comes from cookie, not URL
- Cookie race: always `await` cookie write before `router.refresh()`

## Git Workflow
- Never push to `main` directly
- Agent branches: `agent/<agent-slug>` (e.g., `agent/forge-builder`)
- All changes require a PR
- Vercel preview URL auto-generated on PR creation

## Agent API Usage
```bash
curl -X POST $FORGE_API_URL/api/agent/delegate \
  -H "Content-Type: application/json" \
  -H "X-Forge-Agent-Id: $FORGE_AGENT_ID" \
  -d '{"title": "...", "assignee_slug": "forge-builder", "body": "..."}'
```

## Error Handling
- All API endpoints return `{ success: boolean, error?: string, data?: any }`
- Agents must check `success` before proceeding
- On failure: log error, do NOT retry automatically (prevents loops)

## Naming Conventions
- Issues: descriptive title, no prefix codes
- Branches: `agent/<slug>` for agent work, `feature/<name>` for human work
- PRs: short title (<70 chars), body has ## Summary + ## Test Plan
