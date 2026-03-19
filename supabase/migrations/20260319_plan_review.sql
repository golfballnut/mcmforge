-- Plan Review Loop: add columns to task_queue for plan tracking
-- 2026-03-19

-- review_tier: low (skip), medium (auto-approve after 3), high (escalate to Steve)
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS review_tier TEXT DEFAULT 'low';

-- plan_text: the current/final plan text
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS plan_text TEXT;

-- plan_score: last review score (0-10)
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS plan_score INTEGER;

-- plan_feedback: last reviewer feedback
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS plan_feedback TEXT;

-- plan_iterations: how many generate/review rounds occurred
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS plan_iterations INTEGER DEFAULT 0;

-- Index for filtering tasks by review tier (useful for dashboards)
CREATE INDEX IF NOT EXISTS idx_task_queue_review_tier
  ON task_queue(review_tier)
  WHERE review_tier != 'low';

-- Plan tracking in skill_metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skill_metrics' AND column_name = 'plan_review_score'
  ) THEN
    ALTER TABLE skill_metrics ADD COLUMN plan_review_score INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'skill_metrics' AND column_name = 'plan_iterations'
  ) THEN
    ALTER TABLE skill_metrics ADD COLUMN plan_iterations INTEGER;
  END IF;
END $$;
