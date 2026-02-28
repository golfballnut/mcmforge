# Dispatcher v6 — Session-Based Agent Orchestrator

**Date:** 2026-02-28
**Status:** Built, not deployed
**Author:** Steve + Claude (Session 29)

## Decision

Replace one-shot CLI spawning (`spawn("claude", ["--print", prompt])`) with persistent sessions via the Claude Agent SDK. Sessions accumulate context across tasks and enable multi-turn iteration within a single task.

## Problem

64% code task failure rate. Agents start cold on every task — no memory of previous work, no ability to see test failures and fix them. Each retry is another cold start.

## Solution

- **SessionManager** wraps Claude Agent SDK `query()` with `resume: sessionId`
- **3 personas** (builder, researcher, COO) get persistent sessions keyed by `persona:companyId`
- **Multi-turn executor** gives code tasks up to 3 turns to iterate
- **Feature flag** (`session_mode` in system_config) enables instant rollback
- **Fallback** to `spawnCli()` on any SDK error

## Files

| File | Purpose |
|------|---------|
| `dispatcher/agent-personas.ts` | Persona definitions + routing |
| `dispatcher/session-manager.ts` | Session lifecycle management |
| `dispatcher/multi-turn-executor.ts` | Multi-turn code execution |
| `supabase/migrations/20260228_v6_agent_sessions.sql` | DB table + RLS |

## Deployment Steps

1. Run SQL migration on MCM Forge Supabase
2. Push code to main (keep-alive pulls + restarts)
3. `npm install` on Mini (adds `@anthropic-ai/claude-agent-sdk`)
4. Set `session_mode = "enabled"` in system_config
5. Test with a single low-priority code task
6. Monitor 48 hours

## Rollback

Set `session_mode = "disabled"` — instant, zero-downtime revert to v5 one-shot mode.
