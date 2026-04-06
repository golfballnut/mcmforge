# MCM Forge Decisions Log

> Append-only. Never edit or remove entries. Add new decisions at the bottom.

- [2026-04-05] MCM Forge = custom Paperclip replacement. Built from scratch, not forked.
- [2026-04-05] 3 CLIs on Mini: Claude for COO, Codex for Builder, Gemini for QA/Reviewer.
- [2026-04-05] Agent API on localhost:3200 (not Vercel) for security. Agents never hit the public internet.
- [2026-04-05] FTS5 session search for cross-run memory (no vector DB). Simple, fast, no infra.
- [2026-04-05] [SILENT] marker for empty inbox runs (prevents notification spam).
- [2026-04-05] Delegation via REST API curl commands, not direct Supabase. Single point of validation.
