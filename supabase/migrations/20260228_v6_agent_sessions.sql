-- Dispatcher v6: Agent Sessions table for persistent Claude sessions
-- Run against MCM Forge Supabase (ncwxeeqvujgyiggkviqq)

-- ============================================
-- Table: agent_sessions
-- ============================================

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,                           -- Claude SDK session UUID
  agent_persona TEXT NOT NULL,                        -- 'builder', 'researcher', 'coo'
  company_id UUID REFERENCES company_registry(id),    -- nullable for global sessions (COO)
  status TEXT NOT NULL DEFAULT 'active',              -- active, expired, error
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  task_count INT DEFAULT 0,
  current_task_id UUID,                              -- currently executing task
  error_message TEXT,

  CONSTRAINT agent_sessions_status_check CHECK (status IN ('active', 'expired', 'error'))
);

-- Index for fast lookup of active sessions by persona + company
CREATE INDEX IF NOT EXISTS idx_agent_sessions_active
  ON agent_sessions(agent_persona, company_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agent_sessions_session_id
  ON agent_sessions(session_id);

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (agent + steve) full access
CREATE POLICY "agent_sessions_select" ON agent_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "agent_sessions_insert" ON agent_sessions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "agent_sessions_update" ON agent_sessions
  FOR UPDATE TO authenticated USING (true);

-- ============================================
-- Feature flag: session_mode (disabled by default)
-- ============================================

INSERT INTO system_config (key, value)
VALUES ('session_mode', 'disabled')
ON CONFLICT (key) DO NOTHING;
