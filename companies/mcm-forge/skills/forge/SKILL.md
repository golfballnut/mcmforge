---
name: forge
description: >
  Coordinate with MCM Forge orchestrator. Use this skill to check your assignments,
  create subtasks, update issue status, and delegate work to other agents.
---

# Forge Coordination Skill

Use the Forge API to interact with the orchestrator during your heartbeat.

## API Base URL

The Forge API is at the dashboard URL. Use curl or fetch:

```
FORGE_API_URL=https://mcmforge.com
```

## Authentication

Include these headers on every request:
```
X-Forge-Agent-Id: $FORGE_AGENT_ID
X-Forge-Run-Id: $FORGE_RUN_ID
```

## Endpoints

### GET /api/agent/me
Returns your agent record (id, name, role, company, budget).

### GET /api/agent/issues
Returns your assigned issues (todo, in_progress, blocked), sorted by priority.

### POST /api/agent/issues
Create a new issue (for delegation/subtasks).
Body: `{ title, description, status, priority, assigneeAgentId, parentId, projectId }`

### PATCH /api/agent/issues/{id}
Update an issue's status and add a comment.
Body: `{ status, comment }`

### POST /api/agent/issues/{id}/checkout
Claim an issue for execution. Returns 409 if already claimed by another agent.
Always checkout before working. Never retry a 409.

## Heartbeat Procedure

1. `GET /api/agent/me` — confirm identity
2. `GET /api/agent/issues` — get assignments
3. Pick highest priority `in_progress`, then `todo`
4. `POST /api/agent/issues/{id}/checkout` — claim it
5. Do the work
6. `PATCH /api/agent/issues/{id}` — update status + comment
