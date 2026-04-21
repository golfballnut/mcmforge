# Lessons Learned — Forge Builder

Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

---

## 2026-04-21 — FORGE-275: Agent API routes need service role client + middleware exemption

**Issue:** `createForgeClient()` (anon key) fails with RLS violation when inserting into `issue_attachments` from an agent API route — no user session means RLS denies the insert.

**Fix:** Use `createClient` from `@supabase/supabase-js` directly with `SUPABASE_SERVICE_ROLE_KEY` for agent-API DB writes that touch tables with user-owned RLS.

**Also:** `/api/agent/*` routes must be added to `PUBLIC_PATHS` in `middleware.ts` — they authenticate via `x-forge-agent-id` header, not Supabase sessions. Without this, the middleware redirects all agent API calls to `/login`.

**Outcome: worked**

---
