# WO-3 — Formbricks + Links Choice supplier intake form (design)

**Date:** 2026-05-08
**Author:** Claude (Opus 4.7) + Steve McMillian
**WO:** [`wo-3-formbricks-supplier-intake.md`](../work-orders/wo-3-formbricks-supplier-intake.md)
**Parent PRD:** [`2026-05-07-marketing-os-design.md`](2026-05-07-marketing-os-design.md) §6.3
**Status:** Approved, ready for implementation plan
**Depends on:** WO-1 (shipped 2026-05-07)

---

## 1. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | **Formbricks Cloud Free** | Mac Mini at 94% RAM (15G/16G) at dispatch — already past WO-3's own self-host trigger. Docker not installed. Self-host adds 2–4GB Docker Desktop + 1–2GB Formbricks stack + tunnel maintenance to a Mini that's already strained. Links Choice supplier intake is low-volume (B2B), 200/mo Cloud Free cap is plenty. |
| Embed location | **Dedicated `/sell-us-balls` page**, no homepage CTA | Smaller PR, single embed location, shareable URL for Pam's email signature. Homepage CTA can be added in WO-6 when the loop is live end-to-end. |
| Form schema ownership | **Claude builds it via Formbricks Cloud admin UI during WO-3 session.** Pam onboards in WO-7. | Embed PR cannot be blocked on "waiting for Pam to design fields." Fields are locked in §3 below. |
| WO-3 slice boundary | **Slice A only** (this WO): stub webhook + dark form page. **Slice B** (HMAC verify + dedupe + CRM writes) = WO-4. | Prevents conflating "stub returns 200" with "supplier intake works." |
| Dark page strategy | `<meta name="robots" content="noindex,nofollow"/>`, no nav link, no sitemap entry, no homepage CTA. Reachable only by direct URL. | Page must not accept real traffic until WO-4 ships, or Pam fills the form, sees a confirmation, and submission silently goes to /dev/null. |
| Webhook routing | WO-3 stub captures `?company=links-choice` slug in the log line. Slug→UUID resolution (`66302362-16bf-4009-a1b3-4fe3c2a1943f` for Links Choice) is wired in WO-4 when the receiver actually writes to `forge.crm_*`. | One company in scope; UUID is recorded in `reference_forge_ids.md` so WO-4 doesn't have to look it up. |
| HMAC secret staging | Vercel env + local `.env.local` only. Set but unused in WO-3. `forge.secrets` table arrives in WO-4. | Per WO doc and PRD §9. |

---

## 2. Architecture

```
┌──────────────────────────┐         HMAC-signed POST
│  linkschoice.com         │   ┌────────────────────────┐
│  /sell-us-balls          │   │ Formbricks Cloud Free  │
│  (dark — noindex,        │ ─▶│ - Form definition      │ ─┐
│   no nav link)           │   │ - Submission storage   │  │
│  <FormbricksEmbed/>      │   │ - Webhook config       │  │
└──────────────────────────┘   └────────────────────────┘  │
                                                            │
                                                            ▼
                                          POST /api/webhooks/formbricks
                                          ?company=links-choice
                                          x-formbricks-signature: <hmac>
                                                            │
                                                            ▼
                                  ┌──────────────────────────────────┐
                                  │ MCMForge (Vercel)                │
                                  │ Slice A stub:                    │
                                  │  - log payload (truncated 2KB)   │
                                  │  - return 200                    │
                                  │  - no HMAC verify                │
                                  │  - no DB write                   │
                                  └──────────────────────────────────┘
```

Two repos, two PRs:
- `golfballnut/mcmforge` · branch `feature/wo-3-formbricks-stub` · stub route + middleware bypass.
- `golfballnut/linkschoice-marketing` · branch `feature/sell-us-balls` · new page + Formbricks SDK.

---

## 3. Form schema

Built in Formbricks Cloud admin UI. Survey type: in-app web survey, single-page.

| Field | Type | Required | Validation |
|---|---|---|---|
| Name | Short text | yes | non-empty |
| Email | Email | yes | RFC 5322 |
| Phone | Short text | no | none (free-form) |
| Ball brand | Multi-select | yes | options: `Titleist Pro V1`, `Titleist Pro V1x`, `Callaway Chrome Soft`, `TaylorMade TP5`, `Other` |
| Estimated quantity | Number | yes | integer ≥ 1 |
| Photos | File upload | no | 0–3 files, max 10MB each, accept `image/*` |
| Notes | Long text | no | none |

Form metadata recorded in `reference_forge_ids.md` after creation:
- `formbricks_env_id` (Cloud environment ID)
- `formbricks_survey_id` (Links Choice supplier intake)
- `formbricks_hmac_secret_location` (1Password entry name)

Brand styling: Links Choice palette via Formbricks survey settings (background, primary, font). Minimal, not pixel-perfect.

---

## 4. MCMForge stub route

**Path:** `dashboard/src/app/api/webhooks/formbricks/route.ts` (new)

**Behavior (Slice A):**
- Accept POST.
- Parse `?company=` query param.
- Read raw body (preserve bytes for future HMAC verify in WO-4 — do not parse and re-stringify).
- Read `x-formbricks-signature` header (capture but do not verify).
- Log structured: `{ ts, company, sig, body_bytes, body_preview }`.
- Return `200 ok` within 3 seconds.

**Pseudo-code:**

```ts
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const ts = new Date().toISOString()
  const company = new URL(req.url).searchParams.get('company') ?? null
  const sig = req.headers.get('x-formbricks-signature') ?? null
  const body = await req.text()
  console.log('[formbricks-stub]', JSON.stringify({
    ts,
    company,
    sig,
    body_bytes: body.length,
    body_preview: body.slice(0, 2000),
  }))
  return new Response('ok', { status: 200 })
}
```

**Middleware bypass:** add `/api/webhooks/formbricks` to `PUBLIC_PATHS` in `dashboard/src/middleware.ts`. Per `feedback_webhook_routes_need_middleware_bypass.md`, otherwise auth redirect kills delivery.

---

## 5. linkschoice-marketing page

**Path:** `app/sell-us-balls/page.tsx` (new — Next.js App Router)

**Behavior:**
- Server Component default.
- Renders minimal layout: H1 "Sell us your used golf balls", short paragraph (Pam approves copy in WO-3 session), Formbricks embed mount point below.
- Client Component child `<FormbricksMount/>` runs `formbricks.init({ environmentId, apiHost })` then `formbricks.track('open-supplier-intake')` on mount, OR renders an inline iframe-free embed via the `@formbricks/js` SDK pattern from Formbricks docs.
- Page metadata:
  - `<title>Sell us your used golf balls — Links Choice</title>`
  - `<meta name="robots" content="noindex,nofollow"/>`
- **Not linked from anywhere.** No `app/page.tsx` change. No `sitemap.ts` entry. No nav.

**Env vars (linkschoice-marketing):**
- `NEXT_PUBLIC_FORMBRICKS_ENV_ID`
- `NEXT_PUBLIC_FORMBRICKS_SURVEY_ID`
- `NEXT_PUBLIC_FORMBRICKS_API_HOST=https://app.formbricks.com`

Set in Vercel project settings + local `.env.local`. `NEXT_PUBLIC_*` is intentional — these IDs are public-by-design (the SDK runs in the browser).

---

## 6. Env vars (MCMForge dashboard)

- `FORMBRICKS_HMAC_SECRET` — 32-byte hex, generated via `openssl rand -hex 32`. Set in Vercel + `dashboard/.env.local`. Same value entered in Formbricks Cloud webhook config. Read by webhook route in WO-4 (Slice B), not in WO-3.

Stored in 1Password during WO-3 session for future rotation.

---

## 7. Files touched

**`golfballnut/mcmforge` (branch `feature/wo-3-formbricks-stub`):**

- `dashboard/src/app/api/webhooks/formbricks/route.ts` — new (Slice A stub, ~25 lines).
- `dashboard/src/middleware.ts` — add `/api/webhooks/formbricks` to `PUBLIC_PATHS` (~1 line).
- `dashboard/.env.example` — document `FORMBRICKS_HMAC_SECRET` (no value committed).
- `dashboard/src/app/api/webhooks/formbricks/route.test.ts` — Vitest, asserts 200 response, payload logged, no DB write attempted.

**`golfballnut/linkschoice-marketing` (branch `feature/sell-us-balls`):**

- `app/sell-us-balls/page.tsx` — new server component.
- `app/sell-us-balls/FormbricksMount.tsx` — new client component (Formbricks SDK init).
- `package.json` — add `@formbricks/js` dependency.
- `.env.example` — document the three `NEXT_PUBLIC_FORMBRICKS_*` vars.

**Memory updates (during WO-3 session, after deploy):**

- `reference_forge_ids.md` — append Formbricks env ID, survey ID, 1Password secret reference.

---

## 8. Test plan

| # | Test | Pass condition |
|---|---|---|
| 1 | Stub route unit test (Vitest) | POST with body + sig header → 200 + log entry; no thrown error |
| 2 | Local dev — render embed | `npm run dev` in linkschoice-marketing, navigate to `localhost:3000/sell-us-balls`, embed renders inline (not iframe) |
| 3 | Mobile Safari render | Real iPhone or BrowserStack — phone-input keyboard works, photo picker opens |
| 4 | 10MB photo upload | Submit form with one ~9.5MB photo — succeeds. 11MB photo — Formbricks rejects client-side |
| 5 | Submission lands in Formbricks admin | Within 5s of submit |
| 6 | Webhook delivered to MCMForge | Vercel function logs show POST to `/api/webhooks/formbricks?company=links-choice` with 200 + logged payload, within 3s |
| 7 | HMAC signature is correct (independent script) | `scripts/verify-formbricks-hmac.ts` reads the most recent payload + signature from logs, computes HMAC-SHA256 against staged secret, asserts match. Proves the secret was delivered correctly even though route doesn't verify. |
| 8 | Page is dark | `curl https://linkschoice.com/sell-us-balls -I` → `x-robots-tag` includes `noindex`. No homepage link, no sitemap entry. |
| 9 | No DB write | After test submission, `SELECT count(*) FROM forge.form_submissions` returns 0 (table doesn't exist yet anyway — that's WO-4). |

---

## 9. Acceptance

- [ ] Both PRs merged.
- [ ] Formbricks form created in Cloud Free environment; env ID + survey ID recorded in `reference_forge_ids.md`.
- [ ] `FORMBRICKS_HMAC_SECRET` generated, stored in 1Password, set on Vercel for both projects, set in Formbricks webhook config.
- [ ] All 9 tests pass.
- [ ] PR description on `golfballnut/mcmforge` explicitly cites: "Slice A only — receiver does not yet verify HMAC or persist. Slice B = WO-4."
- [ ] PR description on `golfballnut/linkschoice-marketing` explicitly cites: "Page is dark (`noindex`, no nav link, no sitemap). Public link wires up in WO-6."
- [ ] Hosting decision recorded in PR description: "Cloud Free chosen — Mini was at 94% RAM at WO-3 dispatch (2026-05-08); Docker not installed."

---

## 10. Out of scope (deferred to other WOs)

- HMAC verification → **WO-4**.
- `forge.form_submissions` table → **WO-4**.
- `forge.secrets` table → **WO-4**.
- Idempotent dedupe on Formbricks submission ID → **WO-4**.
- CRM writes via `lib/crm/client.ts` → **WO-4**.
- `forge.issues` row creation on submission → **WO-4**.
- Public link from linkschoice.com homepage / nav / sitemap → **WO-6**.
- Forms for other 4 portfolio cos → **WO-7**.
- Multi-step / branching forms → never in M0.
- Pam's Formbricks Cloud admin access (form ownership transfer) → **WO-7**.
- Self-host migration if Cloud Free volume exceeded → revisit when volume nears 200/mo.

---

## 11. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Formbricks Cloud Free 200/mo cap exceeded before WO-7 | Low | Medium | Monitor submissions in Formbricks admin; if approaching cap, upgrade to paid (~$30/mo) — still cheaper than self-host RAM cost on Mini. |
| `@formbricks/js` SDK breaks Next.js 15 / Turbopack build | Low | Medium | Pin SDK version; if blocked, fall back to documented `<script>` snippet embed (still inline, not iframe). |
| Vercel function logs are noisy → can't find the webhook entry for HMAC test | Low | Low | Use a unique log prefix `[formbricks-stub]` and grep `vercel logs --since 5m`. |
| Pam discovers `/sell-us-balls` URL and submits a real inquiry while page is dark | Low | High | `noindex`, no link anywhere, communicate to Pam at WO-3 dispatch: "do not share this URL until WO-4 ships." |
| Formbricks signature header name differs from `x-formbricks-signature` | Medium | Low | WO-3 captures whatever header arrives — will inspect log entry and update the WO-4 verifier. The stub doesn't depend on header name. |
| Photo uploads — WO-4 receiver needs URLs not bytes | Low | Low | Formbricks webhook payload includes signed URLs to uploaded files. WO-3 logs confirm payload shape; WO-4 stores URLs. Validated in test #6. |

---

## 12. Glossary

- **Slice A** — this WO: stub + dark page.
- **Slice B** — WO-4: HMAC verify + dedupe + CRM writes.
- **Dark page** — exists at a route, not linked from anywhere, has `noindex` meta tag, not in sitemap. Reachable only by direct URL.
- **Cloud Free** — Formbricks-hosted free tier, 200 responses/month, 3 surveys.
- **Form ID** — Formbricks survey UUID, public-by-design (browser SDK consumes it).
- **HMAC secret** — 32-byte shared secret between Formbricks and MCMForge for signing webhook payloads. Configured in WO-3, verified starting WO-4.

---

## 13. Next step

Invoke `/superpowers:writing-plans` to produce an implementation plan with sequenced tasks. Plan goes to `docs/superpowers/plans/2026-05-08-wo-3-formbricks-plan.md`.
