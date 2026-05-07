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

Four components. Each owns one thing. None overlap.

| Component | Choice | What it owns | Hosting |
|---|---|---|---|
| **CRM** | Twenty (twentyhq/twenty) | Customers / suppliers / contacts / deals / activities. The truth. | Self-host Docker on Mac Mini (Phase 1); evaluate Cloud later. |
| **PM / Tasks** | **Build into MCMForge** | Issues, kanban, custom fields, saved views, "my work", bulk ops. The work-in-flight state. | Vercel (existing). |
| **Forms** | Formbricks (formbricks/formbricks) | Public intake forms on portfolio company sites. Submission webhooks. | Self-host Docker on Mac Mini. |
| **Agent shell + approvals** | MCMForge (existing) | Mission Control, Inbox, /approvals, agent runs, Drive integration, Gmail send. | Vercel (existing). |

**Why build the PM layer instead of using Plane:** MCMForge already has `forge.issues` (483 rows), `forge.issue_comments` (1,937 rows), `forge.issue_events`, `/issues` page, and multi-tenancy by `company_id`. The gap to a Plane-equivalent for *this team's* needs is ~20 working days. Plane's surplus features (time tracking, custom roles, audit logs, AI charts, native mobile) are not on the team's actual usage path.

**Why Twenty (not NocoBase):** DB-enforced workspace isolation maps cleanly to 5 portfolio companies with no leakage even with leaked API keys. Modern Notion-like UI the team will adopt. AGPL is fine for internal use. NocoBase's free tier lacks DB-RLS and paywalls inbound webhooks.

**Why Formbricks (not building):** Form-builder UIs (drag-drop, embed SDK, validation logic) are 3+ weeks of dead-weight work. Formbricks does it free with a clean JS embed.

---

## 3. Architecture & Data Flow

### Component map (day-1 loop, Links Choice supplier intake)

```
┌────────────┐    webhook    ┌──────────┐    REST     ┌─────────┐
│ Formbricks │ ─────────────►│   Forge  │ ──────────► │  Twenty │
│  (intake)  │               │ (router) │             │  (CRM)  │
└────────────┘               └────┬─────┘             └─────────┘
                                  │
                           creates │
                                  ▼
                            ┌─────────────┐
                            │ forge.issues│ ◄── agent reads + drafts
                            │   (task)    │     (knowledge + CRM history)
                            └──────┬──────┘
                                   │
                          shows in │
                                   ▼
                          ┌─────────────────┐
                          │ MCMForge Inbox  │
                          │ (Pam approves)  │
                          └────────┬────────┘
                                   │ on approve
                                   ▼
                          ┌──────────────────────────┐
                          │ Gmail send + log to      │
                          │ Twenty activity + close  │
                          │ task in forge.issues     │
                          └──────────────────────────┘
```

### Data ownership principles

- **Twenty** owns customer/supplier records. The truth.
- **MCMForge `forge.issues`** owns work-in-flight state (tasks, kanban, status, assignee).
- **Formbricks** owns intake form definitions and raw submissions.
- **MCMForge** owns agents, approvals, and the team's daily view (Inbox + Mission Control).

### Integration principles

- **Webhooks IN** from Twenty, Formbricks, Plane-equiv (i.e., MCMForge itself) → routed through `/api/webhooks/{source}` on MCMForge.
- **REST OUT** from MCMForge agents to Twenty + Formbricks for writes.
- **Postgres triggers + Supabase realtime** for events internal to `forge.*` schema (zero-latency agent reactions to MCMForge-local state changes).
- **Drive + Gmail** via existing Workspace MCP server.
- **NetSuite + ShipStation** = read-only future integrations (Phase 2 — out of scope here).

---

## 4. Per-portfolio-company isolation

Each of the 5 portfolio companies (Links Choice, GBN, HGB, MCM Forge, DirtSync) gets:

- **Its own Twenty workspace** — DB-enforced isolation. Single user, 5 workspaces, switcher in UI. One agent API key per workspace — no cross-leakage.
- **Its own Formbricks environment** — separate forms, separate webhook secrets.
- **Its own `forge.companies` row** — already exists. All `forge.issues`, `forge.issue_comments`, etc. carry `company_id` for tenant isolation.
- **Shared MCMForge dashboard** — single instance, multi-tenant via `company_id`. Agents see all companies; the team filters per-co via the existing Mission Control.

**Phase 1** ships isolation for **Links Choice only**. Workspaces for the other 4 are stubbed but not populated until each company's Phase 2 onboarding.

---

## 5. Day-1 end-to-end workflow

**Scenario:** A potential supplier visits `linkschoice.com`, fills out the "Sell us your used balls" form.

### Sequence

1. **Form submission** — Formbricks captures: name, email, phone, ball brand, estimated quantity, photos (up to 3), notes.
2. **Webhook fires** to `https://mcmforge.com/api/webhooks/formbricks?company=links-choice`. HMAC-signed.
3. **Forge router** (`/api/webhooks/formbricks`) verifies HMAC, looks up portfolio co by URL param, persists to `forge.form_submissions` (new table — see §7 schema), and:
   - Calls Twenty REST: create-or-update Contact in Links Choice workspace (match by email).
   - Calls Twenty REST: create Opportunity in supplier-pipeline stage `incoming`.
   - Inserts `forge.issues` row in `links-choice / supplier-intake` board, status `drafting`, assigned to the Links Choice supplier-intake agent.
4. **Agent picks up** the new issue (existing routine pattern). Reads `forge.knowledge` for current LC supplier pricing rules + reads Twenty activity history for this email (if returning supplier). Drafts a reply (price quote + photo-confirmation request + next steps). Saves draft to Drive (existing Workspace MCP).
5. **Agent updates** the issue: status → `awaiting_approval`. Inserts `forge.issue_events` for activity feed. Sets `approval_payload` JSONB containing draft body + Drive doc URL + form data summary.
6. **MCMForge Inbox** auto-surfaces the issue to Pam (existing Inbox card system). Card shows: source form data, draft preview, Drive doc link, "Approve / Reject / Edit" actions.
7. **Pam clicks Approve.** MCMForge:
   - Calls Gmail send (Workspace MCP).
   - Calls Twenty REST: log activity (type `email`, body summary, link to Drive doc) on the Contact + Opportunity.
   - Updates `forge.issues` status → `closed`. Adds `forge.issue_events` for the close.
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

### 6.2 CRM (Twenty)

**In scope:**
- Self-host Twenty Docker stack on Mac Mini.
- Provision 5 workspaces (Links Choice live; other 4 stubbed).
- Standard objects: Companies, Contacts, Deals, Activities. Custom fields per portfolio co as needed (added later).
- API keys per workspace.
- Webhook subscriptions: `contact.created`, `contact.updated`, `opportunity.stage.changed`, `activity.created` → `mcmforge.com/api/webhooks/twenty`.
- HTTPS via Tailscale + Caddy or Cloudflare Tunnel (existing pattern).

**Out of scope:**
- Twenty Cloud migration (Phase 2 if self-host gets noisy).
- Custom Twenty plugins (none needed).
- Email/calendar sync (Phase 2 — Gmail integration via MCMForge for now).

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
- Webhook receivers: `/api/webhooks/formbricks`, `/api/webhooks/twenty`.
- REST clients: `dashboard/src/lib/integrations/twenty.ts` and `dashboard/src/lib/integrations/formbricks.ts` (typed).
- New tables: `forge.form_submissions`, `forge.crm_links` (maps `forge.issues.id` ↔ Twenty contact/deal IDs).
- Inbox card schema extension: `approval_payload` JSONB + render rules for draft + Drive link.
- Outbound Gmail-send action wired to approval flow (uses existing Workspace MCP).
- Activity logger: on approve, write to Twenty Activities + close `forge.issues`.

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

-- Bridge: forge.issues ↔ Twenty objects
CREATE TABLE forge.crm_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  issue_id UUID NOT NULL REFERENCES forge.issues(id),
  twenty_workspace_slug TEXT NOT NULL,      -- 'links-choice'
  twenty_object_type TEXT NOT NULL,         -- 'contact' | 'opportunity' | 'company'
  twenty_object_id TEXT NOT NULL,           -- Twenty record id
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (issue_id, twenty_object_type, twenty_object_id)
);

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

-- Per-portfolio-company integration secrets (Twenty API keys, Formbricks HMAC, etc.)
CREATE TABLE forge.secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES forge.companies(id),
  key TEXT NOT NULL,                        -- 'twenty_api_key' | 'formbricks_hmac' | ...
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
- MCMForge: Vercel (existing). Auth: Supabase Auth (existing).
- Twenty: self-host on Mac Mini. Per-workspace API key, scoped to workspace. No SSO with MCMForge in Phase 1.
- Formbricks: self-host on Mac Mini OR Formbricks Cloud Free. Decided in WO-3 based on self-host noise.
- Mini orchestrator: existing PM2 (no change).

**Phase 2 (out of scope, future ticket):**
- SSO across all 4 — likely OIDC via Supabase Auth as IdP. Twenty needs Pro tier or community-OIDC plugin.
- Custom domain mapping for Twenty (`crm.mcmforge.com`).

---

## 9. Agent integration model

### Reactive (event → agent)

| Trigger | Source | Path |
|---|---|---|
| Form submitted | Formbricks | webhook → `/api/webhooks/formbricks` → `forge.form_submissions` insert → `forge.issues` insert (status=`drafting`) → existing routine picks up |
| CRM record changed | Twenty | webhook → `/api/webhooks/twenty` → log to `forge.issue_events` if linked, optionally create issue if rule matches |
| Issue status → `awaiting_approval` | MCMForge internal | Postgres trigger → Supabase realtime → MCMForge Inbox auto-refresh |

### Imperative (agent → system)

| Action | Target | Path |
|---|---|---|
| Read CRM history for contact | Twenty | `lib/twenty.ts` → REST `/rest/contacts/{id}/activities` |
| Create CRM contact + opportunity | Twenty | `lib/twenty.ts` → REST `POST /rest/contacts`, `POST /rest/opportunities` |
| Save draft to Drive | Drive (Workspace MCP) | existing path |
| Send approved email | Gmail (Workspace MCP) | existing path |
| Log activity in Twenty | Twenty | `lib/twenty.ts` → REST `POST /rest/activities` |

### Auth

- Each portfolio company → its own Twenty API key, stored in `forge.secrets` (pgsodium-encrypted, service role read only).
- Formbricks webhook → HMAC secret per environment, stored in `forge.secrets`.
- MCMForge server actions pull keys at runtime via Supabase service role from `forge.secrets`. Never exposed to the browser bundle.

---

## 10. Approvals UX

**Pam's daily flow:**

1. Opens `mcmforge.com` (Mission Control) — sees Inbox at top with pending approvals.
2. Clicks an approval card. Card shows:
   - Source form data (collapsed, expandable).
   - Agent draft (full text, editable inline).
   - Link to Drive doc (canonical version).
   - "From Twenty:" — contact's prior activity (last 3, linked).
   - Buttons: **Approve & Send · Edit Draft · Reject · Send Back to Agent (with note)**.
3. On **Approve & Send**: email goes out, `forge.issues` closes, Twenty Activity logged. Toast: "Sent to {recipient}."
4. On **Edit Draft**: inline editor. Save → redraft is sent on Approve.
5. On **Reject**: `forge.issues` status → `rejected`. Reason logged. No email sent.
6. On **Send Back**: `forge.issues` status → `drafting`. Note appended to comments. Agent re-runs.

No new pages — extends existing `/inbox` and `/approvals`.

---

## 11. Phasing — work order decomposition

Marketing-OS ships in 7 work orders. Each WO is self-contained (a fresh Claude session can pick it up cold from `docs/superpowers/work-orders/`). Each WO opens with `/superpowers:brainstorming` to interview Steve, produce a sub-PRD, then `/superpowers:writing-plans` for the implementation plan, then build.

| WO | Title | Effort | Depends on |
|---|---|---|---|
| **WO-1** | Pre-flight cleanup (RLS on 10 tables · `run_events.seq` INT4 fix · FORGE-364 Telegram secrets) | 1 day | none |
| **WO-2** | Twenty self-host on Mac Mini + 5 workspaces stubbed + Links Choice live | 3 days | WO-1 |
| **WO-3** | Formbricks self-host or cloud + Links Choice supplier intake form + JS embed | 2 days | WO-1 |
| **WO-4** | MCMForge integration layer (webhook receivers · REST clients · `forge.form_submissions` + `forge.crm_links` + JSONB columns · approval_payload schema) | 3 days | WO-2, WO-3 |
| **WO-5** | PM/Tasks UI extensions (Kanban · saved views · custom fields · bulk ops · "my work" · activity feed polish · responsive mobile · CSV importer) | 6 days | WO-1 |
| **WO-6** | Day-1 end-to-end (Links Choice supplier form → Twenty → forge.issues → agent draft → MCMForge Inbox → Pam approve → Gmail send + Twenty Activity log) | 3 days | WO-4, WO-5 |
| **WO-7** | Optional polish (Cycles · ClickUp CSV migration · GBN/HGB/MCM Forge supplier-intake forms) | 3 days | WO-6 |

**Total: ~21 working days = 4-5 weeks** with focused agent-driven build.

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
- **Twenty SSO with MCMForge.** Phase 2.
- **Telegram intake** (FORGE-365 schema migration handles this separately as a discrete WO post-Marketing-OS).

---

## 13. Acceptance criteria (Marketing-OS as a whole)

The system is "shipped" when:

1. Pam can submit a Links Choice supplier-intake form on `linkschoice.com`.
2. Within 60 seconds: a Twenty contact + opportunity exist in the Links Choice workspace.
3. Within 60 seconds: a `forge.issues` row exists with status `awaiting_approval` and an agent-drafted reply in `approval_payload`.
4. Pam sees the approval card in MCMForge Inbox at `/`.
5. Pam clicks Approve. Email is sent via Gmail to the supplier within 5 seconds.
6. Twenty Activity is logged on the contact + opportunity.
7. `forge.issues` row closes. Mission Control reflects the close in the standup card the next morning.

If any of these 7 fail, ship is incomplete.

---

## 14. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Twenty self-host on Mini gets noisy (crashes, upgrade pain) | Medium | High | Fall back to Twenty Cloud Free; host CRM API on Vercel proxy. |
| Formbricks JS embed breaks on `linkschoice.com` (theme conflicts) | Low | Medium | Iframe fallback documented in WO-3. |
| Twenty API rate limits hit during agent fleet ramp | Low | Medium | Per-workspace key + local response cache in MCMForge. |
| `forge.run_events.seq` INT4 overflow before WO-1 ships | Medium | High | WO-1 ships first. |
| Webhook delivery loses events under load | Low | High | Idempotency on `forge.form_submissions.external_id` UNIQUE; redelivery via Formbricks/Twenty admin UIs. |
| Agent drafts hallucinate pricing for Links Choice | Medium | High | `forge.knowledge` has source-of-truth pricing; agent must cite knowledge entry; if no entry, refuses to quote. |
| Pam's approval volume exceeds capacity | Low | Medium | Surface velocity in Mission Control; if backlog grows, add second human approver. |
| Scope creep into NetSuite/ShipStation Phase 2 | High | Medium | Out-of-scope list is canonical; ticket new asks separately. |

---

## 15. Glossary

- **Marketing-OS** — this system.
- **Portfolio company** — one of Steve's 5 businesses (Links Choice, GBN, HGB, MCM Forge, DirtSync).
- **Workspace** — Twenty's tenant unit. One per portfolio company.
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
