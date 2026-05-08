# Marketing-OS — Design Document

**Date:** 2026-05-07
**Author:** Claude (Opus 4.7) + Steve McMillian
**Status:** Draft, pending Steve's review
**Related:** Replaces FORGE-370 (CRM data layer adoption — superseded by this broader design)

---

## 1. Vision

Build **Marketing-OS** — an agent-driven business operating system that runs marketing across all 5 portfolio companies (Links Choice, GBN, HGB, MCM Forge, DirtSync) with humans in the loop only for approve/reject decisions.

Replaces ClickUp (forms + tasks + light automation) for the operator team (2–4 humans, scaling to 5+). Surfaces a daily UI the team will actually like using. Integrates with the existing operational stack (NetSuite, ShipStation, Google Drive, Gmail) read-only or via webhooks — no replacement of those systems in this scope.

**The bet:** the team's workflow today is intake → triage → draft → approve → send. Agents draft. Humans approve. The system unblocks the team from low-leverage drafting work and lets MCM Forge run marketing at portfolio scale.

---

## 2. Stack

Three components. Each owns one thing. None overlap.

| Component | Choice | What it owns | Hosting |
|---|---|---|---|
| **CRM + PM/Tasks + Agent shell + Approvals** | **Build into MCMForge** | Customers / suppliers / contacts / accounts / activities (CRM) · Issues, kanban, custom fields, saved views, bulk ops (PM) · Mission Control, Inbox, /approvals, agent runs, Drive, Gmail (shell). Single Postgres, single source of truth. | Vercel (existing). |
| **Forms** | Formbricks (formbricks/formbricks) | Public intake forms on portfolio company sites. Submission webhooks. | Self-host Docker on Mac Mini. |

**Why build the CRM into MCMForge instead of self-hosting Twenty (decision 2026-05-07, post-WO-1):** The agent-driven marketing flow's value is in the integration of CRM data with task state, agent drafts, and human approvals. Twenty is generic and would have required a webhook/REST translation layer between two Postgres databases, eventual-consistency edge cases, AGPL compliance for our fork, and an extra Docker stack on the Mini (app + Postgres + Redis + BullMQ + Cloudflare Tunnel). Building CRM views on top of `forge.*` adds ~10 days, gives us single-source-of-truth, agent-native activity timelines, in-place approvals on contact pages, and cross-portfolio search — none of which is feasible in Twenty without significant plugin work. We accept the polish gap (Notion-style inline editing, custom-field UI builder) since those features aren't on the team's daily workflow path. See `docs/superpowers/specs/2026-05-07-mcmforge-crm-design.md` for the full CRM spec.

**Why build the PM layer instead of using Plane:** MCMForge already has `forge.issues` (483 rows), `forge.issue_comments` (1,937 rows), `forge.issue_events`, `/issues` page, and multi-tenancy by `company_id`. The gap to a Plane-equivalent for *this team's* needs is ~20 working days. Plane's surplus features (time tracking, custom roles, audit logs, AI charts, native mobile) are not on the team's actual usage path.

**Why Formbricks (not building):** Form-builder UIs (drag-drop, embed SDK, validation logic) are 3+ weeks of dead-weight work. Formbricks does it free with a clean JS embed.

---

## 3. Architecture & Data Flow

### Component map (day-1 loop, Links Choice supplier intake)

```
┌────────────┐    webhook    ┌─────────────────────────────────────────┐
│ Formbricks │ ─────────────►│            MCMForge (Vercel)             │
│  (intake)  │               │                                          │
└────────────┘               │  /api/webhooks/formbricks                │
                             │            │                             │
                             │            ▼                             │
                             │  forge.crm_accounts ◄── lib/crm/client   │
                             │  forge.crm_contacts                      │
                             │  forge.crm_activities      (single DB,   │
                             │  forge.issues (contact_id)  one truth)   │
                             │            │                             │
                             │            ▼                             │
                             │  /crm/contacts/[id]  (Pam sees timeline) │
                             │  /inbox              (Pam approves)      │
                             │            │                             │
                             │            │ on approve                  │
                             │            ▼                             │
                             │  Gmail send + log forge.crm_activities   │
                             │  + close forge.issues                    │
                             └─────────────────────────────────────────┘
                                          ▲
                                          │ direct SQL (service role)
                                  ┌───────┴───────┐
                                  │ Forge agents  │
                                  │ (orchestrator)│
                                  └───────────────┘
```

### Data ownership principles

- **`forge.crm_*` (in MCMForge)** owns customer/supplier records — accounts, contacts, activities. The truth.
- **`forge.issues` (in MCMForge)** owns work-in-flight state — tasks, kanban, status, assignee. Issues link to contacts via `forge.issues.contact_id` (nullable).
- **Formbricks** owns intake form definitions and raw submissions.
- **MCMForge dashboard** owns agents, approvals, and the team's daily view (Inbox, Mission Control, CRM views).

### Integration principles

- **Webhooks IN** from Formbricks → `/api/webhooks/formbricks` on MCMForge. (No CRM webhooks needed — CRM is local.)
- **Direct SQL** for everything internal: agents read/write CRM via the service-role Supabase client. No internal REST/GraphQL layer.
- **Postgres triggers + Supabase realtime** for events internal to `forge.*` schema (zero-latency agent reactions to state changes).
- **Drive + Gmail** via existing Workspace MCP server.
- **NetSuite + ShipStation** = read-only future integrations (Phase 2 — out of scope here).

---

## 4. Per-portfolio-company isolation

Each of the 5 portfolio companies (Links Choice, GBN, HGB, MCM Forge, DirtSync) gets:

- **Its own `forge.companies` row** — already exists. All `forge.issues`, `forge.issue_comments`, `forge.crm_contacts`, `forge.crm_accounts`, `forge.crm_activities`, etc. carry `company_id` for tenant isolation.
- **Its own Formbricks environment** — separate forms, separate webhook secrets.
- **Shared MCMForge dashboard** — single instance, multi-tenant via `company_id`. Agents see all companies; the team filters per-co via the existing Mission Control.
- **Cross-portfolio search** is a first-class feature (`/crm/search`) — strictly impossible in Twenty's workspace model, native here.

**Phase 1** ships isolation for **Links Choice only**. Workspaces for the other 4 are stubbed but not populated until each company's Phase 2 onboarding.

---

## 5. Day-1 end-to-end workflow

**Scenario:** A potential supplier visits `linkschoice.com`, fills out the "Sell us your used balls" form.

### Sequence

1. **Form submission** — Formbricks captures: name, email, phone, ball brand, estimated quantity, photos (up to 3), notes.
2. **Webhook fires** to `https://mcmforge.com/api/webhooks/formbricks?company=links-choice`. HMAC-signed.
3. **Forge router** (`/api/webhooks/formbricks`) verifies HMAC, looks up portfolio co by URL param, persists to `forge.form_submissions` (new table — see §7 schema), and (all in one DB transaction via `lib/crm/client.ts`):
   - `findOrCreateAccount` by email domain (Links Choice supplier).
   - `findContactByEmail` or `createContact`, attached to that account, status `lead`.
   - `logActivity` of kind `note` with the form payload as body.
   - Inserts `forge.issues` row in `links-choice / supplier-intake` board, status `drafting`, `contact_id` set to the new contact, assigned to the Links Choice supplier-intake agent.
4. **Agent picks up** the new issue (existing routine pattern). Reads `forge.knowledge` for current LC supplier pricing rules + queries `forge.crm_activity_timeline` for this contact (returning supplier history). Drafts a reply (price quote + photo-confirmation request + next steps). Saves draft to Drive (existing Workspace MCP).
5. **Agent updates** the issue: status → `awaiting_approval`. Inserts `forge.issue_events` for activity feed (these auto-derive into the contact's timeline via the SQL view). Sets `approval_payload` JSONB containing draft body + Drive doc URL + form data summary.
6. **MCMForge Inbox** auto-surfaces the issue to Pam (existing Inbox card system). Card shows: source form data, draft preview, Drive doc link, contact link to `/crm/contacts/[id]`, "Approve / Reject / Edit" actions.
7. **Pam clicks Approve.** MCMForge:
   - Calls Gmail send (Workspace MCP).
   - `logActivity` of kind `email_sent` linked to the contact + issue with the draft body.
   - Updates `forge.issues` status → `closed` and contact status → `qualified` (or whatever rule applies). Adds `forge.issue_events` for the close.
   - If Pam edited, draft is overwritten before send and `forge.issue_events` carries the diff.

**End-to-end SLO:** form submission to draft-in-inbox in < 60 seconds. Pam-approve to email-sent in < 5 seconds.

---

## 6. Component scope (in / out)

### 6.1 PM / Tasks (build into MCMForge — replaces Plane)

**In scope (M0–M2):**
- Kanban board view on `/issues` with drag-to-status (uses `@dnd-kit`).
- List view (already exists, keep).
- Saved views (`forge.views` table — JSONB filter spec, scope = workspace or personal).
- Custom fields (`issues.custom_fields` JSONB column + admin UI for field definitions).
- Bulk operations (multi-select issues → batch status / assignee / labels).
- "My work" view (filter where `assignee_id = current_user`).
- Activity feed polish — render existing `forge.issue_events` Linear-style.
- Responsive mobile web (tighten Tailwind breakpoints across `/issues`, `/inbox`, `/approvals`).
- ClickUp CSV importer (script — export from ClickUp, map to `forge.issues`).
- Cycles / sprints (`forge.cycles` table + cycle picker on issues) — *only if M0–M2 leaves time. Optional.*

**Out of scope (deferred or never):**
- Time tracking, custom roles / RBAC, audit logs, AI charts, native iOS/Android apps, Gantt charts, multi-language, intake-form builder (Formbricks does this).

### 6.2 CRM (build into MCMForge)

**In scope (v1):**
- Three new `forge.*` tables: `forge.crm_accounts`, `forge.crm_contacts`, `forge.crm_activities`. JSONB custom fields. RLS enabled.
- New nullable column `forge.issues.contact_id` linking issues to contacts.
- SQL view `forge.crm_activity_timeline` that UNIONs explicit activities with auto-derived rows from `forge.issue_events` — agent-native timeline with no double-writes.
- Pages under `dashboard/src/app/crm/`: `/crm`, `/crm/contacts`, `/crm/contacts/[id]`, `/crm/accounts`, `/crm/accounts/[id]`, `/crm/search`.
- Agent's-eye preview panel on contact detail (shows knowledge summary + on-demand draft preview).
- Cross-portfolio search across all 5 portfolio cos.
- TypeScript client `dashboard/src/lib/crm/client.ts` (typed Supabase service-role calls): `findContactByEmail`, `createContact`, `findOrCreateAccount`, `logActivity`, `listActivitiesForContact`, `previewAgentDraft`.
- Per-portfolio-company custom-field schemas in `dashboard/src/lib/crm/custom-fields/<slug>.ts`.

**Out of scope (deferred):**
- Notion-style inline editing (form-based modals in v1; revisit after WO-5).
- Kanban deal pipeline (Contact `status` field is enough for v1).
- Custom-field UI builder (TypeScript-config only).
- Bulk CSV import (manual + Formbricks intake only; CSV in WO-7 polish).
- Email/calendar sync (auto-derived from issues only in v1).
- Multi-contact-per-issue (one `contact_id` on issues; extend with link table when needed).
- Tenant-isolation policies via `user_companies` (permissive `authenticated_all` policy in v1, matches WO-1 pattern; future RBAC WO).

Full spec: [`docs/superpowers/specs/2026-05-07-mcmforge-crm-design.md`](2026-05-07-mcmforge-crm-design.md).

### 6.3 Forms (Formbricks)

**In scope:**
- Self-host Formbricks Docker stack on Mac Mini. Fall back to Formbricks Cloud Free *only if* Mini RAM exceeds 80% during WO-2 + WO-3 setup, or Formbricks crashes ≥2× during initial 48h soak. Decision recorded in WO-3 acceptance notes.
- One form M0: Links Choice supplier intake.
- JS embed snippet on `linkschoice.com`.
- Webhook to `mcmforge.com/api/webhooks/formbricks?company=links-choice` with HMAC.

**Out of scope:**
- Forms for other 4 portfolio cos (Phase 2 onboarding).
- Multi-step branching forms (M0 single-page only).
- Form analytics dashboards (Formbricks gives basic; defer custom).

### 6.4 Agent shell + approvals (MCMForge — extend existing)

**In scope (delta over what's already shipped):**
- Webhook receivers: `/api/webhooks/formbricks` (only — CRM is local).
- Typed CRM client: `dashboard/src/lib/crm/client.ts` (see §6.2). No Twenty REST client needed.
- New table: `forge.form_submissions`. (Drops `forge.crm_links` — issues link to contacts directly via `forge.issues.contact_id`.)
- Inbox card schema extension: `approval_payload` JSONB + render rules for draft + Drive link + linked contact.
- Outbound Gmail-send action wired to approval flow (uses existing Workspace MCP).
- Activity logger: on approve, calls `logActivity` (kind `email_sent`) and closes `forge.issues`.

**Already shipped (no change):**
- `/`, `/inbox`, `/approvals`, `/agents`, `/projects`, `/goals`, `/routines`, `/runs`, `/knowledge`, `/changelogs`, `/costs`, `/skills`.
- Mission Control layout (FORGE-363).
- Daily standup card (FORGE-360).

---

## 7. Data model

### New `forge.*` tables

```sql
-- Form submissions cache (raw + parsed)
CREATE TABLE forge.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  source TEXT NOT NULL,                     -- 'formbricks'
  external_id TEXT NOT NULL,                -- Formbricks submission id
  form_slug TEXT NOT NULL,                  -- 'links-choice-supplier-intake'
  payload JSONB NOT NULL,                   -- raw submission
  parsed JSONB,                             -- normalized {name, email, phone, ...}
  issue_id UUID REFERENCES forge.issues(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, external_id)
);

-- CRM tables: see docs/superpowers/specs/2026-05-07-mcmforge-crm-design.md §4
-- forge.crm_accounts, forge.crm_contacts, forge.crm_activities
-- Plus column add: forge.issues.contact_id (nullable FK to forge.crm_contacts)
-- Plus view: forge.crm_activity_timeline

-- Saved views (PM layer)
CREATE TABLE forge.views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES forge.companies(id),  -- nullable = global
  owner_id UUID REFERENCES auth.users(id),         -- Supabase Auth user; nullable = team-shared
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('issues', 'kanban', 'inbox')),
  filter_spec JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-portfolio-company integration secrets (Formbricks HMAC, future webhook secrets, etc.)
CREATE TABLE forge.secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  key TEXT NOT NULL,                        -- 'formbricks_hmac' | future integrations
  value_encrypted TEXT NOT NULL,            -- pgsodium-encrypted; service role only
  created_at TIMESTAMPTZ DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  UNIQUE (company_id, key)
);
```

### Schema deltas

```sql
-- Custom fields on issues (PM layer)
ALTER TABLE forge.issues ADD COLUMN custom_fields JSONB DEFAULT '{}'::jsonb;

-- Approval payload (agent shell)
ALTER TABLE forge.issues ADD COLUMN approval_payload JSONB;
```

### Existing tables (no change)

`forge.companies`, `forge.projects`, `forge.agents`, `forge.issues`, `forge.issue_comments`, `forge.issue_events`, `forge.runs`, `forge.run_events`, `forge.approvals`, `forge.goals`, `forge.knowledge`, etc.

---

## 8. Auth & hosting

**Phase 1 (this PRD):**
- MCMForge: Vercel (existing). Auth: Supabase Auth (existing). CRM lives here too.
- Formbricks: self-host on Mac Mini OR Formbricks Cloud Free. Decided in WO-3 based on self-host noise.
- Mini orchestrator: existing PM2 (no change).

**Phase 2 (out of scope, future ticket):**
- Per-portfolio-company tenant isolation via real RBAC (separate WO).
- Granular per-user permissions on CRM tables (currently permissive `authenticated_all`).

---

## 9. Agent integration model

### Reactive (event → agent)

| Trigger | Source | Path |
|---|---|---|
| Form submitted | Formbricks | webhook → `/api/webhooks/formbricks` → `forge.form_submissions` insert → CRM upsert via `lib/crm/client.ts` → `forge.issues` insert (status=`drafting`, `contact_id` set) → existing routine picks up |
| Issue status → `awaiting_approval` | MCMForge internal | Postgres trigger → Supabase realtime → MCMForge Inbox auto-refresh |
| Contact updated | MCMForge internal | Postgres trigger on `forge.crm_contacts` → optionally create issue per rule (e.g., status flip to `qualified` triggers follow-up) |

### Imperative (agent → system)

| Action | Target | Path |
|---|---|---|
| Read CRM history for contact | `forge.crm_activity_timeline` view | `lib/crm/client.ts` → `listActivitiesForContact(contactId)` (single SQL via service role) |
| Create CRM contact + account | `forge.crm_contacts` + `forge.crm_accounts` | `lib/crm/client.ts` → `findOrCreateAccount`, `createContact` |
| Save draft to Drive | Drive (Workspace MCP) | existing path |
| Send approved email | Gmail (Workspace MCP) | existing path |
| Log CRM activity | `forge.crm_activities` | `lib/crm/client.ts` → `logActivity` |

### Auth

- Formbricks webhook → HMAC secret per environment, stored in `forge.secrets`.
- MCMForge server actions pull keys at runtime via Supabase service role from `forge.secrets`. Never exposed to the browser bundle.
- CRM access uses the existing dashboard auth (Supabase Auth) — RLS handles tenant scoping; no per-portfolio API keys needed since CRM is internal.

---

## 10. Approvals UX

**Pam's daily flow:**

1. Opens `mcmforge.com` (Mission Control) — sees Inbox at top with pending approvals.
2. Clicks an approval card. Card shows:
   - Source form data (collapsed, expandable).
   - Agent draft (full text, editable inline).
   - Link to Drive doc (canonical version).
   - "From CRM:" — contact's prior activity (last 3 from `forge.crm_activity_timeline`, linked to `/crm/contacts/[id]`).
   - Buttons: **Approve & Send · Edit Draft · Reject · Send Back to Agent (with note)**.
3. On **Approve & Send**: email goes out, `forge.issues` closes, `forge.crm_activities` row inserted (kind `email_sent`). Toast: "Sent to {recipient}."
4. On **Edit Draft**: inline editor. Save → redraft is sent on Approve.
5. On **Reject**: `forge.issues` status → `rejected`. Reason logged. No email sent.
6. On **Send Back**: `forge.issues` status → `drafting`. Note appended to comments. Agent re-runs.

No new pages — extends existing `/inbox` and `/approvals`.

---

## 11. Phasing — work order decomposition

Marketing-OS ships in 7 work orders. Each WO is self-contained (a fresh Claude session can pick it up cold from `docs/superpowers/work-orders/`). Each WO opens with `/superpowers:brainstorming` to interview Steve, produce a sub-PRD, then `/superpowers:writing-plans` for the implementation plan, then build.

| WO | Title | Effort | Depends on |
|---|---|---|---|
| **WO-1** | ✅ **Shipped 2026-05-07.** Pre-flight cleanup (RLS on 10 tables · `run_events.seq` INT4→BIGINT fix · Telegram webhook activation) | 1 day | none |
| **WO-2** | MCMForge CRM v1 (`forge.crm_*` schema · contacts/accounts/activities pages · agent's-eye preview · cross-portfolio search · `lib/crm/client.ts`) | 10 days | WO-1 |
| **WO-3** | Formbricks self-host or cloud + Links Choice supplier intake form + JS embed | 2 days | WO-1 |
| **WO-4** | MCMForge integration layer (Formbricks webhook receiver · `forge.form_submissions` · approval_payload schema · agent runtime wiring to CRM client) | 2 days | WO-2, WO-3 |
| **WO-5** | PM/Tasks UI extensions (Kanban · saved views · custom fields on issues · bulk ops · "my work" · activity feed polish · responsive mobile · ClickUp CSV importer) | 6 days | WO-1 |
| **WO-6** | Day-1 end-to-end (Links Choice supplier form → forge.crm_* upsert → forge.issues → agent draft → MCMForge Inbox → Pam approve → Gmail send + activity logged) | 3 days | WO-4, WO-5 |
| **WO-7** | Optional polish (Cycles · ClickUp CSV migration · GBN/HGB/MCM Forge supplier-intake forms · CRM bulk import) | 3 days | WO-6 |

**Total: ~26 working days ≈ 5 weeks** with focused agent-driven build. (Was 21 days with Twenty; CRM-in-MCMForge adds 7 days to WO-2 but removes 1 day from WO-4 and the runtime cost of Twenty self-host operations.)

---

## 12. Out of scope (explicit)

- **NetSuite replacement.** Phase 2 ERP project, separate PRD.
- **ShipStation replacement.** Phase 2 fulfillment integration; read-only customer order context only when added.
- **Native iOS/Android apps.** Responsive web only in Phase 1.
- **Time tracking.** Not on team's actual workflow.
- **Custom roles / RBAC beyond `admin/member`.** Not needed for 2-4 person team.
- **Audit logs at PM layer.** `forge.issue_events` is sufficient.
- **AI charts / dashboards.** Out of M0; possible later.
- **Multi-language.** English only.
- **Notion-style inline editing on CRM views.** Form-based modals only in v1.
- **Custom-field UI builder.** TypeScript-config only in v1.
- **Telegram intake** (FORGE-365 schema migration handles this separately as a discrete WO post-Marketing-OS).

---

## 13. Acceptance criteria (Marketing-OS as a whole)

The system is "shipped" when:

1. Pam can submit a Links Choice supplier-intake form on `linkschoice.com`.
2. Within 60 seconds: a `forge.crm_contacts` row exists in the Links Choice workspace, attached to a `forge.crm_accounts` row keyed by email domain, with an initial `forge.crm_activities` entry.
3. Within 60 seconds: a `forge.issues` row exists with status `awaiting_approval`, `contact_id` set, and an agent-drafted reply in `approval_payload`.
4. Pam sees the approval card in MCMForge Inbox at `/`, with a link to the contact at `/crm/contacts/[id]`.
5. Pam clicks Approve. Email is sent via Gmail to the supplier within 5 seconds.
6. A `forge.crm_activities` row of kind `email_sent` is inserted, linked to the contact + issue.
7. `forge.issues` row closes. Mission Control reflects the close in the standup card the next morning.

If any of these 7 fail, ship is incomplete.

---

## 14. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CRM polish gap (no inline editing, no kanban, no UI field-builder) frustrates daily users | Medium | Medium | Ship v1, gather feedback, prioritize follow-on UX work in WO-5. The differentiated features (single source of truth, agent-native timeline, cross-portfolio search, in-place approvals) carry the weight while polish lags. |
| Cross-portfolio search slows past ~200ms once contacts cross 10k | Low | Low | Add `pg_trgm` GIN indexes on email/name/domain when threshold hit. |
| Agent-draft preview burns tokens on idle clicks | Medium | Low | Rate-limit per contact (1 call per 30s); cache last result for 5 min. |
| Activity-timeline view performance at scale | Low | Medium | Indexed `contact_id` on issues; cap UI to last 100 events; revisit with materialized view if reads slow. |
| Formbricks JS embed breaks on `linkschoice.com` (theme conflicts) | Low | Medium | Iframe fallback documented in WO-3. |
| RLS regression breaks dashboard reads after CRM ships | Low | High | WO-1 smoke-test pattern (route-by-route on Vercel preview); rollback is per-policy `DROP POLICY`. |
| Webhook delivery loses events under load | Low | High | Idempotency on `forge.form_submissions.external_id` UNIQUE; redelivery via Formbricks admin UI. |
| Agent drafts hallucinate pricing for Links Choice | Medium | High | `forge.knowledge` has source-of-truth pricing; agent must cite knowledge entry; if no entry, refuses to quote. |
| Pam's approval volume exceeds capacity | Low | Medium | Surface velocity in Mission Control; if backlog grows, add second human approver. |
| Scope creep into NetSuite/ShipStation Phase 2 | High | Medium | Out-of-scope list is canonical; ticket new asks separately. |

---

## 15. Glossary

- **Marketing-OS** — this system.
- **Portfolio company** — one of Steve's 5 businesses (Links Choice, GBN, HGB, MCM Forge, DirtSync).
- **CRM (in MCMForge)** — `forge.crm_accounts`, `forge.crm_contacts`, `forge.crm_activities` and the views/pages built on them. See `docs/superpowers/specs/2026-05-07-mcmforge-crm-design.md`.
- **Inbox** — MCMForge's `/inbox` page where pending approvals surface.
- **Approval card** — UI element in Inbox showing form data + agent draft + buttons.
- **Mission Control** — MCMForge home page (`/`) — daily standup + Inbox + Live Agents + Gate-A.
- **Agent draft** — agent-generated reply or content awaiting human approval.
- **Approval payload** — JSONB on `forge.issues` containing draft + source data + Drive link.
- **WO** — work order. Self-contained spec a fresh Claude session can pick up.

---

## 16. Next step

After Steve approves this design:

1. Generate WO docs in `docs/superpowers/work-orders/wo-{1..7}-*.md` — each self-contained.
2. Steve picks WO-1, opens fresh session, pastes WO-1 doc, invokes `/superpowers:brainstorming`.
3. That session produces sub-PRD → implementation plan → build.
4. PR → review → merge. Repeat for WO-2 through WO-7.

End of design.
