-- Trail Closures table for DirtSync (project: lldipxvwocpqncixlnxj)
--
-- Stores trail closure data discovered by the trail-closure-monitor skill.
-- Populated by daily automated runs + manual entries for scraping-blocked sources.
--
-- Research findings (2026-03-29):
--   - wvstateparks.com blocked scraping → scraping_blocked=true, manual_check_required=true
--   - BLM Moab reopen timeline actively evolving → source marked daily priority
--   - Western Mojave court order status actively evolving → source marked daily priority

CREATE TABLE IF NOT EXISTS trail_closures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Trail identification
  trail_name            TEXT NOT NULL,
  trail_system          TEXT,

  -- Closure details
  closure_reason        TEXT,
  severity              TEXT DEFAULT 'P2'
    CHECK (severity IN ('P0', 'P1', 'P2')),

  -- Dates
  start_date            DATE,
  expected_end_date     DATE,
  actual_end_date       DATE,
  is_active             BOOLEAN DEFAULT true,

  -- Source tracking
  source                TEXT NOT NULL,
  source_url            TEXT,
  priority              TEXT DEFAULT 'weekly'
    CHECK (priority IN ('daily', 'weekly', 'monthly')),

  -- Scraping metadata (from sources.json)
  scraping_blocked      BOOLEAN DEFAULT false,
  manual_check_required BOOLEAN DEFAULT false,
  manual_check_url      TEXT,

  -- Timestamps
  discovered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate active closures per trail+source
CREATE UNIQUE INDEX IF NOT EXISTS trail_closures_trail_source_idx
  ON trail_closures (trail_name, source)
  WHERE is_active = true;

-- Fast queries for active closures by severity
CREATE INDEX IF NOT EXISTS trail_closures_active_idx
  ON trail_closures (is_active, severity, priority);

-- Fast queries for daily-priority sources needing re-check
CREATE INDEX IF NOT EXISTS trail_closures_priority_idx
  ON trail_closures (priority, last_verified_at)
  WHERE is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_trail_closures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trail_closures_updated_at
  BEFORE UPDATE ON trail_closures
  FOR EACH ROW EXECUTE FUNCTION update_trail_closures_updated_at();

-- Seed known active situations from 2026-03-29 research run
INSERT INTO trail_closures (
  trail_name, trail_system, closure_reason, severity,
  source, source_url, priority,
  scraping_blocked, manual_check_required,
  discovered_at
) VALUES
(
  'BLM Moab — Active Reopen Timeline',
  'BLM Moab Field Office',
  'Reopen timeline actively evolving as of 2026-03-29. Check BLM Moab Field Office for current status.',
  'P1',
  'BLM', 'https://www.blm.gov/office/moab-field-office', 'daily',
  false, false,
  '2026-03-29T00:00:00Z'
),
(
  'Western Mojave — Active Court Order',
  'BLM Barstow Field Office',
  'Court order status actively evolving as of 2026-03-29. Check BLM Barstow Field Office for current ruling.',
  'P1',
  'BLM', 'https://www.blm.gov/office/barstow-field-office', 'daily',
  false, false,
  '2026-03-29T00:00:00Z'
),
(
  'WV State Parks — Manual Check Required',
  'WV State Parks',
  'Automated scraping not available. Manual check required at wvstateparks.com/alerts before each run.',
  'P2',
  'WV State Parks', 'https://wvstateparks.com', 'weekly',
  true, true, 'https://wvstateparks.com/alerts',
  '2026-03-29T00:00:00Z'
)
ON CONFLICT DO NOTHING;

-- RLS: public read, service role write
ALTER TABLE trail_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trail_closures_read_all"
  ON trail_closures FOR SELECT
  USING (true);

CREATE POLICY "trail_closures_service_write"
  ON trail_closures FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE trail_closures IS
  'Trail closure data for DirtSync. Populated by trail-closure-monitor skill (daily 10AM UTC). See vault/agents/skills/trail-closure-monitor/sources.json for source capabilities.';
