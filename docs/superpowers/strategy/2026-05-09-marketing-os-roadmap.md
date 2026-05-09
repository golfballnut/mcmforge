# Marketing-OS Roadmap — 6.5 → 10

**Date:** 2026-05-09
**Author:** Claude (Opus 4.7) + Steve McMillian
**Status:** Draft, pending Steve's review
**North Star (locked 2026-05-09):** Hybrid B+C — MCMForge is the ops hub today; NetSuite replacement is a 5-year option, not a 12-month commitment.
**Supersedes / extends:** [`2026-05-07-marketing-os-design.md`](../specs/2026-05-07-marketing-os-design.md) — that PRD describes the *system shape*; this doc describes the *current grade and the next three steps to 10/10*.

---

## 1. Goal (one sentence)

**Make MCMForge a 10/10 reliable platform for running daily marketing across 5 portfolio companies (Links Choice, Golf Ball Nut, Hot Golf Brands, DirtSync, MCM Forge) — agents draft, Pam approves, system sends, results loop back.**

10/10 = Pam (or a future second human) opens MCMForge in the morning, sees pending drafts for all 5 cos in one Inbox, approves what's good, and the system sends + measures + logs without manual copy-paste. Trust the loop.

---

## 2. Current grade: **6.5/10**

The agent runtime is solid. The data and the outbound pipe aren't.

```
                 THE DAILY MARKETING LOOP (per portfolio co)

1. TRIGGER ────────────────────────────────────────────────── ✅
   cron · Telegram · manual (working)
   form · NS event (pending — gated on WOs below)

2. AGENT WAKES + READS CONTEXT ────────────────────────────── 🟡
   ✅ forge.knowledge (brand voice, per-co)            ← needs seeding for each of 5
   🟡 forge.crm_*    (CRM tables shipped, but EMPTY)
   ❌ NS mirror      (LC, GBN, HGB only)               ← not built
   ✅ prior runs     (forge.runs / run_events)
   Without #2's data, drafts are generic. Garbage in → generic out.

3. AGENT DRAFTS ──────────────────────────────────────────── ✅
   Proven in WO-2.5 preview drafter. Reliable.

4. APPROVAL LANDS IN INBOX ───────────────────────────────── ✅
   /inbox + /approvals shipped. Card UX shipped.

5. PAM APPROVES ─────────────────────────────────────────── 🟡
   Click works. But...

6. SYSTEM SENDS ─────────────────────────────────────────── ❌  ← biggest gap
   Today: Pam manually copies the draft into Gmail and sends.
   The loop isn't actually closed. Agents are 50% useful.

7. SYSTEM LOGS + MEASURES ────────────────────────────────── 🟡
   forge.crm_activities table exists. Not populated post-send.
   No open / click / reply tracking. No per-co performance dashboard.
```

**4 of 7 steps are solid. 3 are partial. 2 are missing entirely.**

---

## 3. Definition of "10/10"

The system is 10/10 for marketing across 5 cos when Pam can do this every morning without exception:

| # | Capability | Acceptance |
|---|---|---|
| A | One Inbox for all 5 cos | Pam opens `/inbox`, sees every pending draft regardless of which portfolio co. |
| B | Drafts within 60s of trigger | Form submission → agent draft surfaces in `<60s` (existing SLO from CRM PRD). |
| C | One-click approve **sends** | "Approve & Send" actually emails via Gmail; no manual copy-paste. |
| D | Outcome logs to CRM | `forge.crm_activities` row inserted with kind=`email_sent`, message_id, send timestamp. |
| E | Per-company brand voice | LC sounds like Pam at LC; GBN sounds like Steve at GBN. Voice from `forge.knowledge`, agent-cited. |
| F | NS context for LC + GBN + HGB | Agent draft references customer/supplier history (last 5 orders, lifetime value, ball brand preferences) for the 3 cos that have NS data. |
| G | Zero lost submissions | Every form submission either lands in `/inbox` as an approval or fires a `[INCIDENT]` alert. No silent drops. |
| H | Cross-co search works | Pam can search by email/name across all 5 cos in `<200ms` (already shipped in CRM v1; needs to keep working post-NS-mirror). |

A through H = 10/10. Anything less is debt we know about.

---

## 4. The path: 4 WOs to close the gap

Sequencing matters. Each WO unblocks the next. WOs 1-3 get to 10/10 reliable; WO-4 makes it Pam-shaped.

### WO-OUTBOUND-SEND — close the loop (Step 6 ❌ → ✅)

**Why first:** without outbound send, the entire upstream pipeline (forms, NS mirror, brand voice, drafts) just produces drafts that Pam still copy-pastes. **It's the highest-leverage 2 days you can spend.** Every other improvement compounds with it; nothing compounds without it.

**Scope:**
- Wire `/approvals` "Approve & Send" button to Gmail send via existing Workspace MCP.
- On send: insert `forge.crm_activities` row (kind=`email_sent`, body, recipient, `message_id`, sent_at).
- On send: close the originating `forge.issues` row (status=`done`).
- "Edit Draft" → save → send revised body.
- "Reject" → log reason, close issue without send.
- Toast feedback in UI ("Sent to {recipient}").

**Out of scope for this WO:** open/click tracking (deferred to WO-MEASURE), inbound email parsing, calendar sends.

**Effort:** ~2 days.

**Acceptance:** Pam approves a draft on dev, real Gmail send fires, real `forge.crm_activities` row appears, real recipient (Steve's test address) gets the email.

**After this ships:** grade jumps from 6.5 to 7.5.

---

### WO-NS-READ-MIRROR — fill the data hole for LC + GBN + HGB (Step 2 🟡 → ✅)

**Why second:** drafts without NetSuite context are generic, especially for the 3 cos where NS holds 14 years of customer/supplier truth. DirtSync and MCM Forge don't need this — their context is App Store reviews and dogfood.

**Scope:**
- Read-only NetSuite SuiteTalk API integration (existing OAuth or token-based auth).
- New `forge.crm_orders` table (NS source of truth: order_id, customer_id, total, items, date, ball brand, `netsuite_id`).
- Bulk migration job (one-time, idempotent): NS customers → `forge.crm_accounts`/`crm_contacts`, NS orders → `forge.crm_orders`. **All 14 years migrated** — coverage is full.
- Daily delta sync (read-only): NS records modified since last sync → upsert into mirror tables.
- New columns: `crm_accounts.netsuite_id`, `crm_contacts.netsuite_id`, `crm_orders.netsuite_id` for traceability.
- Scoped to LC + GBN + HGB only. DirtSync and MCM Forge `forge.companies` rows skipped.
- **One-way write only — MCMForge never writes back to NS.** That's Vision C, deferred.

**Out of scope for this WO:** AI enrichment of mirrored data (separate WO), bidirectional sync (Vision C), NS write of any kind.

**Effort:** ~5-7 days. The biggest variable: NS API permissions + rate limits + getting the right roles set up. SuiteTalk paginates, throttles, and has historical data quirks that always take longer than expected.

**Acceptance:** A clean `forge.crm_*` snapshot for the 3 NS-using cos, **all 14 years of NS history mirrored** (full coverage in DB). Agent prompts reference last 5 years by default for token economy — full history available on demand via expanded query. Daily sync runs at 03:00 ET and completes without error for 7 consecutive days.

**After this ships:** grade jumps to 9/10. Drafts get smart.

---

### WO-BRAND-VOICE — seed `forge.knowledge` per company (Step 2 partial)

**Why third:** the prior WO gives agents the *facts*; this one gives them the *voice*. Without per-co brand voice, every email sounds like an LLM generic.

**Scope:**
- One `forge.knowledge` document per company seeding the agent's understanding of:
  - Brand voice (formal/informal/funny/precise — examples)
  - Audience (suppliers, retail customers, B2B partners)
  - Common scenarios + how Pam/Steve would handle them
  - Pricing / quote rules (already in knowledge for LC; needs sweep for the others)
  - Forbidden topics / things never to promise
- Source: 30-60 min interview per co, agent-assisted draft, Pam/Steve approve.
- 5 cos × 30-60 min = ~5 hours of interview time across a few days.
- Knowledge entries indexed by `company_id` + `kind=brand_voice`.

**Out of scope for this WO:** building out the full knowledge base for non-marketing topics (e.g., engineering, finance). That's organic growth.

**Effort:** ~half day per co (~2.5 days total) — most of that is interviews + revision, not coding.

**Acceptance:** for each of 5 cos, a draft email written by the agent, blind-graded by Pam/Steve, scores 4+/5 on "sounds like us."

**After this ships:** grade is **10/10**. The loop is real.

---

### WO-UI-REDESIGN — Pam-shaped dashboard (Step 4 polish)

**Why fourth:** today's dashboard has 13 top-level routes that grew organically. It's functional for Steve (who knows the data model) but will confuse Pam. **A redesign before the loop is closed is speculative** — we'd be designing for an assumed workflow. After the 3 WOs ship, we have real usage data to design from.

**Scope:**
- Role-aware navigation: operator (Pam-mode) sees `/inbox`, `/crm`, daily standup; admin (Steve-mode) sees everything.
- Information hierarchy: collapse infra routes (`/runs`, `/agents`, `/skills`, `/knowledge` admin) under a single Admin shelf.
- Mission Control becomes the actual "one place to start" for both roles.
- Approval card refresh: incorporate lessons from WO-OUTBOUND-SEND (likely cleanup of inline editing, recipient confirmation, send-undo toast).
- CRM list/detail polish: use real load data from WO-NS-READ-MIRROR to set sane defaults (pagination, sort, filter chips).
- Mobile responsive sweep — Pam will check from her phone.

**Out of scope for this WO:** new feature work disguised as "redesign." The redesign is *layout + hierarchy + role gating*, not new capabilities.

**Effort:** ~5-7 days (design + build + reviews).

**Acceptance:** Pam is given login credentials. Without prior training, she can complete the morning loop (open Inbox, approve a draft, see it sent, see the activity logged) within 5 minutes of first login.

**After this ships:** the system is **10/10 + Pam-shaped**. Ready to onboard a second human.

---

## 5. Sequencing rationale

```
WO-OUTBOUND-SEND ──► WO-NS-READ-MIRROR ──► WO-BRAND-VOICE ──► WO-UI-REDESIGN
   (2 days)              (5-7 days)           (2.5 days)         (5-7 days)

   closes the loop       fills the data       gives the voice    Pam-shaped UX
   7.5 / 10              9 / 10               10 / 10            10 / 10 + onboarding-ready
```

- **Outbound first** because it unlocks every later improvement. Without send, NS mirroring just makes prettier drafts that Pam still copy-pastes.
- **NS mirror second** because LC/GBN/HGB drafts get fundamentally smarter once history is visible. Brand voice without facts is style without substance.
- **Brand voice third** because it's the polish layer; with facts in place, voice sharpens what's already correct. (Voice without facts ≈ a more confident generic email — worse, not better.)
- **UI redesign fourth** because dashboard polish without a closed loop = polishing a half-built room. The 3 prior WOs reveal where UI friction actually lives; design with data, not speculation.

---

## 6. What's *deliberately* deferred

These are real future work, but **not now**:

| Item | Why deferred | When it comes back |
|---|---|---|
| **5-ADR Scale Architecture set** (storage, secrets, queue, observability, RBAC) | The rails should follow the workflow, not lead it. | After the 3 WOs ship — once we have load + a real second user (Pam logged in), we'll know which rails actually need hardening. |
| **WO-3 v2 (intake forms, native build)** | Already paused 2026-05-09 pending MCMForge robustness. The 3 WOs above ARE that robustness. | After WO-OUTBOUND-SEND ships — first form workflow validates the closed loop. |
| **AI enrichment of NS data** | Premature until NS data is in. | After WO-NS-READ-MIRROR ships. Run as a backfill, shadow-table-and-approve workflow. |
| **Bidirectional NS sync (Vision C)** | High risk, low payoff in 2026. | 5-year option per Hybrid B+C decision. Re-evaluate when MCMForge has 18 months of operational data and there's a clear case for cutting NS. |
| **Open / click / reply tracking** (WO-MEASURE) | Step 7 partial is fine for 10/10 marketing baseline. Measurement comes after the loop is real. | After WO-BRAND-VOICE — once 10/10 is hit, measurement is the next compounding investment. |
| **Non-email channels** (social, content, ads) | One channel at a time. Email is the highest-leverage marketing channel for B2B + DTC. | After 10/10 on email — channel #2 inherits the same loop pattern. |
| **Non-marketing functions** (sales, finance, fulfillment) | Vision A scope is marketing-only by design. Vision C territory. | Vision-C-as-eventual decision, year 3-5. |

---

## 7. Acceptance for "Marketing-OS shipped"

The system is **shipped** when, on a randomly chosen weekday morning:

1. Pam opens `mcmforge.com` and sees Inbox with at least one pending draft from each portfolio co that has activity.
2. Each draft references real CRM/NS context (for LC/GBN/HGB) or real campaign context (for DirtSync/MCM Forge).
3. Each draft sounds like the brand it's for (voice 4+/5 blind grade).
4. Pam approves at least 5 drafts. All 5 emails actually send via Gmail.
5. All 5 sends log to `forge.crm_activities` within 5 seconds.
6. Zero `[INCIDENT]` alerts in the morning brief about lost submissions or failed sends.
7. The week's send count is visible on Mission Control's standup card the next morning.

If any of 1-7 fail consistently, ship is incomplete.

---

## 8. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| NetSuite API access blocks WO-2 | Medium | High | Get SuiteTalk auth + permissions sorted in week 1, before any code. If blocked, pull WO-3 forward. |
| Brand voice interviews get deferred (5 cos × half-day = real calendar work) | High | Medium | Schedule all 5 in week 1; treat them as Steve-only blockers. |
| Outbound send fires duplicate emails (race condition between approve click and send) | Medium | High | Idempotent send with `forge.issues.send_attempted_at` UNIQUE check; full E2E test before merge. |
| Pam approves too fast and lets a bad draft go out | Medium | Medium | "Approve & Send" requires 1 click but show 3-second undo toast (still cancellable). |
| NS mirror data drifts from current NS state (stale) | Low | Medium | Daily delta sync at 03:00 ET. Standup card surfaces sync health (last successful sync timestamp). |
| Generic agent-draft tone slips through despite brand voice WO | Medium | Low | Pam edits in place; agent reads the diff next time and learns. (Manual feedback loop until WO-MEASURE adds quantitative grading.) |
| Hidden 8th gap we haven't named | Medium | ? | Re-grade after each WO ships. If we discover a step 0 ("no scheduled trigger system") or step 1.5 ("agent doesn't know which contact to draft for"), add a WO. |

---

## 9. Glossary

- **Marketing-OS** — this system, scoped to marketing functions only (no sales/finance/fulfillment).
- **The Loop** — the 7-step daily marketing flow above.
- **Portfolio company** — one of Steve's 5 (LC, GBN, HGB, DirtSync, MCM Forge).
- **NS** — NetSuite. System of record for LC + GBN + HGB.
- **10/10** — all 7 loop steps in ✅ state, all 8 acceptance criteria (§3) met, all 7 ship criteria (§7) verified.

---

## 10. Process discipline (locked 2026-05-09)

**Every WO that ships from this roadmap follows the same chain. No exceptions.**

```
1. brainstorming               (skill: superpowers:brainstorming)
   └─ produces: spec at docs/superpowers/specs/YYYY-MM-DD-<wo>-design.md
   └─ HARD-GATE: no code, no scaffolding, until Steve approves the design

2. writing-plans               (skill: superpowers:writing-plans)
   └─ produces: implementation plan at docs/superpowers/plans/YYYY-MM-DD-<wo>-plan.md
   └─ task-by-task, TDD discipline encoded per-step

3. test-driven development     (skill: superpowers:test-driven-development)
   └─ failing test FIRST · minimal impl · green · commit
   └─ applies to every implementation step in the plan

4. subagent-driven execution   (skill: superpowers:subagent-driven-development)
   └─ fresh subagent per task · two-stage review (spec compliance + code quality)
   └─ exception: trivial git/file ops handled inline by controller, with disclosure

5. ship                        (PR + CI + Vercel preview + Steve approves preview + merge)
```

**Calibration on "perfect":** TDD gives us *tested behavior*, not perfection. The two-stage review catches design and quality drift. Production monitoring (post-WO-MEASURE) catches what tests miss. Targeting **"tested, reviewed, reliable"** — not "perfect." Perfect is a trap; reliable is shipped.

**Skill failure modes to watch for** (these appear in red flags lists across the skills):
- Skipping brainstorm because "this is simple" → the brainstorming HARD-GATE rejects this
- Implementing before plan approval → writing-plans gates this
- "Compiles ≠ works" → TDD requires actual behavior tests, not just type checks
- Reviewer skipped → subagent-driven-development requires both spec + quality reviews

---

## 11. Next step

After Steve approves this strategy doc:

1. Open the brainstorm for **WO-OUTBOUND-SEND** (the first of the 4 WOs).
2. Brainstorm → spec → plan → TDD build → subagent review → ship.
3. Re-grade the system. Confirm 7.5/10.
4. Repeat for WO-NS-READ-MIRROR.
5. Re-grade. Confirm 9/10.
6. Repeat for WO-BRAND-VOICE.
7. Re-grade. Confirm 10/10.
8. Repeat for WO-UI-REDESIGN.
9. Re-grade. Confirm 10/10 + Pam-onboarding-ready.
10. Then revisit ADRs (rails follow workload).

End of strategy.
