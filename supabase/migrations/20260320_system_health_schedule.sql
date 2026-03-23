-- System Health: daily infrastructure health check
-- Runs at 9:00 UTC (4 AM ET) — before ai-daily-intel (5 AM) and social-intel (6 AM)
-- Company: MCM Forge (platform-level check)

INSERT INTO skill_schedule (
  skill_name, company_id, cli_target, cron_expression,
  task_type, priority, cost_cap, next_run_at, task_description_template
)
SELECT
  'system-health',
  cr.id,
  'claude',
  '0 9 * * *',
  'ops',
  'high',
  1.0,
  date_trunc('day', NOW()) + INTERVAL '1 day' + INTERVAL '9 hours',
  'Run daily system health check for MCM Forge infrastructure. Check Mac Mini system (disk, memory, load, PM2), Supabase (MCM Forge brain + DirtSync), Google Workspace OAuth, Vercel deployments, Anthropic API key, Resend email service, GitHub CLI auth, and Tailscale VPN. Report red/yellow/green status for each service. Date: {date}'
FROM company_registry cr
WHERE cr.slug = 'mcmforge'
ON CONFLICT (skill_name, company_id) DO NOTHING;
