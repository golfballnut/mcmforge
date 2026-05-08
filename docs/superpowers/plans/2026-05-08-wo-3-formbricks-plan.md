# WO-3 Formbricks Supplier Intake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Slice A of WO-3 — a Formbricks Cloud Free supplier-intake form for Links Choice, embedded on a dark page at `linkschoice.com/sell-us-balls`, posting HMAC-signed webhooks to a stub receiver on `mcmforge.com` that logs and 200s.

**Architecture:** Two repos, two PRs. Formbricks Cloud Free hosts the form (rationale: Mac Mini at 94% RAM at dispatch, Docker not installed). MCMForge dashboard adds a pure stub webhook route — no HMAC verify, no DB writes — those land in WO-4. linkschoice-marketing adds a `noindex` page with the Formbricks JS SDK. Page stays unlinked until WO-4 ships, so Pam can't accidentally fill out a form that goes nowhere.

**Tech Stack:** Next.js 16 (App Router) on Vercel · Vitest 4 + jsdom + @testing-library/react (MCMForge tests) · Formbricks Cloud Free + `@formbricks/js` SDK · Supabase Postgres (untouched in this WO).

**Spec:** [`docs/superpowers/specs/2026-05-08-wo-3-formbricks-design.md`](../specs/2026-05-08-wo-3-formbricks-design.md)
**Parent WO:** [`docs/superpowers/work-orders/wo-3-formbricks-supplier-intake.md`](../work-orders/wo-3-formbricks-supplier-intake.md)

---

## Phase 1 — MCMForge stub webhook (TDD)

Repo: `golfballnut/mcmforge`. Branch: `feature/wo-3-formbricks-stub`. Working dir: `/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge`.

### Task 1: Branch off main

**Files:** none (git op)

- [ ] **Step 1: Confirm clean working tree on main**

```bash
git status
```

Expected: branch `main`, no untracked or modified files relevant to WO-3 (the existing `M .claude/hooks/brain-brief.sh` and `??` folders pre-date this WO — leave them).

- [ ] **Step 2: Pull latest main**

```bash
git pull --ff-only origin main
```

- [ ] **Step 3: Create branch**

```bash
git checkout -b feature/wo-3-formbricks-stub
```

---

### Task 2: Add Vitest test for stub route (failing)

**Files:**
- Create: `dashboard/src/app/api/webhooks/formbricks/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// dashboard/src/app/api/webhooks/formbricks/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

describe('POST /api/webhooks/formbricks (Slice A stub)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('returns 200 ok for any POST body', async () => {
    const req = new Request(
      'https://mcmforge.com/api/webhooks/formbricks?company=links-choice',
      {
        method: 'POST',
        headers: { 'x-formbricks-signature': 'sha256=abc123' },
        body: JSON.stringify({ surveyId: 'test', data: { email: 'a@b.com' } }),
      },
    )

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('logs the company slug, signature header, and body preview', async () => {
    const body = JSON.stringify({ surveyId: 'test', payload: 'x'.repeat(3000) })
    const req = new Request(
      'https://mcmforge.com/api/webhooks/formbricks?company=links-choice',
      {
        method: 'POST',
        headers: { 'x-formbricks-signature': 'sha256=deadbeef' },
        body,
      },
    )

    await POST(req)

    expect(logSpy).toHaveBeenCalledTimes(1)
    const [tag, payload] = logSpy.mock.calls[0]
    expect(tag).toBe('[formbricks-stub]')
    const parsed = JSON.parse(payload as string)
    expect(parsed.company).toBe('links-choice')
    expect(parsed.sig).toBe('sha256=deadbeef')
    expect(parsed.body_bytes).toBe(body.length)
    expect(parsed.body_preview.length).toBeLessThanOrEqual(2000)
    expect(parsed.body_preview.startsWith('{"surveyId":"test"')).toBe(true)
  })

  it('captures null for missing company query param and missing signature', async () => {
    const req = new Request('https://mcmforge.com/api/webhooks/formbricks', {
      method: 'POST',
      body: '{}',
    })

    await POST(req)

    const [, payload] = logSpy.mock.calls[0]
    const parsed = JSON.parse(payload as string)
    expect(parsed.company).toBeNull()
    expect(parsed.sig).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd dashboard && npm test -- src/app/api/webhooks/formbricks/route.test.ts
```

Expected: FAIL with module-not-found error for `./route`.

---

### Task 3: Implement the stub route

**Files:**
- Create: `dashboard/src/app/api/webhooks/formbricks/route.ts`

- [ ] **Step 1: Write the route**

```ts
// dashboard/src/app/api/webhooks/formbricks/route.ts
//
// WO-3 Slice A stub: log payload + return 200. No HMAC verify, no DB writes.
// HMAC verification + forge.form_submissions insert lands in WO-4.

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const ts = new Date().toISOString()
  const company = new URL(req.url).searchParams.get('company') ?? null
  const sig = req.headers.get('x-formbricks-signature') ?? null
  const body = await req.text()

  console.log(
    '[formbricks-stub]',
    JSON.stringify({
      ts,
      company,
      sig,
      body_bytes: body.length,
      body_preview: body.slice(0, 2000),
    }),
  )

  return new Response('ok', { status: 200 })
}
```

- [ ] **Step 2: Run the test to confirm it passes**

```bash
cd dashboard && npm test -- src/app/api/webhooks/formbricks/route.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 3: Run the full Vitest suite to confirm no regressions**

```bash
cd dashboard && npm test
```

Expected: existing test count + 3 new, all green.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/app/api/webhooks/formbricks/
git commit -m "feat(webhooks): formbricks stub route (Slice A) — log + 200, no verify"
```

---

### Task 4: Bypass auth middleware for the webhook path

**Files:**
- Modify: `dashboard/src/middleware.ts:8`

- [ ] **Step 1: Edit `PUBLIC_PATHS`**

Change line 8 from:

```ts
const PUBLIC_PATHS = ["/api/github/webhook", "/api/agent"];
```

to:

```ts
const PUBLIC_PATHS = ["/api/github/webhook", "/api/agent", "/api/webhooks/formbricks"];
```

- [ ] **Step 2: Lint the dashboard**

```bash
cd dashboard && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Build the dashboard locally to confirm Next compiles**

```bash
cd dashboard && npm run build
```

Expected: build succeeds. Sanity check that `Route /api/webhooks/formbricks` appears in the `ƒ` (dynamic) section of the route summary.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/middleware.ts
git commit -m "feat(middleware): bypass auth for /api/webhooks/formbricks"
```

---

### Task 5: Document the HMAC secret env var

**Files:**
- Modify: `dashboard/.env.example` (or create if absent)

- [ ] **Step 1: Read current `.env.example`**

```bash
cat dashboard/.env.example 2>/dev/null
```

If it does not exist, create it. If it does, append.

- [ ] **Step 2: Append the var**

Append to `dashboard/.env.example`:

```
# Formbricks webhook (WO-3). Generated via `openssl rand -hex 32`.
# Set the same value in Vercel env + the Formbricks Cloud webhook config.
# Slice A (WO-3) reads but does not verify. Slice B (WO-4) verifies.
FORMBRICKS_HMAC_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/.env.example
git commit -m "docs(env): document FORMBRICKS_HMAC_SECRET"
```

---

### Task 6: Generate the HMAC secret + record it

**Files:** none (out-of-band ops)

- [ ] **Step 1: Generate the secret**

```bash
openssl rand -hex 32
```

Copy the 64-char output. Do **not** commit it.

- [ ] **Step 2: Store in 1Password**

Create a 1Password entry titled `Formbricks HMAC — Links Choice (WO-3)` with the secret value. Note the entry name; it goes into `reference_forge_ids.md` later.

- [ ] **Step 3: Add to local `.env.local`**

```bash
echo "FORMBRICKS_HMAC_SECRET=<paste>" >> dashboard/.env.local
```

(File is gitignored.)

- [ ] **Step 4: Add to Vercel** (manual)

In Vercel dashboard → `mcmforge` project → Settings → Environment Variables → add `FORMBRICKS_HMAC_SECRET` for Production + Preview + Development. Paste the same value. Do not commit.

---

### Task 7: Push branch and open PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/wo-3-formbricks-stub
```

- [ ] **Step 2: Open PR with explicit Slice A boundary**

```bash
gh pr create --title "feat(wo-3): formbricks webhook stub (Slice A)" --body "$(cat <<'EOF'
## Summary

WO-3 Slice A. Adds a stub receiver at `/api/webhooks/formbricks` that logs the payload and returns 200. No HMAC verify, no DB writes — those land in WO-4 (Slice B). Middleware bypass added so the route is reachable without auth.

**Hosting decision:** Formbricks Cloud Free chosen. Mac Mini was at 94% RAM (15G/16G) at WO-3 dispatch on 2026-05-08, and Docker was not installed. Self-host can be revisited in WO-7 polish if volume justifies it.

**Slice boundary:** This PR is **not** the supplier-intake feature. The form page on linkschoice.com is shipping in a separate PR and stays dark (`noindex`, no nav link, no sitemap entry) until WO-4 wires up persistence. Conflating "stub returns 200" with "supplier intake works" is the failure mode this boundary prevents.

## Test plan

- [x] Vitest unit tests cover the 200 response, log format, and missing-header tolerance
- [x] `npm run lint` clean
- [x] `npm run build` compiles
- [ ] After merge: confirm Vercel function logs show `[formbricks-stub]` entries from real Formbricks Cloud submissions

Spec: `docs/superpowers/specs/2026-05-08-wo-3-formbricks-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI + Vercel preview deploy**

Note the preview URL — it's needed in Phase 2 to configure Formbricks before merging to production.

---

## Phase 2 — Formbricks Cloud setup (manual UI)

This phase is operator work in the Formbricks admin UI. No repo changes.

### Task 8: Create the Formbricks Cloud Free account

- [ ] **Step 1: Sign up**

Go to <https://app.formbricks.com> and sign up with `agent@mcmforge.com` (or whichever email Steve designates — verify in `reference_dashboard_agent_creds.md` first).

- [ ] **Step 2: Confirm Free plan**

After signup, confirm the workspace is on the Free plan (200 responses/mo, 3 surveys).

- [ ] **Step 3: Note environment IDs**

In Formbricks settings → API Keys / Project Settings → copy the **environment ID** (looks like `cl_xxxxxxxxxxxxxxxxxxxxxxxx`). Set this aside — it goes into `reference_forge_ids.md` in Task 11.

---

### Task 9: Build the supplier-intake survey

- [ ] **Step 1: Create new survey**

In Formbricks admin → Surveys → New Survey → Link Survey (web embed). Title: `Links Choice — Sell us your used balls`.

- [ ] **Step 2: Add fields in this order**

| # | Field | Formbricks type | Required | Notes |
|---|---|---|---|---|
| 1 | `name` | Open Text — Short | yes | Label: "Your name" |
| 2 | `email` | Open Text — Email | yes | Label: "Email address" |
| 3 | `phone` | Open Text — Phone | no | Label: "Phone (optional)" |
| 4 | `ball_brand` | Multiple Choice — Multi-select | yes | Options: `Titleist Pro V1`, `Titleist Pro V1x`, `Callaway Chrome Soft`, `TaylorMade TP5`, `Other` |
| 5 | `est_quantity` | Open Text — Number | yes | Label: "Estimated quantity (number of balls)". Min 1. |
| 6 | `photos` | File Upload | no | Max 3 files, 10MB each, accept `image/*` |
| 7 | `notes` | Open Text — Long | no | Label: "Anything else we should know?" |

- [ ] **Step 3: Set thank-you message**

"Thanks — we'll review and email you within 1 business day."

- [ ] **Step 4: Apply minimal Links Choice branding**

Survey Settings → Styling → set primary color to Links Choice green (hex from `linkschoice-marketing/app/globals.css` — confirm before setting, do not guess).

- [ ] **Step 5: Note the survey ID**

After save, copy the survey ID from the URL or settings panel (looks like `cl_yyyyyyyyyyyyyyyyyyyyyyy`). Set this aside for Task 11.

---

### Task 10: Configure the webhook

- [ ] **Step 1: Open webhook settings**

Survey → Settings → Integrations → Webhooks → Add Webhook.

- [ ] **Step 2: Set URL**

Use the Vercel **production** URL once Phase 1 PR is merged:

```
https://mcmforge.com/api/webhooks/formbricks?company=links-choice
```

If you want to test against the preview deploy first, paste the preview URL temporarily. Switch to production after Phase 1 merges.

- [ ] **Step 3: Set HMAC secret**

Paste the value from 1Password (Task 6 entry `Formbricks HMAC — Links Choice (WO-3)`). Confirm Formbricks names the header `x-formbricks-signature` (or whichever its docs specify — capture exact name and update the spec/plan inline if it differs).

- [ ] **Step 4: Trigger event**

Set to fire on `responseCreated` (any survey response).

- [ ] **Step 5: Save**

---

### Task 11: Record IDs in `reference_forge_ids.md`

**Files:**
- Modify: `/Users/stevemcmillian/.claude/projects/-Users-stevemcmillian-llama-3-agents-Apps-projects-MCMForge/memory/reference_forge_ids.md`

- [ ] **Step 1: Append a new section**

After the existing `## Mini paths` section, append:

```markdown

## Formbricks (added WO-3, 2026-05-08)
- Cloud workspace email: <agent email used in Task 8>
- Environment ID: <env id from Task 8 step 3>
- Links Choice supplier-intake survey ID: <survey id from Task 9 step 5>
- HMAC secret 1Password entry: `Formbricks HMAC — Links Choice (WO-3)`
- Webhook URL: `https://mcmforge.com/api/webhooks/formbricks?company=links-choice`
- Plan: Free (200 responses/mo)
```

- [ ] **Step 2: Append a one-liner to `MEMORY.md`**

Add under `### Currently shipped / load-bearing`:

```markdown
- [reference_forge_ids.md](reference_forge_ids.md) — now also holds Formbricks env/survey IDs (WO-3, 2026-05-08).
```

(Skip if a similar pointer already exists.)

---

## Phase 3 — linkschoice-marketing page

Repo: `golfballnut/linkschoice-marketing`. Branch: `feature/sell-us-balls`. Working dir: `/Users/stevemcmillian/llama-3-agents/Apps/projects/linkschoice-marketing`.

### Task 12: Branch off main

- [ ] **Step 1: Confirm clean state**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/linkschoice-marketing
git status
```

- [ ] **Step 2: Pull + branch**

```bash
git pull --ff-only origin main
git checkout -b feature/sell-us-balls
```

---

### Task 13: Add the Formbricks SDK dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/linkschoice-marketing
npm install @formbricks/js
```

- [ ] **Step 2: Verify version pin**

Open `package.json` and confirm `@formbricks/js` is in `dependencies` with a pinned major version (e.g. `^3.x.x`). If it pulled `latest` with a `*` or no version, change to a pinned `^N.0.0` based on what was installed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @formbricks/js for survey embed"
```

---

### Task 14: Add the dark page route

**Files:**
- Create: `app/sell-us-balls/page.tsx`
- Create: `app/sell-us-balls/FormbricksMount.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/sell-us-balls/page.tsx
import type { Metadata } from 'next'
import { FormbricksMount } from './FormbricksMount'

export const metadata: Metadata = {
  title: 'Sell us your used golf balls — Links Choice',
  description: 'Bulk used-ball intake form for Links Choice suppliers.',
  robots: { index: false, follow: false },
}

export default function SellUsBallsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Sell us your used golf balls
      </h1>
      <p className="mt-4 text-base text-neutral-600">
        Tell us what you have. We&apos;ll review and email you within one
        business day with a quote.
      </p>
      <div className="mt-10">
        <FormbricksMount />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Create the SDK mount component**

```tsx
// app/sell-us-balls/FormbricksMount.tsx
'use client'

import { useEffect } from 'react'
import formbricks from '@formbricks/js'

export function FormbricksMount() {
  useEffect(() => {
    const envId = process.env.NEXT_PUBLIC_FORMBRICKS_ENV_ID
    const apiHost =
      process.env.NEXT_PUBLIC_FORMBRICKS_API_HOST ?? 'https://app.formbricks.com'

    if (!envId) {
      console.warn('[formbricks] NEXT_PUBLIC_FORMBRICKS_ENV_ID is not set')
      return
    }

    formbricks.setup({ environmentId: envId, appUrl: apiHost })
  }, [])

  return <div id="formbricks-mount" />
}
```

> **SDK API note:** The `@formbricks/js` SDK exposes a survey via `formbricks.setup(...)` plus event tracking. If the installed SDK version uses a different method name (e.g. `formbricks.init`), match what the installed version exports — verify against `node_modules/@formbricks/js/dist/index.d.ts`. Do not guess.

- [ ] **Step 3: Run dev server and load the route**

```bash
npm run dev
```

Open `http://localhost:3000/sell-us-balls` in Chrome. Expected: page renders the `<h1>`, copy paragraph, and a `<div id="formbricks-mount" />` placeholder. The Formbricks survey itself only appears once env vars are set in the next task.

- [ ] **Step 4: Commit**

```bash
git add app/sell-us-balls
git commit -m "feat(sell-us-balls): dark page + formbricks SDK mount"
```

---

### Task 15: Document and set the env vars

**Files:**
- Modify or create: `.env.example`

- [ ] **Step 1: Update `.env.example`**

Append:

```
# Formbricks Cloud (WO-3). Public-by-design — these IDs run in the browser SDK.
NEXT_PUBLIC_FORMBRICKS_ENV_ID=
NEXT_PUBLIC_FORMBRICKS_SURVEY_ID=
NEXT_PUBLIC_FORMBRICKS_API_HOST=https://app.formbricks.com
```

- [ ] **Step 2: Set in local `.env.local`**

```bash
echo "NEXT_PUBLIC_FORMBRICKS_ENV_ID=<env id from Task 8>" >> .env.local
echo "NEXT_PUBLIC_FORMBRICKS_SURVEY_ID=<survey id from Task 9>" >> .env.local
echo "NEXT_PUBLIC_FORMBRICKS_API_HOST=https://app.formbricks.com" >> .env.local
```

- [ ] **Step 3: Set in Vercel** (manual)

Vercel dashboard → `linkschoice-marketing` project → Settings → Environment Variables → add the three vars for Production + Preview + Development.

- [ ] **Step 4: Restart dev server and reload `/sell-us-balls`**

Expected: the Formbricks survey now renders inline. Use Chrome DevTools to confirm it is **not** an iframe (look for `<iframe>` — should not be present; survey HTML should be inline DOM).

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs(env): document NEXT_PUBLIC_FORMBRICKS_* vars"
```

---

### Task 16: Mobile Safari render check

**Files:** none (manual QA)

- [ ] **Step 1: Open dev tunnel or deploy preview**

Either: (a) push branch and use Vercel preview URL, or (b) `npx ngrok http 3000` to expose local dev to a real device.

- [ ] **Step 2: Load on real iPhone Safari**

Open the URL from a real iPhone (not Chrome DevTools mobile emulation — emulation does not catch keyboard quirks).

- [ ] **Step 3: Tap each field, confirm correct keyboard**

- Email field → `@` keyboard.
- Phone field → numeric keypad.
- Quantity field → numeric keypad.
- Notes field → standard QWERTY.

- [ ] **Step 4: Confirm photo picker opens**

Tap photo upload → iOS photo picker should open (camera + library).

If any check fails, capture screenshots and add a new task to fix before opening the PR.

---

### Task 17: Push branch and open PR

- [ ] **Step 1: Push**

```bash
git push -u origin feature/sell-us-balls
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: /sell-us-balls supplier intake form (WO-3 Slice A, dark)" --body "$(cat <<'EOF'
## Summary

WO-3 Slice A. Adds `/sell-us-balls` with the Formbricks Cloud Free supplier-intake form embedded inline via `@formbricks/js`. Page is **dark**: `robots: noindex, nofollow`, no nav link, no sitemap entry. Reachable only by direct URL.

**Why dark:** WO-3 ships only the form + receiver stub. Persistence + agent draft loop ships in WO-4. If this page is publicly linked before WO-4 merges, suppliers fill the form, see a confirmation, and submissions silently go to /dev/null. Public link wires up in WO-6 (Day-1 end-to-end).

**Hosting:** Formbricks Cloud Free. See MCMForge PR description for rationale.

## Test plan

- [x] Local dev render (Chrome desktop): page renders, embed is inline DOM (not iframe)
- [x] Mobile Safari render on real iPhone: correct keyboards, photo picker works
- [ ] After merge: production URL `https://linkschoice.com/sell-us-balls` returns the embed; `curl -I` confirms `x-robots-tag: noindex`

Spec: `MCMForge: docs/superpowers/specs/2026-05-08-wo-3-formbricks-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 4 — End-to-end verification + merge

### Task 18: Submit a test entry against production

**Files:** none (manual QA)

Do this **after** both PRs are merged and Vercel has deployed both production sites.

- [ ] **Step 1: Confirm the page is dark**

```bash
curl -I https://linkschoice.com/sell-us-balls 2>&1 | grep -i robots
```

Expected: `x-robots-tag: noindex, nofollow` (or similar — Next emits the metadata as either `<meta>` only, or `x-robots-tag` header depending on config). If neither header nor `<meta>` is present in the page source, fail the task.

```bash
curl -s https://linkschoice.com/sell-us-balls | grep -i 'robots'
```

Expected: `<meta name="robots" content="noindex, nofollow"/>` in the HTML.

- [ ] **Step 2: Confirm there's no link from anywhere**

```bash
curl -s https://linkschoice.com/ | grep -c 'sell-us-balls'
```

Expected: `0`.

```bash
curl -s https://linkschoice.com/sitemap.xml 2>/dev/null | grep -c 'sell-us-balls' || echo 0
```

Expected: `0`.

- [ ] **Step 3: Open `https://linkschoice.com/sell-us-balls`**

- [ ] **Step 4: Fill all fields with traceable test data**

Use a known marker like `WO-3-SMOKE-2026-05-08` in the notes field so the entry is easy to grep later.

- [ ] **Step 5: Upload one ~9MB photo (boundary test for the 10MB limit)**

Then verify the limit holds: try uploading an 11MB file in a separate test attempt — Formbricks should reject it client-side. (Don't submit the 11MB attempt; just confirm the rejection.)

- [ ] **Step 6: Submit the original (legitimate) entry**

Expect: thank-you message renders within 5 seconds.

---

### Task 19: Verify in Formbricks admin

- [ ] **Step 1: Open the survey responses tab in Formbricks Cloud**

- [ ] **Step 2: Confirm the response appears**

Within ~5 seconds of submit. Confirm all 7 fields landed correctly + the photo URL is signed and accessible.

---

### Task 20: Verify in Vercel function logs

- [ ] **Step 1: Tail logs**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
vercel logs --since 5m | grep formbricks-stub
```

(Requires `vercel` CLI logged in to the `mcmforge` project.)

- [ ] **Step 2: Confirm one log entry**

Expected: a single `[formbricks-stub] {...}` line with `company: "links-choice"`, a non-null `sig`, `body_bytes` matching the payload size, and `body_preview` containing the marker `WO-3-SMOKE-2026-05-08`.

If the log entry is absent: webhook misfire. Check Formbricks → webhook delivery log for the response code MCMForge returned.

---

### Task 21: Independent HMAC verification script

**Files:**
- Create: `scripts/verify-formbricks-hmac.ts` (in MCMForge repo)

This is a one-off verifier, not committed to main. The goal: prove the HMAC secret was delivered correctly even though the route doesn't verify yet.

- [ ] **Step 1: Write the script**

```ts
// scripts/verify-formbricks-hmac.ts
//
// Run: npx tsx scripts/verify-formbricks-hmac.ts '<body>' '<signature header value>'
//
// Computes HMAC-SHA256 of the body using FORMBRICKS_HMAC_SECRET from env
// and compares to the signature observed in Vercel logs.

import { createHmac, timingSafeEqual } from 'crypto'

const [, , bodyArg, sigArg] = process.argv
if (!bodyArg || !sigArg) {
  console.error('usage: tsx verify-formbricks-hmac.ts <body> <signature>')
  process.exit(2)
}

const secret = process.env.FORMBRICKS_HMAC_SECRET
if (!secret) {
  console.error('FORMBRICKS_HMAC_SECRET is not set')
  process.exit(2)
}

const expected = createHmac('sha256', secret).update(bodyArg).digest('hex')
// Strip a "sha256=" prefix if Formbricks adds one — confirm against actual log capture.
const observed = sigArg.replace(/^sha256=/, '')

const a = Buffer.from(expected, 'hex')
const b = Buffer.from(observed, 'hex')

if (a.length !== b.length || !timingSafeEqual(a, b)) {
  console.error('FAIL: HMAC mismatch')
  console.error({ expected, observed })
  process.exit(1)
}

console.log('PASS: HMAC matches')
```

- [ ] **Step 2: Pull the body + sig from the Vercel log entry**

From the log entry captured in Task 20, copy the `body_preview` (note: this is the *first 2000 bytes* — if the actual body is longer, the verifier won't match. If body_bytes > 2000, capture the full body via Formbricks' webhook delivery inspector instead).

- [ ] **Step 3: Run the verifier**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
export FORMBRICKS_HMAC_SECRET=<paste from 1Password>
npx tsx scripts/verify-formbricks-hmac.ts '<body>' '<sig from log>'
```

Expected: `PASS: HMAC matches`.

If FAIL: the secret in Formbricks Cloud and the secret in 1Password / Vercel diverged. Re-paste the same value into both, re-fire a test submission, re-run.

- [ ] **Step 4: Delete the script (do not commit)**

```bash
rm scripts/verify-formbricks-hmac.ts
```

The verifier is one-off proof. WO-4 builds the production-grade verifier into the route handler.

---

### Task 22: Update `MEMORY.md` and the WO doc

**Files:**
- Modify: `/Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/docs/superpowers/work-orders/wo-3-formbricks-supplier-intake.md`

- [ ] **Step 1: Mark WO-3 as shipped**

Change status field to `Shipped 2026-05-08`. Add an `## Outcome` section:

```markdown
## Outcome

- Hosting: Formbricks Cloud Free (Mini at 94% RAM at dispatch).
- MCMForge PR: <link>.
- linkschoice-marketing PR: <link>.
- Slice A only: stub returns 200 + logs. HMAC verify + persistence land in WO-4.
- Page is dark: `noindex`, no nav link, no sitemap. Public link wires up in WO-6.
- Smoke test: form submission `WO-3-SMOKE-2026-05-08` verified end-to-end (Formbricks admin → MCMForge logs → HMAC matches).
```

- [ ] **Step 2: Add a project memory file**

Create `/Users/stevemcmillian/.claude/projects/-Users-stevemcmillian-llama-3-agents-Apps-projects-MCMForge/memory/project_wo3_shipped_2026_05_08.md`:

```markdown
---
name: WO-3 Formbricks supplier intake (Slice A) — shipped 2026-05-08
description: Cloud Free hosting, dark /sell-us-balls page, stub webhook receiver. WO-4 is next (persistence + HMAC verify).
type: project
---

WO-3 Slice A shipped 2026-05-08. Two PRs (links in WO-3 doc Outcome). Page is dark — no nav link, `noindex` — until WO-4 ships persistence. Smoke test passed end-to-end: form → Formbricks admin → MCMForge stub logs → HMAC verified by one-off script.

**Why:** Marketing-OS day-1 loop needs a public-facing intake. WO-3 proves the wire: form embed renders, submission delivers, signature is valid. WO-4 turns the wire into persistence + agent draft.

**How to apply:** When dispatching WO-4, the Formbricks env/survey IDs and HMAC 1Password entry are in `reference_forge_ids.md`. The stub route at `dashboard/src/app/api/webhooks/formbricks/route.ts` is the file WO-4 extends — replace the log-and-200 body with verify+dedupe+CRM-write.
```

- [ ] **Step 3: Append a pointer to `MEMORY.md`**

Under `### Currently shipped / load-bearing`:

```markdown
- [project_wo3_shipped_2026_05_08.md](project_wo3_shipped_2026_05_08.md) — WO-3 Slice A: Formbricks Cloud Free + dark /sell-us-balls page + stub receiver. WO-4 = persistence + HMAC verify.
```

- [ ] **Step 4: Commit memory + WO updates**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git checkout main
git pull --ff-only origin main
git checkout -b chore/wo-3-shipped-notes
git add docs/superpowers/work-orders/wo-3-formbricks-supplier-intake.md
git commit -m "docs(wo-3): mark shipped 2026-05-08 + outcome notes"
git push -u origin chore/wo-3-shipped-notes
gh pr create --title "docs(wo-3): mark shipped" --body "Updates WO-3 status + outcome after Slice A merge."
```

(Memory files live outside the repo and don't need a PR — just save them.)

---

## Acceptance criteria (from spec §9)

- [ ] Both PRs merged.
- [ ] Formbricks form created in Cloud Free; env ID + survey ID recorded in `reference_forge_ids.md`.
- [ ] `FORMBRICKS_HMAC_SECRET` generated, in 1Password, in Vercel for `mcmforge`, in Formbricks webhook config.
- [ ] All 9 spec tests pass (covered by Tasks 2, 14, 16, 18–21).
- [ ] MCMForge PR description cites Slice A boundary verbatim (Task 7 step 2).
- [ ] linkschoice-marketing PR description cites dark-page boundary verbatim (Task 17 step 2).
- [ ] Hosting decision recorded in MCMForge PR description (Task 7 step 2).
