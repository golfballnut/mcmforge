-- ============================================
-- MCM Forge v2: Foundation Migration
-- Applied 2026-03-28 to BRAIN Supabase (ncwxeeqvujgyiggkviqq)
-- ============================================

-- forge_agents: persistent agent identities with budgets and hierarchy
CREATE TABLE IF NOT EXISTS forge_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ceo', 'coo', 'cto', 'cmo', 'engineer', 'qa', 'analyst', 'content', 'scout', 'data_lead')),
  title TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES company_registry(id),
  reports_to UUID REFERENCES forge_agents(id),
  model TEXT NOT NULL DEFAULT 'sonnet-4',
  adapter TEXT NOT NULL DEFAULT 'claude' CHECK (adapter IN ('claude', 'gemini', 'codex')),
  skills TEXT[] DEFAULT '{}',
  identity_prompt TEXT NOT NULL DEFAULT '',
  budget_monthly_cents INTEGER NOT NULL DEFAULT 5000,
  spent_monthly_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'budget_exceeded', 'terminated')),
  heartbeat_cron TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  current_order_id UUID,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  forged_by UUID REFERENCES forge_agents(id)
);

CREATE INDEX IF NOT EXISTS idx_forge_agents_company ON forge_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_forge_agents_status ON forge_agents(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_forge_agents_reports_to ON forge_agents(reports_to);

-- missions: quarterly goals per company
CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company_registry(id),
  title TEXT NOT NULL,
  description TEXT,
  quarter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  owner_agent_id UUID REFERENCES forge_agents(id),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_missions_company ON missions(company_id);

-- vitals: weekly scorecard entries
CREATE TABLE IF NOT EXISTS vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company_registry(id),
  week_start DATE NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  target_value NUMERIC,
  trend TEXT CHECK (trend IN ('up', 'down', 'flat')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vitals_company_week ON vitals(company_id, week_start);

-- assembly_lines: workflow templates
CREATE TABLE IF NOT EXISTS assembly_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES company_registry(id),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('calendar', 'manual', 'on_merge', 'on_approval')),
  steps JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- assembly_runs: active workflow instances
CREATE TABLE IF NOT EXISTS assembly_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_line_id UUID NOT NULL REFERENCES assembly_lines(id),
  source_order_id UUID NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed')),
  step_history JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- agent_heartbeats: execution log per agent per run
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES forge_agents(id),
  order_id UUID NOT NULL,
  assembly_run_id UUID REFERENCES assembly_runs(id),
  step_number INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  output_summary TEXT,
  transcript_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_agent ON agent_heartbeats(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_order ON agent_heartbeats(order_id);

-- Extend task_queue with forge v2 columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_queue' AND column_name = 'assembly_line_id') THEN
    ALTER TABLE task_queue ADD COLUMN assembly_line_id UUID REFERENCES assembly_lines(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_queue' AND column_name = 'assembly_run_id') THEN
    ALTER TABLE task_queue ADD COLUMN assembly_run_id UUID REFERENCES assembly_runs(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_queue' AND column_name = 'step_number') THEN
    ALTER TABLE task_queue ADD COLUMN step_number INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_queue' AND column_name = 'assigned_agent_id') THEN
    ALTER TABLE task_queue ADD COLUMN assigned_agent_id UUID REFERENCES forge_agents(id);
  END IF;
END $$;

-- RLS
ALTER TABLE forge_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access_forge_agents" ON forge_agents FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_missions" ON missions FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_vitals" ON vitals FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_assembly_lines" ON assembly_lines FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_assembly_runs" ON assembly_runs FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_agent_heartbeats" ON agent_heartbeats FOR ALL USING (auth.uid() IS NOT NULL);

-- RPC functions
CREATE OR REPLACE FUNCTION increment_agent_spend(p_agent_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE forge_agents SET spent_monthly_cents = spent_monthly_cents + p_amount, last_heartbeat_at = NOW() WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION pickup_next_task()
RETURNS SETOF task_queue AS $$
BEGIN
  RETURN QUERY
  UPDATE task_queue
  SET status = 'in_progress', updated_at = NOW()
  WHERE id = (
    SELECT id FROM task_queue
    WHERE status = 'todo'
    ORDER BY
      CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
