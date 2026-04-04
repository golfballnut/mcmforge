# Skill: Gmail Draft Outreach

## Purpose
Automatically generate personalized Gmail drafts for Links Choice procurement outreach. Reads the prospect sheet, generates a custom email for each prospect based on their state, company type, and volume potential, and saves as a draft for Steve to review and send.

## When to Use
- Scheduled: weekly on Monday at 7 AM ET
- On-demand: when new prospects are added to the sheet

## Companies
- **Links Choice** — recycled golf ball procurement (primary)
- **Golf Ball Nut** — potential supplier outreach (secondary)

## Prerequisites
- Google Sheets access to prospect sheet
- Gmail draft creation via Google Workspace API
- Prospect sheet ID: reference `reference_drive_folder_ids.md` for Links Choice folder

## Prospect Sheet Format
Expected columns:
| Company | Contact | Email | State | Type | Volume Est | Status | Notes |
|---------|---------|-------|-------|------|-----------|--------|-------|
| ABC Golf | John Smith | john@abc.com | FL | Course | 50K/yr | TODO | Has range too |

Status values: TODO → DRAFTED → SENT → REPLIED → CONVERTED → DECLINED

## Execution Steps

### Step 1: Read Prospect Sheet
- Fetch all rows where Status = TODO
- Group by state/region for batch processing
- Skip rows with no email address

### Step 2: Classify Prospect Type
Each prospect gets a tailored pitch based on type:
- **Golf Course**: "We buy your range balls and lake balls. You clear inventory, we pay cash."
- **Driving Range**: "Your worn-out range balls are worth money. We buy in bulk."
- **Golf Ball Retriever/Diver**: "We buy direct from divers. Better margins than selling to middlemen."
- **Recycler/Processor**: "We buy sorted, graded inventory. Titleist Pro V1 Mint through bulk mixed."
- **Liquidator/Closeout**: "We buy overstock and closeout golf ball inventory at scale."

### Step 3: Generate Personalized Draft
For each prospect, create a Gmail draft:
- **From**: steve@linkschoice.com (or configured sender)
- **To**: prospect email
- **Subject**: personalized based on type and state
- **Body**: 3-4 paragraphs max. Friendly, direct, mention their state/region. Include:
  - Who Links Choice is (20M+ balls/year plant)
  - What we buy and our price range
  - Why they should sell to us (cash payment, bulk pickup, repeat business)
  - Clear CTA (reply with inventory list or call)

### Step 4: Update Sheet
- Set Status = DRAFTED for each prospect processed
- Add draft date to Notes column
- Do NOT send — drafts only (CRITICAL: agents NEVER send email)

### Step 5: Report
Post summary to war room: how many drafts created, by state, by type.

## Output Format
```markdown
# 📧 Outreach Drafts Created — [DATE]

## Summary
- Prospects processed: 12
- Drafts created: 10
- Skipped (no email): 2

## By State
| State | Drafts | Types |
|-------|--------|-------|
| FL | 3 | 2 courses, 1 retriever |
| TX | 2 | 1 range, 1 liquidator |
| GA | 2 | 2 courses |

## Sample Subject Lines
- "Links Choice — Buying Range Balls in Florida (Cash, Bulk Pickup)"
- "20M Ball/Year Plant Looking for Texas Suppliers"

## Action Required
Steve: review 10 drafts in Gmail, edit as needed, send.
```

## Email Templates

### Golf Course Template
Subject: Links Choice — Buying Used Golf Balls in [STATE]

Hi [CONTACT],

I'm Steve McMillian with Links Choice. We operate a 20-million-ball-per-year processing plant and we're always looking for quality sources.

We buy range balls, lake balls, and any used golf ball inventory — sorted or unsorted. We pay cash and arrange pickup for bulk quantities.

If you've got inventory sitting around, I'd love to chat. Even a rough estimate of what you have helps me put together a fair offer.

Best,
Steve McMillian
Links Choice | linkschoice.com

### Retriever/Diver Template
Subject: Direct Buyer for Your Golf Ball Inventory — [STATE]

Hi [CONTACT],

I run Links Choice — we process 20M+ recycled golf balls per year. We buy direct from divers and retrievers, which means better margins for you than selling through middlemen.

We're especially looking for premium brands (Titleist, Callaway, TaylorMade) but we buy everything from Mint to Practice grade.

Current buy prices:
- Nike: $0.15/ball
- Bulk mixed: $0.10/ball
- Premium sorted: priced per brand/grade

Interested? Send me what you've got and I'll make an offer same day.

Steve McMillian
Links Choice | linkschoice.com

## Model Recommendation
- **CLI**: Claude (Google Workspace API via gws)
- **Model**: sonnet
- **Timeout**: 15 minutes
- **Cost cap**: $1.00

## Gotchas
- AGENTS NEVER SEND EMAIL — drafts only. Steve reviews and sends manually.
- Gmail API: use `drafts.create` not `messages.send`
- Personalization matters: generic mass emails get ignored. Include state, company name, prospect type.
- Check for duplicate drafts before creating (don't draft same prospect twice)
- Nike pricing ($0.15) and bulk pricing ($0.10) are current as of Mar 2026 — update if pricing changes

## Schedule
Weekly on Monday at 7 AM ET. Steve reviews drafts throughout the week.

## Data Persistence
- Prospect sheet is the source of truth (status tracking)
- War room post for each batch (company: links_choice, type: outreach_drafts)

## Related Skills
- competitor-price-monitor (pricing context for outreach)
- social-intel (industry chatter that informs outreach timing)
