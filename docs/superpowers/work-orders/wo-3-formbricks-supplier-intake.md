# WO-3 — Formbricks + Links Choice supplier intake form

**Parent PRD:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) §6.3
**Status:** ⏸️ **PAUSED 2026-05-09** — see [Pause notes](#pause-notes-2026-05-09) below.
**Depends on:** WO-1, plus MCMForge end-to-end robustness (gate added 2026-05-09)
**Estimated effort:** 2 days (original Formbricks plan) → re-estimate when resumed; native build is 3-4 days
**Branch:** `feature/wo-3-formbricks` (original) · `feature/wo-3-formbricks-stub` closed via PR #108

---

## Pause notes (2026-05-09)

**Decision:** Defer WO-3 until MCMForge can robustly receive, persist, and react to form submissions end-to-end.

**Why paused:**
- A form that delivers submissions to a CRM/agent loop that isn't proven creates a backlog of dropped intake. Wrong order.
- Robustness in WO-2 (CRM v1, shipped) and WO-4 (agent integration) needs to be validated under real workload first.

**Architecture decision (locked when resumed):**
- **Drop Formbricks.** No third-party SaaS for form hosting.
- **Native build:** React form hosted on `forms.linkschoice.com` (Vercel subdomain) — `linkschoice.com` storefront is Shopify, can't embed JS cleanly.
- **Form code lives in MCMForge dashboard repo.** Single deploy. Form posts same-origin to a Vercel API route in `dashboard/src/app/api/forms/...` — no HMAC needed since it's our origin.
- **Photos → Supabase Storage** (presigned upload URLs).
- **Spam protection:** TBD when resumed (Steve to pick — Cloudflare Turnstile, hCaptcha, or honeypot-only).
- **Metadata → `forge.form_submissions`** (table created in WO-4).

**Closed PR:** [#108](https://github.com/golfballnut/mcmforge/pull/108) — Formbricks stub receiver. Closed 2026-05-09. Spec + plan docs on the branch (`feature/wo-3-formbricks-stub`) preserved as historical record of the Formbricks path.

**Cleanup done 2026-05-09:**
- HMAC secret deleted from `/tmp/wo3-formbricks-hmac.secret`.
- `FORMBRICKS_HMAC_SECRET` removed from `dashboard/.env.local`.
- No code merged to `main` from the WO-3 effort.

**Resume gate:** WO-3 v2 spec written + dispatched only after Steve confirms MCMForge handles WO-2 + WO-4 production load reliably.

---

---

## Goal

Stand up Formbricks (self-host on Mini OR Cloud Free), build the Links Choice supplier-intake form, and embed it as a JS snippet on `linkschoice.com`. Submissions fire an HMAC-signed webhook to MCMForge — endpoint is stubbed in WO-4, so for now the webhook just receives and 200s.

## Why this WO exists

Formbricks is the intake layer. Until it exists, the agent loop has no public-facing entry point. This WO proves the embed flow on a real production site (linkschoice.com) and validates the webhook signature contract MCMForge will rely on.

## Definition of done

- [ ] Formbricks instance live (self-host on Mini or Cloud Free — see decision criteria below).
- [ ] Links Choice supplier-intake form created with fields: name, email, phone, ball brand, estimated quantity, photos (≤3, max 10MB each), notes.
- [ ] Form embedded on `linkschoice.com/sell-us-balls` (or equivalent) via JS snippet — *not* iframe.
- [ ] Test submission in Chrome + mobile Safari renders correctly.
- [ ] Webhook subscription on form submission → `https://mcmforge.com/api/webhooks/formbricks?company=links-choice`, HMAC-SHA256 signed.
- [ ] HMAC secret stored in `forge.secrets` (table created in WO-4 — staged in `.env` for now).
- [ ] Submissions visible in Formbricks admin UI.
- [ ] Webhook delivery verified end-to-end: submit form → 2xx response from MCMForge stub within 3 seconds.
- [ ] PR merged.

## Decision: self-host vs Cloud Free

Default: **self-host on Mini**. Fall back to Cloud Free *only if*:
- Mini RAM exceeds 80% during WO-2 + WO-3 setup, OR
- Formbricks crashes ≥2 times in initial 48-hour soak, OR
- HTTPS termination becomes a maintenance fire.

Decision recorded in this WO's PR description before merge.

## In scope

- Formbricks Docker stack (or Cloud Free signup).
- Form definition: 7 fields with validation (email format, phone optional, photo size limit).
- JS embed snippet on linkschoice.com (assumes static site or CMS supports script tag injection — verify in brainstorm).
- Webhook config + HMAC secret rotation procedure documented.
- Brand styling (Links Choice colors, fonts) — minimal, not pixel-perfect.

## Out of scope

- Forms for the other 4 portfolio cos (WO-7 if/when needed).
- Multi-step branching forms.
- Custom analytics dashboards (Formbricks gives basic; defer custom).
- Form A/B testing.
- Conditional logic on fields (out of M0).

## Files likely touched

- `forge-orchestrator/formbricks/docker-compose.yml` (new — if self-host)
- `forge-orchestrator/formbricks/.env.production` (new, gitignored — if self-host)
- `~/Library/LaunchAgents/com.mcmforge.formbricks.plist` (new — if self-host)
- `linkschoice.com` repo (separate codebase — if not in this monorepo, file PR there).
- `dashboard/src/app/api/webhooks/formbricks/route.ts` (stub: 200 + log payload — full implementation in WO-4).
- `dashboard/.env.local` and Vercel env: `FORMBRICKS_HMAC_SECRET` (until `forge.secrets` is populated in WO-4).

## Suggested approach

1. Branch `feature/wo-3-formbricks`.
2. WebFetch [Formbricks self-host docs](https://formbricks.com/docs/self-hosting/setup) and [embed docs](https://formbricks.com/docs/developer-docs/website-and-app-surveys).
3. Decide self-host vs Cloud during brainstorm — record decision.
4. Build form in Formbricks admin UI (faster than declarative).
5. Test embed locally first against a sample HTML page; only deploy to linkschoice.com after embed renders correctly.
6. HMAC: generate 32-byte secret, store in `forge.secrets` after WO-4, keep in `.env` for now.
7. Stub webhook endpoint in MCMForge: log payload, return 200. Don't process.
8. End-to-end test: submit form → see 200 in Vercel logs.

## Test plan

- Form renders inline (not iframe) on linkschoice.com.
- Mobile Safari + iOS keyboard work correctly on phone-input field.
- Photo upload up to 10MB succeeds.
- Submission lands in Formbricks admin.
- Webhook fires with HMAC header verifiable via test script.
- MCMForge stub returns 200 within 3 seconds.

## How to run this WO (fresh session bootstrap)

1. Open new Claude Code session.
2. Paste this WO doc.
3. `/superpowers:brainstorming` — likely covers: self-host vs Cloud decision, form field details, embed location on linkschoice.com.
4. `/superpowers:writing-plans` for implementation plan.
5. Execute. Coordinate linkschoice.com edit with Steve if it's a separate repo.
6. PR + verify.
