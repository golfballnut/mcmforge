-- Skill Version Tracking for Autoresearch pattern
-- Run against MCM Forge Supabase (ncwxeeqvujgyiggkviqq)

-- ============================================
-- Table: skill_versions
-- ============================================

CREATE TABLE IF NOT EXISTS skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  prompt_hash TEXT NOT NULL,
  changelog TEXT,
  is_active BOOLEAN DEFAULT true,
  avg_execution_ms NUMERIC,
  avg_cost_cents NUMERIC,
  success_rate NUMERIC,
  total_runs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(skill_name, version)
);

-- Index for fast lookup by skill_name + prompt_hash (hot path in recordSkillMetrics)
CREATE INDEX IF NOT EXISTS idx_skill_versions_name_hash
  ON skill_versions(skill_name, prompt_hash);

-- Index for finding the active version per skill
CREATE INDEX IF NOT EXISTS idx_skill_versions_active
  ON skill_versions(skill_name, is_active)
  WHERE is_active = true;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skill_versions_select" ON skill_versions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "skill_versions_insert" ON skill_versions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "skill_versions_update" ON skill_versions
  FOR UPDATE TO authenticated USING (true);

-- ============================================
-- Add columns to skill_metrics
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skill_metrics' AND column_name = 'skill_version'
  ) THEN
    ALTER TABLE skill_metrics ADD COLUMN skill_version INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skill_metrics' AND column_name = 'quality_score'
  ) THEN
    ALTER TABLE skill_metrics ADD COLUMN quality_score NUMERIC;
  END IF;
END $$;

-- Index for filtering metrics by version
CREATE INDEX IF NOT EXISTS idx_skill_metrics_version
  ON skill_metrics(skill_name, skill_version)
  WHERE skill_version IS NOT NULL;
