-- ============================================
-- MCM Forge Session 11: Approval Flow Migration
-- Run in BRAIN Supabase (ncwxeeqvujgyiggkviqq)
-- ============================================

-- 1. Add approval token and PR tracking to approval_queue
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_queue' AND column_name = 'approval_token'
  ) THEN
    ALTER TABLE approval_queue ADD COLUMN approval_token TEXT UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_queue' AND column_name = 'pr_url'
  ) THEN
    ALTER TABLE approval_queue ADD COLUMN pr_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_queue' AND column_name = 'pr_number'
  ) THEN
    ALTER TABLE approval_queue ADD COLUMN pr_number INTEGER;
  END IF;
END $$;

-- Index for fast token lookup from edge function
CREATE INDEX IF NOT EXISTS idx_approval_queue_token ON approval_queue (approval_token) WHERE approval_token IS NOT NULL;
