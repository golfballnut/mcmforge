# Skill: Trail Closure Monitor

## Purpose
Monitor official trail closures, new openings, and seasonal restrictions from Forest Service, BLM, and state park systems. Safety-critical for DirtSync — routing users to a closed trail is a liability and trust-killer.

## When to Use
- Scheduled: daily at 6 AM ET
- On-demand: before DirtSync trail data updates or field tests

## Companies
- **DirtSync** — primary beneficiary (trail data accuracy and user safety)

## Sources to Monitor

### Federal
1. **USFS (Forest Service)** — recreation.gov alerts, individual forest pages
2. **BLM (Bureau of Land Management)** — blm.gov/visit/recreation alerts
3. **NPS (National Park Service)** — nps.gov/conditions (for parks with OHV trails)

### State Systems (DirtSync Launch Region — WV, KY, VA)
4. **WV State Parks** — wvstateparks.com trail alerts
5. **Hatfield-McCoy Trails** — trailsheaven.com/trail-conditions
6. **Kentucky State Parks** — parks.ky.gov alerts
7. **Virginia DGIF** — dwr.virginia.gov (public lands with OHV access)

### Trail System Direct Sources
8. **Individual trail system websites** — many post conditions on Facebook/social
9. **Trail system Facebook pages** — often the first place closures are announced
10. **Local rider forums/groups** — word-of-mouth closures

## Closure Types to Track
- **Full closure**: trail system completely closed (weather, damage, legal)
- **Partial closure**: specific trails/sections closed within an open system
- **Seasonal closure**: predictable annual closures (winter, mud season)
- **Emergency closure**: fire, flood, landslide, bridge failure
- **New opening**: trail system or section opened — ADD to DirtSync data
- **Restriction change**: vehicle type restrictions (ATV-only, no UTVs, etc.)

## Execution Steps

### Step 1: Check Official Sources
For each source in the monitor list:
- Check for new alerts, closures, or condition updates
- Check social media pages for informal announcements
- Note date of last update (stale = possibly outdated)

### Step 2: Cross-Reference with DirtSync Data
For each closure found:
- Is this trail system in DirtSync? If yes → flag for data update
- Is this a system we should ADD to DirtSync? If yes → flag as opportunity
- Does this affect any active routes or POIs?

### Step 3: Classify Urgency
- **P0 — Safety**: trail closed due to hazard (bridge out, flooding) and DirtSync still shows it open → IMMEDIATE action
- **P1 — Accuracy**: seasonal closure, DirtSync data needs update → same-day action
- **P2 — Opportunity**: new trail opened → add to backlog

### Step 4: Generate Report
Post to war room with DirtSync company tag. P0 items trigger escalation email.

## Output Format
```markdown
# 🚧 Trail Closure Monitor — [DATE]

## P0 — Safety (Immediate Action Required)
| System | Trail/Section | Reason | Source | DirtSync Status |
|--------|--------------|--------|--------|-----------------|
| Hatfield-McCoy | Rockhouse section B | Bridge washed out | FB post 3/20 | SHOWS OPEN — UPDATE NOW |

## P1 — Accuracy (Same-Day Update)
| System | Trail/Section | Reason | Effective Date | Duration |
|--------|--------------|--------|---------------|----------|
| Pinnacle Creek | North loop | Seasonal mud closure | Mar 15 | Until Apr 15 |

## P2 — Opportunities (New Openings)
| System | Details | Location | Action |
|--------|---------|----------|--------|
| New River Trail | 5 miles of new ATV trail | Fayette County, WV | Add to DirtSync |

## No Changes
- Indian Ridge: open, no alerts
- Devil Anse: open, no alerts
- Bearwallow: open, conditions good

## Sources Checked
- ✅ Hatfield-McCoy website (updated 3/19)
- ✅ WV State Parks (updated 3/18)
- ⚠️ USFS Monongahela (last update 3/1 — possibly stale)
```

## Model Recommendation
- **CLI**: Claude (web scraping + search)
- **Model**: sonnet
- **Timeout**: 20 minutes (many sources to check)
- **Cost cap**: $1.50

## Gotchas
- Many trail systems announce closures on Facebook BEFORE their website — check both
- Forest Service websites are notoriously slow to update — cross-reference with social
- Seasonal closures are predictable — build a calendar of known annual closures
- Some closures are announced verbally at trailheads only — can't catch these
- Weather-related closures can change daily — timestamp everything
- State park websites vary wildly in quality — some have alerts pages, some don't

## Schedule
Daily at 6 AM ET. P0 items trigger immediate escalation email to steve@linkschoice.com.

## Data Persistence
- Store daily checks in war room (company: dirtsync, type: trail_closure)
- Maintain a running "closure registry" — open/closed status for each monitored system
- Archive resolved closures with resolution date

## Related Skills
- poi-research (trail system data)
- competitive-scan (competitor coverage of closed/open trails)
- social-intel (Facebook/Reddit trail condition reports)
