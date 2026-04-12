# TOOLS.md — Dashboard Dogfood Auditor

Playwright MCP commands, baseline schema, screenshot helpers.

---

## Playwright MCP Tools You Use

All available via `mcp__plugin_playwright_playwright__*`:
- `browser_navigate(url)` — go to a URL
- `browser_click(selector)` — click an element
- `browser_type(selector, text)` — type into an input
- `browser_take_screenshot(filename)` — capture PNG
- `browser_snapshot()` — DOM accessibility tree
- `browser_console_messages()` — drain browser console
- `browser_network_requests()` — drain network log
- `browser_wait_for(selector or text)` — wait for an element/text
- `browser_close()` — close the browser

Always `browser_close()` at the end of every run, even on failure.

---

## The 14-Step Flow — Exact Commands

```
Step 1: Login
  browser_navigate("https://mcmforge.com")
  browser_wait_for(text="Sign in" OR text="Dashboard")
  # If login required, the auth flow needs an existing Supabase session.
  # Best path: use a stored auth cookie from a prior session.

Step 2: Dashboard initial load
  browser_wait_for(selector="[data-testid='agent-cards']" OR text="Agents")
  browser_take_screenshot("dogfood-step2-dashboard.png")
  browser_snapshot()
  Verify: at least 1 agent card present
  Verify: live count badge present
  Capture network: which Supabase queries fired

Step 3: Switch company MCM Forge → DirtSync
  browser_click(selector for DirtSync icon in sidebar — likely [title="DirtSync"])
  browser_wait_for(text="DirtSync")
  browser_take_screenshot("dogfood-step3-dirtsync.png")
  Verify: sidebar header now says "DirtSync"
  Verify: agent list changed (different count or different names)

Step 4: Open /agents
  browser_navigate("https://mcmforge.com/agents")
  browser_wait_for(selector="[data-testid='agents-list']" OR text="Map Rendering")
  browser_take_screenshot("dogfood-step4-agents.png")
  Verify: only DirtSync agents visible (no MCM Forge agents like "Factory Analyst")

Step 5: Open /issues
  browser_navigate("https://mcmforge.com/issues")
  browser_wait_for(text="BM1c" OR text="Issue")
  browser_take_screenshot("dogfood-step5-issues.png")
  Verify: at least 1 issue visible
  Verify: no MCM Forge issues (no "FORGE-" prefix)

Step 6: Open an issue detail
  browser_click(first issue link)
  browser_wait_for(text="Status" or text="Comments")
  browser_take_screenshot("dogfood-step6-issue-detail.png")
  Verify: issue detail renders, comments section present

Step 7: Create a test issue
  browser_navigate("https://mcmforge.com/issues/new")
  browser_type("[name='title']", "DOGFOOD_TEST_<timestamp>")
  browser_type("[name='description']", "Automated dogfood audit run. Will be cancelled at end of audit.")
  browser_click("[type='submit']" or text="Create")
  browser_wait_for(text="DOGFOOD_TEST")
  Capture: created issue ID from URL or DOM
  browser_take_screenshot("dogfood-step7-test-issue-created.png")

Step 8: Post a comment on test issue
  browser_type("[name='comment']", "Dogfood audit comment — will be cancelled.")
  browser_click(text="Comment" or "Submit")
  browser_wait_for(text="Dogfood audit comment")
  browser_take_screenshot("dogfood-step8-comment.png")

Step 9: Switch back DirtSync → MCM Forge
  browser_click(selector for MCM Forge icon in sidebar)
  browser_wait_for(text="MCM Forge")
  browser_take_screenshot("dogfood-step9-back-to-mcmforge.png")
  Verify: sidebar shows MCM Forge agents now (Factory Analyst, etc.)

Step 10: Verify test issue NOT visible
  browser_navigate("https://mcmforge.com/issues")
  browser_wait_for(selector="[data-testid='issues-list']" OR text="No issues")
  Verify: DOGFOOD_TEST issue is NOT in the list (it belongs to DirtSync)
  CRITICAL FAIL if visible — that's the routing bug regressing
  browser_take_screenshot("dogfood-step10-mcmforge-issues.png")

Step 11: Open /costs
  browser_navigate("https://mcmforge.com/costs")
  browser_wait_for(text="Cost" or "$")
  browser_take_screenshot("dogfood-step11-costs.png")

Step 12: Open /routines
  browser_navigate("https://mcmforge.com/routines")
  browser_wait_for(text="Cron" or text="Routine")
  browser_take_screenshot("dogfood-step12-routines.png")

Step 13: Open /activity
  browser_navigate("https://mcmforge.com/activity")
  browser_wait_for(text="Activity" or text="Recent")
  browser_take_screenshot("dogfood-step13-activity.png")

Step 14: Cleanup — cancel test issue
  Switch to DirtSync (click sidebar icon)
  browser_navigate(`https://mcmforge.com/issues/<test_issue_id>`)
  Find cancel/delete button (or use API: PATCH /api/agent/issues/<id> with status=cancelled)
  browser_take_screenshot("dogfood-step14-cleanup.png")
  Verify: test issue status is cancelled

  browser_close()
```

---

## BASELINE.json Schema

```json
{
  "warmup_complete": false,
  "first_run_utc": null,
  "last_run_utc": null,
  "steps": {
    "1": {
      "name": "Login",
      "screenshot_url": "https://...supabase.co/storage/.../step1.png",
      "screenshot_hash": "<sha256>",
      "expected_selectors": ["[data-testid='dashboard']"],
      "expected_load_ms": 1500,
      "rolling_avg_load_ms": 1200,
      "successful_runs": 0,
      "last_pass_utc": null
    }
  }
}
```

On warmup run: capture all 14 step baselines, set `warmup_complete: true`. No regression detection.
On subsequent runs: diff against baselines.

---

## Pixel Diff via dispatcher/visual-verify.ts

```typescript
// Import from the existing helper
import { pixelDiff, takeScreenshot } from "../../../../dispatcher/visual-verify.ts";

// pixelDiff is pure: takes two PNG buffers, returns { diffPercent, diffPixels, totalPixels }
const result = pixelDiff(currentBuffer, baselineBuffer);
if (result.diffPercent > 5.0) {
  // flag as regression
}
```

Threshold: 5% pixel diff (dashboard has live data so slight changes are normal).

---

## Cleanup SQL (fallback if UI cancel fails)

```sql
UPDATE forge.issues
SET status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
WHERE title LIKE 'DOGFOOD_TEST_%'
  AND created_at > now() - interval '1 hour'
  AND status NOT IN ('cancelled', 'done');
```

Run this at the END of every audit, regardless of whether UI cleanup succeeded. Belt and suspenders.

---

## Cost Targets

- Playwright run: ~14 page navigations + 14 screenshots + DOM snapshots
- Vision tokens (Claude Sonnet for screenshot interpretation): ~50K tokens/run
- Issue filing: 0-3 issues/day on average

Target: $0.80/day using Claude Sonnet 4.6.
Hard cap: $2.00/day. If exceeded, downgrade screenshot analysis to text-only mode in next run.
