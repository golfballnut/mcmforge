# WO-6 — Day-1 end-to-end (Links Choice supplier intake loop)

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §5, §10, §13
**Status:** Ready to dispatch
**Depends on:** WO-4, WO-5
**Estimated effort:** 3 days
**Branch:** `feature/wo-6-day-1-loop`

---

## Goal

Wire all preceding WOs together for the Links Choice supplier-intake workflow. Supplier fills out form → 60 seconds later, Pam sees an approval card with the agent's draft reply, the supplier's CRM record, and a Drive doc link. Pam clicks Approve → email sends, Twenty Activity logged, task closes. End-to-end. This is the proof the system works.

## Why this WO exists

Until WO-6 ships, we have a CRM (WO-2), a form (WO-3), an integration layer (WO-4), and a daily UI (WO-5) — but no actual loop. Marketing-OS is "shipped" when this WO meets the PRD §13 acceptance criteria.

## Definition of done

PRD §13 acceptance criteria, copied verbatim:

- [ ] Pam can submit a Links Choice supplier-intake form on `linkschoice.com`.
- [ ] Within 60 seconds: a Twenty contact + opportunity exist in the Links Choice workspace.
- [ ] Within 60 seconds: a `forge.issues` row exists with status `awaiting_approval` and an agent-drafted reply in `approval_payload`.
- [ ] Pam sees the approval card in MCMForge Inbox at `/`.
- [ ] Pam clicks Approve. Email is sent via Gmail to the supplier within 5 seconds.
- [ ] Twenty Activity is logged on the contact + opportunity.
- [ ] `forge.issues` row closes. Mission Control reflects the close in the standup card the next morning.
- [ ] PR merged.

## In scope

### Agent draft logic (`forge-orchestrator/agents/links-choice-supplier-intake/`)
- Reads the `forge.issues` row + linked `forge.form_submissions.parsed` payload.
- Calls Twenty REST to read prior activity for the contact (if returning supplier).
- Reads `forge.knowledge` for current LC supplier pricing rules (must cite knowledge entry; refuses to quote if absent).
- Drafts a reply: greeting, price quote (or refusal-with-reason), photo confirmation request, next steps.
- Saves draft to Drive via Workspace MCP — folder per portfolio co.
- Updates `forge.issues.approval_payload` JSONB with: `{draft_text, drive_doc_url, summary, prior_activity_summary, knowledge_citations[]}`.
- Sets status → `awaiting_approval`. Inserts `forge.issue_events`.

### Approval card UX (extends existing `/inbox`)
- Card renders for issues with status `awaiting_approval` and `approval_payload` not null.
- Shows: source form data (collapsed), draft text (editable inline via `<textarea>`), Drive link, prior activity (collapsed), knowledge citations.
- Buttons: Approve & Send · Edit Draft · Reject · Send Back to Agent.

### Action handlers (`dashboard/src/app/inbox/actions.ts`)
- `approveAndSend(issueId, editedDraft?)`: sends Gmail via Workspace MCP, calls Twenty `logActivity` on contact + opportunity, updates `forge.issues` to `closed`, inserts `forge.issue_events`.
- `reject(issueId, reason)`: status → `rejected`, log reason, no email.
- `sendBack(issueId, note)`: status → `drafting`, append comment, agent re-runs.

## Out of scope

- Forms for other portfolio cos (LC only here).
- Auto-approve rules / policies (manual approval only).
- Multi-approver workflows.
- Email reply threading (single send, no thread tracking yet).
- Bounce handling.
- A/B testing different draft templates.

## Files likely touched

- `forge-orchestrator/agents/links-choice-supplier-intake/AGENTS.md` (new)
- `forge-orchestrator/agents/links-choice-supplier-intake/draft.ts` (new)
- `dashboard/src/app/inbox/_components/ApprovalCard.tsx` (new or major edit)
- `dashboard/src/app/inbox/actions.ts` (existing — extend with approveAndSend / reject / sendBack)
- `dashboard/src/lib/integrations/gmail.ts` (likely exists as Workspace MCP wrapper — extend if needed)
- `dashboard/tests/e2e/day-1-loop.spec.ts` (new — full E2E)
- `forge.knowledge` seed: at least 1 LC supplier-pricing entry (insert via SQL or admin UI before agent first runs).

## Suggested approach

1. Branch `feature/wo-6-day-1-loop`.
2. Seed `forge.knowledge` with at least one LC supplier-pricing entry first.
3. Build agent draft logic against fixture data (mocked submission); TDD with snapshot tests for draft text shape.
4. Approval card UI next — render an existing `awaiting_approval` issue, verify all sections show.
5. Action handlers last — Gmail send is the riskiest external call, mock it in tests.
6. E2E test in Playwright: submit form via Formbricks API → wait for approval card → click Approve → assert Gmail mock called + Twenty mock activity logged + issue closed.
7. Manual end-to-end on Vercel preview: real form submission, real Twenty workspace, real Gmail send to test address.

## Test plan

### Unit (Vitest)
- Draft generator: returns text matching expected sections, cites knowledge entry, refuses to quote when no knowledge match.
- Action handlers: state transitions correct, side effects (Gmail/Twenty) called once per approval.

### E2E (Playwright)
- `tests/e2e/day-1-loop.spec.ts`: full happy path.
- `tests/e2e/day-1-loop-reject.spec.ts`: reject path — no email, status correct.
- `tests/e2e/day-1-loop-sendback.spec.ts`: send-back path — agent re-runs, second draft different.

### Manual
- Steve + Pam walk through real submission on Vercel preview, end-to-end. PR-blocking until Pam signs off.

## How to run this WO (fresh session bootstrap)

1. Open new Claude Code session.
2. Paste this WO doc.
3. `/superpowers:brainstorming` — likely covers: draft template wording, knowledge schema for pricing rules, edge cases (returning supplier, missing photos, etc.).
4. `/superpowers:writing-plans` for implementation plan.
5. Execute via feature-builder-lead agent team (this is multi-component, agent-team appropriate).
6. PR + Steve & Pam verify end-to-end on Vercel preview.
