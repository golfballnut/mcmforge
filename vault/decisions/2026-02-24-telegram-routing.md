# Decision: Telegram Multi-Company Routing

- **Date:** 2026-02-24
- **Status:** Implemented (edge function v5)
- **Decision maker:** COO (automated) + Steve (approved)
- **Category:** Infrastructure / Dispatcher

---

## Context
The Telegram webhook for task intake was hardcoded to route ALL tasks to the DirtSync repository. When Steve sent tasks for MCMForge, Links Choice, or any other company via Telegram, they were incorrectly filed under DirtSync.

This caused PR 186 to go to DirtSync instead of MCMForge -- a concrete failure that made it clear the routing needed to be fixed.

## Problem
- Telegram webhook hardcoded all tasks to DirtSync
- Steve manages 5 companies from a single Telegram chat
- No way to specify which company a task should route to
- Tasks going to the wrong repo wasted time and created confusion

## Decision
Parse a `[company-slug]` prefix from the Telegram message, look it up in the `company_registry` table in Supabase, and route accordingly. Default to `mcmforge` if no company slug is specified.

## Implementation Details
- **Edge function v5** deployed to Supabase
- **Message format:** `[dirtsync] Fix the outlaw trail badges` or `[mcmforge] Add health check endpoint`
- **Company lookup:** Queries `company_registry` table by slug
- **Default routing:** Messages without a `[slug]` prefix route to `mcmforge`
- **Error handling:** Unknown company slugs return an error message to Telegram
- **CLI targeting:** Added `#claude`, `#gemini`, `#codex` hashtag parsing to route to specific AI models
- **REPO_DIR_MAP:** `dirtsync` maps to `DirtSync`, `mcmforge` maps to `MCMForge` (case-sensitive repo names)

## Consequences

### Positive
- Steve can now route tasks to any company from a single Telegram chat
- Default to mcmforge prevents tasks from going to DirtSync by accident
- CLI model targeting (#claude, #gemini, #codex) adds flexibility
- Company registry in Supabase means adding new companies doesn't require code changes

### Negative
- Steve needs to remember to include `[slug]` prefix for non-MCMForge tasks
- If slug is misspelled, task will error instead of routing
- Extra parsing adds slight complexity to the edge function

## Alternatives Considered
1. **Separate Telegram bots per company** -- rejected (too many bots to manage)
2. **Separate Telegram channels per company** -- rejected (Steve wants one chat)
3. **AI-based company detection from message content** -- rejected (too unreliable, "fix the golf ball page" could be any of 3 companies)

## Lessons Learned
- Always validate routing before PR creation, not after
- Case-sensitive repo names (DirtSync vs dirtsync) caused the initial bug -- REPO_DIR_MAP must be maintained
- When tasks route wrong, reject/delete the PR and have Steve re-send correctly

## Related
- Bug fixed: PR 186 going to DirtSync instead of MCMForge
- Company: [[companies/mcmforge.md]]
- Infrastructure: Supabase edge function, `company_registry` table
