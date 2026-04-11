# HEARTBEAT.md — DirtSync Social Riding Engineer

## You Inherit the Feature Builder HEARTBEAT

Your base procedure is defined in:
`companies/dirtsync/agents/feature-builder/HEARTBEAT.md`

Read it fully before every run. All rules apply: reproduce-first, 8-iteration cap, claim-tracking, idle-loop, visual-bug rules. The sections below are OVERRIDES and ADDITIONS specific to this agent's social domain. They do not replace Feature Builder's HEARTBEAT — they extend it.

---

## ACTIVATION GATE CHECK (Step -1 — before everything)

Before reading lessons, before touching the inbox, verify the activation gate:

1. Check `DirtSync is in App Store or TestFlight with >= 10 active users`.
2. If gate is NOT met: post a comment to the Forge issue — "Activation gate not met: [reason]. This agent is paused. Steve must explicitly unlock." — then EXIT.
3. If gate IS met: continue to Step 0.

**Do not skip this check.** Running social features without a user base ships a ghost town and wastes budget.

---

## Step 0 — Read Your Lessons (MANDATORY)

Before any other action:

1. Read `companies/dirtsync/agents/dirtsync-social-riding-engineer/LESSONS.md`.
2. If the file does not exist, create it with the header from Feature Builder's HEARTBEAT format.
3. Scan for entries matching current issue by tag (`supabase-realtime`, `apns`, `riderbeacon`, `rally-points`, `friend-dots`).
4. Apply entries with `Outcome: worked` first. Skip approaches with `Outcome: didn't work`.

---

## Social-Domain Startup Overrides

After reading lessons and pulling the issue, run these checks BEFORE writing any code:

### 1. Scope Check (MANDATORY)
Confirm the issue is in your domain:
- RiderBeacon service or `rider_beacons` table → yours
- Rally points or `rally_points` table → yours
- Friend dots on map → yours (coordinate with Explore UX Expert on z-order)
- APNs for rally events → yours

If the issue is NOT in your domain, escalate per the Escalation Rules in AGENTS.md and exit.

### 2. Supabase Realtime Channel Test (BEFORE writing Swift code)

Always verify the channel works in isolation before wiring it to the app:

```bash
# Quick channel smoke test via Supabase REST
# Confirm rider_beacons table exists and RLS is configured
mcp__supabase__execute_sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('rider_beacons', 'rally_points');"

# Verify RLS is enabled
mcp__supabase__execute_sql: "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('rider_beacons', 'rally_points');"
```

If either table is missing, run the migration from TOOLS.md before continuing.

### 3. RLS Policy Check (MANDATORY before any realtime work)

```sql
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('rider_beacons', 'rally_points');
```

Expected policies:
- `rider_beacons`: SELECT for authenticated users; INSERT/UPDATE where `user_id = auth.uid()`
- `rally_points`: SELECT for authenticated; INSERT where `creator_user_id = auth.uid()`; UPDATE/DELETE where `creator_user_id = auth.uid()`

If policies are missing, apply them from the migration template in TOOLS.md FIRST.

### 4. APNs Token Verification (only if issue involves push notifications)

Before sending a test notification:
1. Confirm `aps-environment` entitlement in `DirtSync.entitlements` matches your target (Development vs Production).
2. Never mix sandbox token with production endpoint or vice versa — silent drop, no error.
3. Log the push attempt and result to Forge issue before claiming delivered.

### 5. Privacy Rounding Verification

Before any code that writes location to Supabase or broadcasts on Realtime:
- Confirm `round(lat, 5)` and `round(lng, 5)` are applied at the SERVICE layer (RiderBeaconService), not the UI layer.
- A coordinate written at full precision (e.g. `37.35178294837`) is a privacy violation in a social context.

---

## Inner Loop Overrides

All inner loop rules from Feature Builder HEARTBEAT apply. Additional social-domain checks per iteration:

**After every code change:**
- Does the change write full-precision lat/lng anywhere? If yes, fix it before continuing.
- Does the change create a new CLLocationManager? If yes, revert immediately — use `MapLocationManager.shared`.
- Does the new layer get added before `mapViewDidFinishLoadingMap`? If yes, fix the ordering.

**Test commands for social features (supplement Feature Builder's XCUITest commands):**

```bash
# Realtime channel round-trip test (run on Mini)
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/SocialRidingTests 2>&1 | tail -60'

# Friend dot rendering test
ssh dirtsyncmini@100.125.184.57 'cd /Users/dirtsyncmini/DirtSync && xcodebuild test -scheme DirtSync -destination "platform=iOS Simulator,name=iPhone 17" -only-testing:DirtSyncUITests/FriendDotLayerTests 2>&1 | tail -40'
```

---

## Ship Overrides

All ship steps from Feature Builder HEARTBEAT apply. Additional requirement:

Before opening the PR, confirm in your PR body:
- RLS policies applied and verified (paste the `pg_policies` query result)
- Privacy rounding applied (paste the relevant Swift line)
- APNs environment confirmed (sandbox or production)
- Friend dot layer z-order confirmed above trail stack (paste the layer name list)

---

## Final — Append Lessons Learned (MANDATORY)

Same format as Feature Builder. Append to TOP of:
`companies/dirtsync/agents/dirtsync-social-riding-engineer/LESSONS.md`

Social-specific tags to use:
- `supabase-realtime` — Realtime channel bugs
- `apns` — Push notification delivery issues
- `riderbeacon` — RiderBeaconService bugs
- `rally-points` — Rally point flow bugs
- `friend-dots` — Map annotation layer issues
- `rls` — Row-level security policy gaps
- `privacy-rounding` — Coordinate precision issues
