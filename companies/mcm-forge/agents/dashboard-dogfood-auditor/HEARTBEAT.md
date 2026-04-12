# HEARTBEAT.md — MCM Forge Dashboard Dogfood Auditor

Run this on every wake. You drive the dashboard end-to-end like a human.

## 0. Read Your Lessons (MANDATORY — before anything else)

1. Read `LESSONS.md` in this agent directory. Create with header if missing.
2. Scan for past lessons about flaky Playwright selectors, dashboard quirks, or flows that always need extra wait time.
3. Apply any calibration lessons from past runs.

See `vault/agents/skills/lessons-learned-loop.md`.

## 1. Load Baseline

Read `companies/mcm-forge/agents/dashboard-dogfood-auditor/BASELINE.json`. Contains:
- Per-step screenshot hashes (from prior successful runs)
- Expected element selectors
- Expected load time thresholds
- Last-captured baseline timestamp per step

If the file is empty, this is **warmup run #1**. Walk through every step, record baselines, DO NOT file any regression issues. Future runs will diff against these baselines.

## 2. Preflight Check

Before launching Playwright:

```bash
# mcmforge.com redirects to login when unauthenticated, so 200/301/302/307 are all "alive"
STATUS=$(curl -sI -o /dev/null -w "%{http_code}" https://mcmforge.com)
case "$STATUS" in
  200|301|302|307|308) echo "mcmforge alive ($STATUS)" ;;
  *) echo "mcmforge DOWN: $STATUS"; exit 1 ;;
esac

# Supabase: any non-5xx response means the server is up.
# 401/403 = "alive, rejecting unauthenticated request" — that's fine for liveness.
STATUS=$(curl -sI -o /dev/null -w "%{http_code}" https://ncwxeeqvujgyiggkviqq.supabase.co/rest/v1/)
if [ "$STATUS" -ge 500 ] || [ "$STATUS" -eq 0 ]; then
  echo "supabase DOWN: $STATUS"; exit 1
else
  echo "supabase alive ($STATUS)"
fi
```

If either is genuinely down (5xx, connection refused, DNS failure), append a LESSONS.md entry "preflight failed — <service>" and exit cleanly. Don't file a Forge issue (Hourly Factory Health Alert covers infra).

**Verified Apr 9 2026:** mcmforge.com returns 307 unauthenticated. Supabase `/rest/v1/` returns 401 unauthenticated. Both are alive — these are NOT failures.

## 3. Launch Playwright via MCP

Use the `mcp__plugin_playwright_playwright__*` tools. They're already configured.

1. `browser_navigate` to `https://mcmforge.com`
2. Take baseline screenshot (`browser_take_screenshot`)
3. Wait for auth redirect or dashboard load

## 4. Execute the 14-Step Flow

For each step in the flow (see AGENTS.md):
- Perform the action (`browser_click`, `browser_type`, etc.)
- Take a screenshot with a named path: `dogfood-<YYYY-MM-DD>-step<N>.png`
- Snapshot the DOM (`browser_snapshot`) to verify expected elements
- Capture console messages (`browser_console_messages`)
- Capture network requests (`browser_network_requests`) for the step
- Record elapsed time

## 5. Diff Against Baseline

For each step, compare this run's capture to the baseline:
- **Screenshot:** use `dispatcher/visual-verify.ts` → `pixelDiff()` pure function. Compute `diffPercent`. Anything > 5% = flag.
- **Selectors:** if a baseline selector is now missing from DOM, flag.
- **Network:** if a baseline request is missing or a new 4xx/5xx appeared, flag.
- **Timing:** if step took > 2x baseline time OR absolute > 5 seconds, flag.
- **Console:** if new errors appeared, flag.

Classify each flag per AGENTS.md severity table.

## 6. Cleanup

Navigate to `/issues`, search for `DOGFOOD_TEST_<today>`, cancel the test issue via the UI (or via direct API call if the UI cancel button is what failed).

If cleanup fails, note it in a LESSONS.md entry. Do not leave test issues in the DB.

## 7. Upload Screenshots

For every screenshot captured, upload to Supabase Storage:
- Bucket: `artifacts`
- Path: `dogfood-audit/<YYYY-MM-DD>/step<N>-<name>.png`

Reuse the `uploadScreenshot()` helper from `dispatcher/visual-verify.ts` if possible. Or use Supabase Storage REST API directly.

## 8. Dedup Check

Before filing issues, query existing `[dogfood]` issues:

```sql
SELECT id, title FROM forge.issues
WHERE company_id = '170ebe36-d689-4f15-91f1-7474df6c98cd'
  AND title ILIKE '[dogfood]%'
  AND status NOT IN ('done', 'cancelled', 'approved');
```

If today's failure matches an open one (same title after stripping timestamps), comment instead of filing new.

## 9. File Issues

For each distinct non-duplicate failure, POST per AGENTS.md template. Set priority per severity table.

## 10. Update Baseline

**Only update baselines for steps that passed.** Failed steps keep the old baseline so tomorrow can re-detect the regression.

For passing steps, update `BASELINE.json` entry with:
- New screenshot hash
- New step timing (rolling avg of last 7 successful runs)
- Confirmed selectors list

## 11. Post Daily Digest

Post per AGENTS.md format to your own routine issue.

## 12. Append Lessons Learned (MANDATORY — before exit)

For every non-trivial bug this run (flaky selector, auth redirect loop, Playwright timeout, unexpected modal), append to the TOP of `companies/mcm-forge/agents/dashboard-dogfood-auditor/LESSONS.md`. Commit with your work.

## 13. Exit

Clean exit. Your deliverables are the digest, filed issues, and updated baseline.
