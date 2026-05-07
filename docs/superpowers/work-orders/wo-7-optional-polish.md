# WO-7 — Optional polish (Cycles · ClickUp full migration · Other-co intake forms)

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §6.1, §11
**Status:** Optional, dispatch only after WO-6 ships and is stable for ≥7 days
**Depends on:** WO-6
**Estimated effort:** 3 days (split across three sub-WOs if needed)
**Branch:** `feature/wo-7-polish` (or sub-branches per item)

---

## Goal

Three independent enhancements that improve the Marketing-OS experience but aren't required to call it shipped. Pick the highest-priority subset based on team feedback after WO-6 has been live for a week.

## Why this WO exists

The PRD §6.1 explicitly defers cycles/sprints, the ClickUp full migration sweep, and additional portfolio-co intake forms as "optional, only if M0–M2 leaves time." This WO is the placeholder that captures them so they don't get lost.

## Definition of done

This WO is complete when one or more of the three sub-deliverables below ships. Each sub is independent.

### Sub-A: Cycles / sprints (1d)

- [ ] Migration: `forge.cycles` table.
- [ ] `dashboard/src/app/cycles/page.tsx` — list active + upcoming cycles per project.
- [ ] Cycle picker on issue detail page.
- [ ] "Active cycle" filter in saved views.
- [ ] Tests + PR merged.

### Sub-B: ClickUp full migration sweep (1d)

- [ ] All ClickUp data exported (Folders → Lists → Tasks → Comments → Attachments).
- [ ] Import script handles all field types from PRD §6.1's CSV importer + extends to attachments.
- [ ] User mapping (ClickUp users → Supabase Auth users) documented.
- [ ] Dry-run report generated, Steve approves before live import.
- [ ] Live import run; ClickUp deactivated 24h after sign-off.
- [ ] PR merged.

### Sub-C: Other-co supplier-intake forms (1d)

- [ ] Form built in Formbricks for at least 2 of: GBN, HGB, MCM Forge.
- [ ] Embed deployed on each portfolio co's website.
- [ ] Webhook routing in MCMForge already supports `?company=<slug>` from WO-4 — verify each new co's `forge.companies.slug` is correct.
- [ ] Per-co Twenty workspace seeded with at least 5 contacts.
- [ ] Per-co `links-choice-supplier-intake` agent cloned + parameterized for each new co (knowledge entries per co).
- [ ] Manual end-to-end test per new co.
- [ ] PR merged.

## In scope

Whichever subset Steve prioritizes. Default order if all three land: Sub-A → Sub-C → Sub-B.

## Out of scope

- Cycle burndown charts (Phase 3 if cycles prove valuable).
- ClickUp Forms data import (forms move forward via Formbricks; historical form responses can stay in ClickUp archive).
- Advanced workflow rules per co (each co adapts the LC base flow as needed in its own ticket).

## Files likely touched

(Per sub-deliverable.)

### Sub-A
- `supabase/migrations/2026-XX-XX-cycles.sql` (new)
- `dashboard/src/app/cycles/` (new directory)
- `dashboard/src/app/issues/[id]/_components/CyclePicker.tsx` (new)

### Sub-B
- `forge-orchestrator/scripts/clickup-full-migration.ts` (new — extends WO-5's CSV importer)
- `forge-orchestrator/scripts/clickup-user-map.json` (new)

### Sub-C
- `forge-orchestrator/agents/{gbn,hgb,mcm-forge}-supplier-intake/` (new directories — clones of LC agent)
- Formbricks form definitions (in admin UI, not code).
- Each portfolio co's website repo (separate edits).

## Suggested approach

Spawn this WO **only after** WO-6 has run successfully for ≥1 week and the team has actually used Marketing-OS. Their feedback drives sub-priority.

For each sub-deliverable, treat it as its own mini-WO:
1. Branch.
2. `/superpowers:brainstorming` — refine scope based on real feedback.
3. `/superpowers:writing-plans`.
4. Execute.
5. PR + verify.

## Test plan

Per sub-deliverable. Reuse patterns from WO-5 / WO-6.

## How to run this WO (fresh session bootstrap)

1. After WO-6 has been live ≥7 days, gather team feedback (Pam + Steve).
2. Pick sub-deliverable (A, B, or C).
3. Open new Claude Code session.
4. Paste this WO doc + the chosen sub-deliverable section.
5. `/superpowers:brainstorming` to refine and add specifics from feedback.
6. Continue normal flow.
