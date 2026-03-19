-- Skill Scheduler: automated recurring skill execution
-- Run against MCM Forge Supabase (ncwxeeqvujgyiggkviqq)

-- ============================================
-- Table: skill_schedule
-- ============================================

CREATE TABLE IF NOT EXISTS skill_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name TEXT NOT NULL,
  company_id UUID REFERENCES company_registry(id),
  cli_target TEXT NOT NULL DEFAULT 'claude',
  cron_expression TEXT NOT NULL,       -- 5-field: min hour dom month dow (UTC)
  task_type TEXT NOT NULL DEFAULT 'research',
  priority TEXT NOT NULL DEFAULT 'low',
  cost_cap NUMERIC DEFAULT 2.0,
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  task_description_template TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(skill_name, company_id)
);

-- Index for the hot path: find due schedules
CREATE INDEX IF NOT EXISTS idx_skill_schedule_due
  ON skill_schedule(next_run_at)
  WHERE enabled = true;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE skill_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skill_schedule_select" ON skill_schedule
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "skill_schedule_insert" ON skill_schedule
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "skill_schedule_update" ON skill_schedule
  FOR UPDATE TO authenticated USING (true);

-- ============================================
-- Seed: competitive-scan for DirtSync
-- Monday 7:00 UTC = 2:00 AM ET
-- ============================================

INSERT INTO skill_schedule (
  skill_name, company_id, cli_target, cron_expression,
  task_type, priority, cost_cap, next_run_at, task_description_template
)
SELECT
  'competitive-scan',
  cr.id,
  'gemini',
  '0 7 * * 1',
  'research',
  'low',
  2.0,
  (date_trunc('week', NOW()) + INTERVAL '7 days' + INTERVAL '7 hours'),
  'Run competitive scan for {company_name}: crawl OnX Offroad, Trails Offroad, GAIA GPS. Diff features, pricing changes, app store reviews, social media activity. Date: {date}'
FROM company_registry cr
WHERE cr.slug = 'dirtsync'
ON CONFLICT (skill_name, company_id) DO NOTHING;
