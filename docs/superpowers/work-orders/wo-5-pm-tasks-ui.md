# WO-5 — PM/Tasks UI extensions (Plane-mirror MVP)

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §6.1, §7
**Status:** Ready to dispatch
**Depends on:** WO-1
**Estimated effort:** 6 days (largest WO — consider splitting if blockers surface)
**Branch:** `feature/wo-5-pm-tasks-ui`

---

## Goal

Extend the existing `/issues` page in MCMForge to function as the team's daily Plane-equivalent UI: kanban view with drag-to-status, saved views, custom fields per project, bulk operations, "my work" filter, polished activity feed, responsive mobile, and a ClickUp CSV importer for migration. This is what the team will look at every day.

## Why this WO exists

Per PRD: build PM into MCMForge instead of paying for Plane. The team's daily UI needs to be modern, fast, and Mission-Control-shaped. Without this WO the team has no "ClickUp replacement" and the value of WO-2/WO-3/WO-4 isn't visible day-to-day.

## Definition of done

- [ ] Migration: `forge.views` table + `forge.issues.custom_fields` JSONB column.
- [ ] `/issues` route renders 3 view modes (List, Kanban, Calendar — Calendar deferred if scope tight).
- [ ] Kanban: drag-to-change-status, smooth animation, optimistic update + rollback on error.
- [ ] Saved views: Steve/Pam/agents can save a filter spec by name; views appear in left sidebar; personal vs team-shared scope.
- [ ] Custom fields admin UI: per-project, add/remove fields with type (text, number, select, date, user). Values stored in `issues.custom_fields` JSONB.
- [ ] Bulk ops: select-all checkbox + multi-select rows + batch actions (status, assignee, label, archive).
- [ ] "My work" view: filtered to `assignee_id = auth.uid()`, prominently in left sidebar.
- [ ] Activity feed: render `forge.issue_events` Linear-style on issue detail page (status changes, comments, links, etc.).
- [ ] Responsive mobile: `/issues`, `/inbox`, `/approvals` usable on iPhone Safari (test via DevTools + actual phone).
- [ ] ClickUp CSV importer: script in `forge-orchestrator/scripts/clickup-csv-import.ts` maps Folders→projects, Lists→labels, tasks→issues. Documented one-page README.
- [ ] All Vitest + Playwright tests green.
- [ ] PR merged.

## In scope

### UI work
- Kanban view component (`@dnd-kit`).
- Saved views sidebar + create/edit modal.
- Custom fields admin UI on each project's settings.
- Bulk action toolbar (sticky on row selection).
- "My work" predefined view.
- Issue detail page activity timeline polish.
- Responsive Tailwind across `/issues`, `/inbox`, `/approvals`.

### Migration
- `forge.views` table (per PRD §7).
- `forge.issues.custom_fields` JSONB column.

### Migration script
- ClickUp CSV importer — map fields, dedupe by external ID, idempotent.

## Out of scope

- Cycles/sprints (WO-7 optional polish).
- Time tracking.
- Custom roles / RBAC beyond admin/member.
- Audit logs.
- Native iOS/Android apps.
- Gantt charts.
- AI charts on dashboards.
- Activity feed for non-issues (project-level, etc.) — issue-level only.

## Files likely touched

- `supabase/migrations/2026-05-XX-pm-extensions.sql` (new)
- `dashboard/src/app/issues/page.tsx` (existing — major rework)
- `dashboard/src/app/issues/[id]/page.tsx` (existing — polish activity feed)
- `dashboard/src/app/issues/_components/Kanban.tsx` (new)
- `dashboard/src/app/issues/_components/SavedViews.tsx` (new)
- `dashboard/src/app/issues/_components/CustomFieldsAdmin.tsx` (new)
- `dashboard/src/app/issues/_components/BulkActions.tsx` (new)
- `dashboard/src/app/issues/_components/MyWorkFilter.tsx` (new)
- `dashboard/src/lib/views.ts` (new — saved views helpers)
- `dashboard/tests/e2e/issues-kanban.spec.ts` (new — Playwright)
- `forge-orchestrator/scripts/clickup-csv-import.ts` (new)
- README for the importer at `forge-orchestrator/scripts/README-clickup-import.md` (new)

## Suggested approach

This is the biggest WO. Consider sub-PR'ing if any of these gates take >1 day:

1. **Sub-PR-A: Schema + saved views + "my work"** (1.5d) — foundation.
2. **Sub-PR-B: Kanban view** (1.5d) — most visible.
3. **Sub-PR-C: Custom fields + bulk ops** (1.5d) — power features.
4. **Sub-PR-D: Activity feed polish + responsive mobile** (1d).
5. **Sub-PR-E: ClickUp CSV importer + README** (0.5d).

Or one big PR if the agent team can sequence cleanly.

Use TDD throughout. Playwright tests run on every PR for kanban + bulk ops + saved views.

## Test plan

### Unit (Vitest)
- Saved view CRUD.
- Kanban drag handler logic (status transition, optimistic update, rollback).
- Custom field validation.
- Bulk action confirmation flow.

### E2E (Playwright)
- `tests/e2e/issues-kanban.spec.ts`: drag a card from "Drafting" → "Awaiting Approval", assert status persisted on reload.
- `tests/e2e/issues-saved-views.spec.ts`: create view, switch to it, share with team, partner sees it.
- `tests/e2e/issues-bulk-ops.spec.ts`: select 3 issues, batch-assign to a user, all 3 update.
- `tests/e2e/issues-mobile.spec.ts`: on iPhone viewport, kanban scrolls horizontally cleanly.

### Manual on Vercel preview
- Steve loads on phone, walks through kanban, confirms it feels right.
- ClickUp CSV import dry run on a sample export.

## How to run this WO (fresh session bootstrap)

1. Open new Claude Code session.
2. Paste this WO doc.
3. `/superpowers:brainstorming` — interview will likely cover: visual design specifics for kanban (color tokens? card density?), which custom field types to ship in v1, ClickUp CSV column mappings.
4. `/superpowers:writing-plans` for sub-PR'd plan.
5. Execute. Likely needs feature-builder-lead agent team given scope.
6. PR(s) + Steve verifies on Vercel preview with mobile + desktop.
