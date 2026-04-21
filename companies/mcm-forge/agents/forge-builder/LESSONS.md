# Lessons Learned — Forge Builder

Append new entries at the top. See `vault/agents/skills/lessons-learned-loop.md` for format.

---

## FORGE-284 — Vitest include pattern in forge-orchestrator requires __tests__ subdirectory

**Date:** 2026-04-21
**Issue:** Tests placed at `src/agent-api.test.ts` were not discovered by `npx vitest run`.
**Root cause:** `vitest.config.ts` in forge-orchestrator sets `include: ['src/**/__tests__/**/*.test.ts']` — tests must live inside a `__tests__` subdirectory, not co-located with source.
**Fix:** Move test file to `src/__tests__/agent-api.test.ts` and update relative mock/import paths (`./utils/logger.js` → `../utils/logger.js`).
**Outcome:** worked — all 8 tests passed after moving.

---

## FORGE-284 — Orchestrator supabase client already service-role + forge schema; use single client for storage + DB

**Date:** 2026-04-21
**Issue:** Need to do storage uploads AND `forge.issue_attachments` inserts inside the bundled agent API.
**Root cause:** The `supabase` instance passed to `startAgentApi()` is created with `supabaseServiceRoleKey` and `db: { schema: 'forge' }`. Storage API (`supabase.storage`) is independent of the db schema setting.
**Fix:** Use the single passed-in `supabase` for both `.storage.from('artifacts').upload()` and `.from('issue_attachments').insert()`. No second client needed.
**Outcome:** worked — no RLS errors, no schema errors.

---
