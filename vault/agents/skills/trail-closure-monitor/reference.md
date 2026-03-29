# trail-closure-monitor: Reference & Gotchas

## Known Scraping Issues (from 2026-03-29 run)
- **wvstateparks.com**: Does NOT expose a live alerts feed. JavaScript-heavy, no structured data endpoint. Always flag for manual check.
- **BLM.gov**: Closures often in PDFs or press releases. Use keyword search on agency office pages.
- **Recreation.gov / RIDB API**: Has public API but closure data is sparse — supplement only.

## Priority Sources — Daily Check (active as of 2026-03-29)
| Source | Reason | URL |
|---|---|---|
| BLM Moab Field Office | Reopen timeline actively evolving | https://www.blm.gov/office/moab-field-office |
| Western Mojave BLM (Barstow FO) | Court order status actively evolving | https://www.blm.gov/office/barstow-field-office |

## Severity Classification
```
P0 = fire, flood, hazard, emergency, law enforcement order
P1 = long-term maintenance (>30 days), seasonal, permit required
P2 = temporary advisory (<7 days), trail work notice
```

## DirtSync Supabase Target
- Project: lldipxvwocpqncixlnxj · Table: trail_closures
- Env: DIRTSYNC_SUPABASE_URL, DIRTSYNC_SUPABASE_SERVICE_KEY

## Reporting Rules
Distinguish clearly:
- "Checked — no closures" (successful scrape, clean)
- "Could not check — HTTP 403/429" (blocked, log error)
- "Manual check required" (scraping: false source)
