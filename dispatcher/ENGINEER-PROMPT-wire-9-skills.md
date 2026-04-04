# Engineer Prompt: Wire 9 New Skills into Dispatcher + Fix Scheduler

## Context
9 new skill specs have been drafted in `vault/agents/skills/`. They need to be registered in the dispatcher and scheduled in night-ops. Additionally, the existing scheduler has bugs — most schedules have `next_run_at = NULL` which means they never fire.

## Task 1: Add new skills to VALID_SKILLS

**File:** `dispatcher/dispatcher.ts` line 133

Current:
```typescript
const VALID_SKILLS = new Set([
  "poi-research", "competitive-scan", "code-review", "visual-bug-fix",
  "plan-then-code", "tdd-workflow", "shipping-checklist", "codebase-aware",
  "feature-proposal", "daily-ops", "plan-reviewer", "ai-daily-intel", "social-intel",
]);
```

Add these 9 new skills:
```
"competitor-price-monitor", "app-store-monitor", "google-trends-pulse",
"trail-closure-monitor", "youtube-niche-monitor", "supplier-news-monitor",
"skill-gotchas-flywheel", "gmail-draft-outreach", "competitor-job-postings",
"system-health"
```

(Note: `system-health` is already in skill_schedule but missing from VALID_SKILLS.)

## Task 2: Update FALLBACK_ORCHESTRATOR_PROMPT

**File:** `dispatcher/dispatcher.ts` line 140

Add the new skills to the prompt so the Gemini orchestrator can classify tasks into them:
- competitor-price-monitor (competitor golf ball pricing)
- app-store-monitor (track competitor app updates/reviews)
- google-trends-pulse (search volume trends)
- trail-closure-monitor (forest service/BLM trail closures)
- youtube-niche-monitor (golf/trail YouTube content tracking)
- supplier-news-monitor (golf ball manufacturer news)
- skill-gotchas-flywheel (meta: improve other skills from failures)
- gmail-draft-outreach (create procurement email drafts)
- competitor-job-postings (competitor hiring signals)

## Task 3: Insert skill_schedule rows

Run this SQL migration (or apply via Supabase Dashboard):

```sql
-- Fix existing NULL next_run_at values (BUG: scheduler skips rows with NULL next_run_at)
UPDATE skill_schedule SET next_run_at = NOW() WHERE next_run_at IS NULL;

-- Remove duplicate social-intel entries (there are 3 identical rows)
DELETE FROM skill_schedule
WHERE skill_name = 'social-intel'
AND id NOT IN (
  SELECT id FROM skill_schedule WHERE skill_name = 'social-intel' ORDER BY created_at LIMIT 1
);

-- Remove duplicate competitive-scan entries (keep only Monday)
DELETE FROM skill_schedule
WHERE skill_name = 'competitive-scan'
AND cron_expression != '0 7 * * 1';

-- Insert 9 new skills
-- All times are UTC. ET offset: UTC-4 (EDT)
-- 3 AM ET = 7 UTC, 4 AM ET = 8 UTC, etc.

INSERT INTO skill_schedule (skill_name, cron_expression, enabled, next_run_at, cli_target, task_type, priority, cost_cap, company_id, task_description_template)
VALUES
  -- Daily intelligence (staggered)
  ('competitor-price-monitor', '0 7 * * *', true, NOW(), 'claude', 'research', 3, 1.50,
   (SELECT id FROM company_registry WHERE slug = 'links-choice' LIMIT 1),
   'Scrape competitor golf ball prices for {company_name}. Compare to yesterday. Flag opportunities.'),

  ('app-store-monitor', '0 8 * * *', true, NOW(), 'claude', 'research', 3, 1.00,
   (SELECT id FROM company_registry WHERE slug = 'dirtsync' LIMIT 1),
   'Check iOS/Google Play for OnX, AllTrails, GAIA GPS updates. Flag version changes, rating drops, 1-star reviews.'),

  ('google-trends-pulse', '0 9 * * *', true, NOW(), 'claude', 'research', 3, 1.00,
   (SELECT id FROM company_registry WHERE slug = 'mcmforge' LIMIT 1),
   'Check Google Trends for trail app, recycled golf balls, and related keywords. Flag breakouts.'),

  ('trail-closure-monitor', '0 10 * * *', true, NOW(), 'claude', 'research', 2, 1.50,
   (SELECT id FROM company_registry WHERE slug = 'dirtsync' LIMIT 1),
   'Check Forest Service, BLM, Hatfield-McCoy, WV State Parks for trail closures. P0 = safety-critical.'),

  ('youtube-niche-monitor', '0 11 * * *', true, NOW(), 'claude', 'research', 4, 0.50,
   (SELECT id FROM company_registry WHERE slug = 'mcmforge' LIMIT 1),
   'Scan golf + UTV + overlanding YouTube channels for new videos. Flag competitor mentions and content gaps.'),

  ('supplier-news-monitor', '0 12 * * *', true, NOW(), 'claude', 'research', 3, 1.00,
   (SELECT id FROM company_registry WHERE slug = 'links-choice' LIMIT 1),
   'Check Titleist, Callaway, TaylorMade, Bridgestone for new releases, price changes, discontinuations.'),

  ('skill-gotchas-flywheel', '0 3 * * *', true, NOW(), 'claude', 'ops', 2, 1.00,
   (SELECT id FROM company_registry WHERE slug = 'mcmforge' LIMIT 1),
   'Analyze last 24h task failures. Propose skill improvements as Google Docs. Process previous approvals/rejections.'),

  -- Weekly
  ('gmail-draft-outreach', '0 11 * * 1', true, NOW(), 'claude', 'ops', 3, 1.00,
   (SELECT id FROM company_registry WHERE slug = 'links-choice' LIMIT 1),
   'Read Links Choice prospect sheet. Generate personalized Gmail drafts for procurement outreach. DRAFTS ONLY — never send.'),

  ('competitor-job-postings', '0 11 * * 3', true, NOW(), 'claude', 'research', 4, 0.50,
   (SELECT id FROM company_registry WHERE slug = 'mcmforge' LIMIT 1),
   'Check OnX, AllTrails, Vice Golf, Lost Golf Balls career pages. What they hire = what they build next.')
ON CONFLICT DO NOTHING;
```

## Task 4: Verify skill_versions auto-seeding picks up new skills

The dispatcher auto-seeds skill_versions on startup from vault_docs. Verify that vault-sync has run and the 9 new skill files are in `vault_docs` table. If not, trigger a vault sync:
```bash
cd /Users/dirtsyncmini/MCMForge && npx tsx vault-sync.ts
```

## Acceptance Criteria
- [ ] VALID_SKILLS contains all 24 skill names
- [ ] FALLBACK_ORCHESTRATOR_PROMPT lists all 24 skills with short descriptions
- [ ] skill_schedule has 9 new rows with next_run_at initialized (not NULL)
- [ ] Existing NULL next_run_at values are fixed
- [ ] Duplicate social-intel and competitive-scan entries cleaned up
- [ ] PR created, CI passes
- [ ] After merge + deploy to Mini: verify with `SELECT skill_name, next_run_at FROM skill_schedule ORDER BY skill_name`

## Files to Modify
1. `dispatcher/dispatcher.ts` — lines 133-140 (VALID_SKILLS + orchestrator prompt)
2. SQL migration for skill_schedule

## DO NOT MODIFY
- Night-ops scheduler logic (it works, the data was wrong)
- Dispatcher polling, CLI args, or session management
- Any .env files
