-- Wire revenue-analyst skill into the scheduler
-- Runs daily at 9 AM ET (13 UTC), after all morning intel skills complete
INSERT INTO skill_schedule (
  skill_name, cron_expression, enabled, next_run_at,
  cli_target, task_type, priority, cost_cap,
  company_id, prompt_override
) VALUES (
  'revenue-analyst',
  '0 13 * * *',
  true,
  NOW(),
  'claude',
  'ops',
  'high',
  1.50,
  (SELECT id FROM company_registry WHERE slug = 'mcmforge' LIMIT 1),
  'Run the revenue-analyst skill. Read all completed task artifacts from the last 24 hours, identify the top 3-5 revenue opportunities across Links Choice, Golf Ball Nut, and Hot Golf Brands, and produce a revenue brief email with specific actionable moves Steve can approve or reject. Use the pricing context in references/pricing-context.md. Focus on money — not infrastructure, not DirtSync (pre-revenue).'
)
ON CONFLICT (skill_name) DO UPDATE SET
  cron_expression = EXCLUDED.cron_expression,
  enabled = EXCLUDED.enabled,
  cli_target = EXCLUDED.cli_target,
  cost_cap = EXCLUDED.cost_cap,
  prompt_override = EXCLUDED.prompt_override;

-- Also add supplier-prospecting to schedule (weekly, different state each week)
INSERT INTO skill_schedule (
  skill_name, cron_expression, enabled, next_run_at,
  cli_target, task_type, priority, cost_cap,
  company_id, prompt_override
) VALUES (
  'supplier-prospecting',
  '0 14 * * 2',
  true,
  NOW(),
  'claude',
  'research',
  'medium',
  2.00,
  (SELECT id FROM company_registry WHERE slug = 'links-choice' LIMIT 1),
  'Run supplier-prospecting for a US state not yet covered. Check the prospect sheet (1xJQU8zn6h_Gbjf4uc1_o52DRr-EK6KFI6NZxnvvVYaY) to see which states are done. Pick the next uncovered state alphabetically. Find golf ball recyclers, range ball suppliers, and bulk used ball sources. Add findings to the prospect sheet.'
)
ON CONFLICT (skill_name) DO UPDATE SET
  cron_expression = EXCLUDED.cron_expression,
  enabled = EXCLUDED.enabled,
  cli_target = EXCLUDED.cli_target,
  cost_cap = EXCLUDED.cost_cap,
  prompt_override = EXCLUDED.prompt_override;
