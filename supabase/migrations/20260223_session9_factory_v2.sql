-- ============================================
-- MCM Forge Session 9: Factory v2 Migration
-- Run this in the BRAIN Supabase (ncwxeeqvujgyiggkviqq)
-- ============================================

-- 1. System Config (Kill Switch + Global Settings)
-- ============================================
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system'
);

INSERT INTO system_config (key, value, description) VALUES
  ('dispatcher_status', 'active', 'Kill switch: active or paused'),
  ('coo_mode', 'on_demand', 'COO mode: always_on, on_demand, disabled'),
  ('default_cost_cap', '2', 'Default cost cap per task in USD'),
  ('max_cost_cap', '5', 'Maximum cost cap per task in USD')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON system_config
  FOR ALL USING (auth.uid() IS NOT NULL);

-- 2. Add new columns to task_queue
-- (cli_target already exists — only add task_type, cost_cap, result_summary, artifact_url)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_queue' AND column_name = 'task_type'
  ) THEN
    ALTER TABLE task_queue ADD COLUMN task_type TEXT DEFAULT 'code'
      CHECK (task_type IN ('code', 'research', 'content', 'ops', 'chat'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_queue' AND column_name = 'cost_cap'
  ) THEN
    ALTER TABLE task_queue ADD COLUMN cost_cap NUMERIC(6,2) DEFAULT 2.00;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_queue' AND column_name = 'result_summary'
  ) THEN
    ALTER TABLE task_queue ADD COLUMN result_summary TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_queue' AND column_name = 'artifact_url'
  ) THEN
    ALTER TABLE task_queue ADD COLUMN artifact_url TEXT;
  END IF;
END $$;

-- 3. Add 'task_completion' to approval_queue approval_type CHECK
-- ============================================
ALTER TABLE approval_queue DROP CONSTRAINT IF EXISTS approval_queue_approval_type_check;
ALTER TABLE approval_queue ADD CONSTRAINT approval_queue_approval_type_check
  CHECK (approval_type IN ('pr_merge', 'deploy', 'email_send', 'spending', 'new_company', 'strategy', 'task_completion'));

-- 4. Artifacts Storage Bucket
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('artifacts', 'artifacts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload artifacts
CREATE POLICY "authenticated_upload_artifacts" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'artifacts' AND auth.uid() IS NOT NULL
  );

-- Public read for artifacts
CREATE POLICY "public_read_artifacts" ON storage.objects
  FOR SELECT USING (bucket_id = 'artifacts');
