# Golden Feature Standard — Why/How/What Formula (2026-04-01)

## Decision
All features across all companies now follow the Golden Feature skill: Why → How → What.

## What Changed
- Created `vault/agents/skills/golden-feature.md` — the master feature delivery skill
- Created `.claude/skills/golden-feature/` — invocable skill with SKILL.md + references
- Wired into 4 permanent layers:
  1. `~/.claude/CLAUDE.md` — Global instructions, above Universal Rules
  2. `.claude/hooks/brain-brief.sh` — Reminder on every session start
  3. `vault/agents/skills/coo-session-start.md` — First skill for feature work
  4. `vault/agents/skills/orchestrator.md` — Rule #0 for dispatcher routing

## The Formula
- **Why** = rider need in their voice (not technical)
- **How** = workflow diagram + tech stack table
- **What** = test matrix (unit + integration + field) defined BEFORE code
- **Gold** = 100% of What rows pass. Steve's field test is final gate.

## Why This Matters
Steve was frustrated: features looked done but failed field tests. Root cause — Claude builds the How without defining the What, so there's no contract for "done." The What IS the contract. Tests first, code second, field validation last.

## Steve's Words
"Claude may not be smart enough to take a why and build it yet but it is smart enough to gather the context and follow a self-learning loop to build and ship features."
