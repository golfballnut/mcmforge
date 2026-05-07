# WO-2 — Twenty self-host on Mac Mini + 5 workspaces

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §6.2
**Status:** Ready to dispatch
**Depends on:** WO-1
**Estimated effort:** 3 days
**Branch:** `feature/wo-2-twenty-selfhost`

---

## Goal

Stand up a self-hosted Twenty CRM instance on the Mac Mini, accessible at `https://crm.mcmforge.com` (or Tailscale-internal URL for Phase 1). Provision 5 workspaces — one per portfolio company. Make Links Choice live with seed data; stub the other 4. Generate per-workspace API keys and store them in `forge.secrets` (created in WO-4 — staged here, populated in WO-4).

## Why this WO exists

Twenty is the system-of-record for customer/supplier data across all portfolio companies. Until it exists, no agent can read or write CRM data. This WO makes it real and proves the multi-workspace isolation model before WO-4 wires integrations.

## Pre-decisions (locked in 2026-05-07, post-WO-1)

These collapsed open questions before brainstorming. Do not re-debate.

- **Public URL:** `crm.mcmforge.com` subdomain (one DNS record on existing zone). NOT a Vercel rewrite under `mcmforge.com/crm/*` — Vercel can't reach the Mini's Tailnet IP and proxying Twenty's websockets/cookies/GraphQL through Vercel rewrites breaks subtly.
- **Tunnel:** Cloudflare Tunnel (resolves the "Tailscale+Caddy OR Cloudflare Tunnel" toss-up below). Public-reachable, free tier handles our load, no inbound port on the Mini, terminates TLS upstream.
- **Pam's auth (Links Choice operator):** workspace-scoped Twenty Member account with her own Twenty password. Twenty Community Edition has no SSO — that's a Pro feature and the WO already lists SSO as out of scope. She gets Member (not Admin) on the Links Choice workspace only; she literally cannot see other portfolio cos. When SSO lands in Phase 2, her account flips to OIDC without changing her workflow.

## Definition of done

- [ ] Twenty Docker stack running on Mac Mini (PM2 or launchd-managed).
- [ ] 5 workspaces created: `links-choice`, `gbn`, `hgb`, `mcm-forge`, `dirtsync`.
- [ ] Steve can sign in to each workspace (single email, workspace switcher).
- [ ] Pam invited to Links Choice workspace as Member (own Twenty password); cannot see other workspaces.
- [ ] Links Choice workspace seeded with: 5 supplier contacts, 5 customer contacts, 3 deals, sample activities (manual or imported from existing data).
- [ ] Per-workspace API keys generated; values pasted into Supabase Vault or local `.env` for staging.
- [ ] Webhook subscriptions configured: `contact.created`, `contact.updated`, `opportunity.stage.changed`, `activity.created` → `https://mcmforge.com/api/webhooks/twenty?workspace=<slug>` (endpoint is stubbed in WO-4 — for now subscription points at a placeholder that returns 200).
- [ ] HTTPS access at `crm.mcmforge.com` via Cloudflare Tunnel (decision locked in pre-decisions section above).
- [ ] Health check: `GET /healthz` returns 200 from Mac Mini and from Vercel preview.
- [ ] PR merged.

## In scope

- Twenty Community Edition (AGPL) Docker Compose stack: app, Postgres, Redis, BullMQ.
- Reverse proxy + TLS termination.
- Workspace creation + custom fields (per-co as needed) — start with stock objects.
- API key generation + safe storage.
- Webhook subscription registration (delivery target stub OK for now).
- Backup script (pg_dump nightly to Drive folder).

## Out of scope

- SSO/OIDC integration with Supabase Auth (Phase 2 — Twenty Pro+).
- Custom Twenty plugins.
- Email/calendar sync.
- Migration of ClickUp data into Twenty (data goes via WO-3 forms going forward; backfill is its own ticket).
- Twenty Cloud migration (only if self-host fails per PRD §14 risk row).

## Files likely touched

- `forge-orchestrator/twenty/docker-compose.yml` (new)
- `forge-orchestrator/twenty/.env.production` (new, gitignored)
- `forge-orchestrator/twenty/Caddyfile` or Cloudflare tunnel config (new)
- `forge-orchestrator/scripts/twenty-backup.sh` (new)
- `~/Library/LaunchAgents/com.mcmforge.twenty.plist` (new — keeps Twenty alive)
- `dashboard/.env.local` and Vercel env: add `TWENTY_BASE_URL`, `TWENTY_WORKSPACE_KEYS_JSON` (encrypted; loaded via `forge.secrets` after WO-4 — for WO-2 these are direct env vars).

## Suggested approach

1. Branch `feature/wo-2-twenty-selfhost`.
2. Read [Twenty self-host docs](https://docs.twenty.com/developers/self-hosting/docker-compose). **WebFetch first — don't trust training data.**
3. Stand up locally on a dev branch first; only push to Mini after verifying.
4. Mini deploy: PM2 wrapper or launchd plist (match existing `forge-orchestrator` pattern).
5. Workspace creation scripted via Twenty's API after first admin user is created.
6. Register webhook subscriptions via Twenty's Settings → API & Webhooks UI initially; consider scripting later.
7. Verify: `curl https://crm.mcmforge.com/healthz` from outside Tailscale (via Cloudflare tunnel) returns 200.
8. PR includes: docker-compose, Caddyfile/tunnel config, backup script, README in `forge-orchestrator/twenty/` documenting recovery.

## Test plan

- Health check returns 200 from Vercel preview.
- Workspace switcher shows 5 workspaces.
- Pam can log in to Links Choice workspace and see seeded data.
- API key auth works: `curl -H "Authorization: Bearer <key>" https://crm.mcmforge.com/rest/contacts` returns JSON list.
- Webhook fires: create a contact in Twenty UI → request lands at the stub endpoint (verified via Vercel logs).
- Backup script writes a pg_dump to Drive within 5 minutes of cron firing.

## How to run this WO (fresh session bootstrap)

1. Open new Claude Code session.
2. Paste this WO doc.
3. `/superpowers:brainstorming` — interview will likely cover: TLS strategy choice (Tailscale+Caddy vs Cloudflare Tunnel), seed data source, custom fields needed for Links Choice.
4. `/superpowers:writing-plans` for implementation plan.
5. Execute. SSH to Mini for the deploy step.
6. PR + verify.
