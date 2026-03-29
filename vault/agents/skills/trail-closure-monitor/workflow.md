# trail-closure-monitor: Workflow

## Step 1: Load Sources Config
Load `vault/agents/skills/trail-closure-monitor/sources.json` to get the current source list with scraping flags and priorities.

**Daily-priority sources** (check these first, every run):
- BLM Moab Field Office — reopen timeline evolving
- Western Mojave BLM — court order status evolving

**Manual-check-required sources** (cannot scrape — log reminder):
- WV State Parks (wvstateparks.com) — no live alerts feed; check manually at `manual_check_url`

## Step 2: Run Automated Checks
For each source where `scraping: true`:
1. Fetch the alerts/closures page
2. Parse for: trail name, closure reason, start date, expected end date, severity
3. Look for keywords: `closed`, `closure`, `prohibited`, `restricted`, `emergency`, `safety`
4. Classify severity:
   - **P0 (safety-critical):** fire, flood, hazard, emergency, law enforcement
   - **P1 (significant):** long-term maintenance, seasonal, permit required
   - **P2 (advisory):** temporary, expected <7 days

## Step 3: Log Manual-Check Reminders
For each source where `scraping: false`:
- Log: `MANUAL CHECK REQUIRED: {name} — visit {manual_check_url}`
- Include in output report so Trailkeeper/Steve can follow up

## Step 4: Upsert to DirtSync Supabase
For each closure, upsert to `trail_closures` table (DirtSync: `lldipxvwocpqncixlnxj`):
- Fields: trail_name, trail_system, closure_reason, severity, source, source_url, priority, scraping_blocked, manual_check_required, last_verified_at

## Step 5: Generate Report
```
## Trail Closure Monitor — {date}
### P0 Safety-Critical / P1 Significant / P2 Advisory
- [Trail] · [System] · [Reason] · [Source]
### Manual Check Required
- WV State Parks — https://wvstateparks.com/alerts
```

## Step 6: Escalate P0s
If any P0 closure found: create `task_queue` entry with `priority: 1` to notify Steve.
