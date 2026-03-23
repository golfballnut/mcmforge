-- Wire 9 new skills into skill_schedule + fix scheduler bugs
-- Apply via Supabase Dashboard SQL Editor after PR merge

-- 1. Fix existing NULL next_run_at values
-- BUG: Postgres .lte(col, now) skips NULLs, so skills with NULL next_run_at never fire
UPDATE skill_schedule SET next_run_at = NOW() WHERE next_run_at IS NULL;

-- 2. Remove duplicate social-intel entries (there are 3 identical rows — keep oldest)
DELETE FROM skill_schedule
WHERE skill_name = 'social-intel'
AND id NOT IN (
  SELECT id FROM skill_schedule WHERE skill_name = 'social-intel' ORDER BY created_at LIMIT 1
);

-- 3. Remove duplicate competitive-scan entries (keep only Monday cron)
DELETE FROM skill_schedule
WHERE skill_name = 'competitive-scan'
AND cron_expression != '0 7 * * 1';

-- 4. Insert 9 new skills
-- All times are UTC. ET offset: UTC-4 (EDT)
-- 3 AM ET = 7 UTC, 4 AM ET = 8 UTC, 5 AM = 9, 6 AM = 10, 7 AM = 11, 8 AM = 12, 11 PM ET = 3 UTC next day

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
