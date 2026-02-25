# Session 17 Handoff — System Overhaul + Self-Sustaining Ops

**Date**: 2026-02-25
**Focus**: Fix the agent pipeline so the Mac Mini produces shippable work, not burned tokens

---

## Problem Statement

Agents on the Mac Mini were burning tokens and producing nothing shippable:
- 14 duplicate PRs for the same trail-styling feature
- Night-ops regenerating the same tasks hourly (spam loop)
- 32 rejected duplicate tasks from runaway bake-offs
- 12 of 13 vault_docs had NULL content (agents flying blind)
- DirtSync repo had 148 branches and 59 stashes
- Vitest configured but never installed (TDD gate broken)
- Zero retry context (agents repeat same mistakes)

## What We Fixed (7 Systems)

### 1. Vault Sync — Agents Now Have Real Context
- Created `dispatcher/vault-sync.ts` — reads vault/*.md, populates vault_docs table
- **28 vault files → 24+ vault_docs**, all with real content (658 to 27K chars)
- Company profiles, competitor intel, decision specs, SOP skills all loaded
- Cron: runs every 6 hours to stay in sync with git

### 2. Dispatcher v4 — PR-Aware Prompts
- **PR injection**: agents see all open PRs before starting (no more duplicates)
- **CLAUDE.md injection**: reads target repo's CLAUDE.md and injects into prompt
- **Retry context**: failed tasks get previous error context on retry
- **Build failure detection**: catches TypeScript/Next.js build errors
- **No-tests warning**: logs when code tasks skip testing

### 3. Night-Ops v4 — Normalized Dedup + Research Caps
- **Normalized dedup**: strips CLI suffixes, action prefixes, compares word overlap (>60%)
- **PR-aware task creation**: checks `gh pr list` before creating tasks
- **Research frequency cap**: same research won't repeat within 24h
- **Code bake-offs killed**: Claude only for code (always wins — Session 15 data)
- **Ideation tasks**: weekly feature proposals, daily PR triage

### 4. DirtSync Repo Cleaned
- 148 → 2 branches (146 deleted)
- 59 → 0 stashes (all cleared)
- Back on master, up to date with origin
- Remote tracking refs pruned

### 5. Duplicate PRs Closed
- 18 PRs closed (13 duplicate trail-styling + 5 stale)
- 4 PRs remain open: #202 (trail styling), #203 (difficulty classification), #204 (split-pill badge), #205 (Vitest setup)

### 6. SOP Skills Created
- `shipping-checklist.md` — pre-ship checklist, quality gates, red flags
- `feature-proposal.md` — structured proposal template, research-first workflow
- `daily-ops.md` — daily operational rhythm, task priority rules, PR management

### 7. Cron Jobs Installed
- **Keep-alive** (every 15 min): restarts crashed PM2 processes, pulls latest code, ensures DirtSync on master
- **Vault sync** (every 6 hours): syncs vault/*.md → vault_docs table
- **Repo cleanup** (weekly Sunday): prunes stale branches, clears old stashes

## Current State

### Running on Mac Mini
| Process | PM2 ID | Status |
|---------|--------|--------|
| mcmforge-dispatcher (v4) | 6 | online |
| mcmforge-night-ops (v4) | 7 | online |

### Open PRs (DirtSync)
| # | Title | CI |
|---|-------|----|
| 202 | Deploy approved trail styling (Split Badge F) | Green |
| 203 | feat: classify trail difficulty ratings | Failing (build) |
| 204 | feat: outlaw trail split-pill badge | TBD |
| 205 | feat: add Vitest unit test infrastructure | TBD |

### Vault Docs
- 24 docs total, all with content
- 5 company profiles, 3 competitor profiles, 8 decisions, 3 intelligence, 9 skills

## Next Session Priorities

1. **Review open PRs** — merge #202 (trail styling, CI green), fix #203 CI
2. **Vitest installation** — get unit tests actually running on DirtSync (critical for TDD gate)
3. **Wire Context7 MCP** — agent prompts should get up-to-date framework docs
4. **Test the pipeline end-to-end** — queue a fresh task, watch it complete with real vault context
5. **Self-improvement loop** — agents learn from past failures (agent_learnings table)
6. **Feature proposal review** — check if agents are generating good ideas

## Architecture Decisions Made

1. **No more code bake-offs** — Claude wins code tasks 100% of the time, Gemini/Codex waste tokens
2. **Research bake-offs only** — Claude vs Gemini for research (different perspectives valuable)
3. **Normalized dedup** — fuzzy matching prevents the "slightly different title" spam loop
4. **PR-aware prompts** — agents see open PRs, preventing duplicate work
5. **Vault sync as cron** — keeps vault_docs in sync with git automatically
6. **Keep-alive cron** — self-healing infrastructure, auto-restarts crashed processes

## Files Changed

| File | Change |
|------|--------|
| `dispatcher/dispatcher.ts` | v4: PR awareness, CLAUDE.md injection, retry context, build failure detection |
| `dispatcher/night-ops.ts` | v4: normalized dedup, research caps, kill code bake-offs, ideation tasks |
| `dispatcher/vault-sync.ts` | NEW: reads vault/*.md, populates vault_docs table |
| `dispatcher/scripts/keep-alive.sh` | NEW: 15-min cron, auto-restart, code pull, branch check |
| `dispatcher/scripts/clean-repos.sh` | NEW: weekly branch/stash cleanup |
| `dispatcher/scripts/close-duplicate-prs.sh` | NEW: identify and close duplicate PRs |
| `vault/agents/skills/shipping-checklist.md` | NEW: shipping SOP |
| `vault/agents/skills/feature-proposal.md` | NEW: feature proposal SOP |
| `vault/agents/skills/daily-ops.md` | NEW: daily ops rhythm SOP |
