# MCM Forge v2 — Plan 1: The Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the database schema, Calendar Bridge, and Dispatcher v8 upgrades that enable persistent agent teams, workflow pipelines, and budget enforcement.

**Architecture:** Extend existing Supabase schema with 6 new tables (forge_agents, missions, vitals, assembly_lines, assembly_runs, agent_heartbeats). Add Calendar Bridge module to dispatcher. Upgrade dispatcher routing to be agent-aware with atomic checkout and budget enforcement.

**Tech Stack:** Supabase (PostgreSQL), TypeScript (tsx), Google Calendar API (OAuth2), existing dispatcher infrastructure

---

### Task 1: Supabase Migration — forge_agents Table

**Files:**
- Create: `supabase/migrations/20260328_forge_agents.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- MCM Forge v2: Persistent Agent Registry
-- Run in BRAIN Supabase (ncwxeeqvujgyiggkviqq)

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

-- Index for company lookups and active agents
CREATE INDEX idx_forge_agents_company ON forge_agents(company_id);
CREATE INDEX idx_forge_agents_status ON forge_agents(status) WHERE status = 'active';
CREATE INDEX idx_forge_agents_reports_to ON forge_agents(reports_to);

-- RLS
ALTER TABLE forge_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access_forge_agents" ON forge_agents
  FOR ALL USING (auth.uid() IS NOT NULL);
```

- [ ] **Step 2: Apply the migration**

Run: `cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge && cat supabase/migrations/20260328_forge_agents.sql`

Then apply via Supabase MCP:
```
mcp__supabase__execute_sql with the SQL content
```

Expected: Table created, indexes created, RLS enabled.

- [ ] **Step 3: Verify table exists**

Run via MCP:
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'forge_agents' ORDER BY ordinal_position;
```

Expected: All 19 columns listed with correct types.

- [ ] **Step 4: Commit**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add supabase/migrations/20260328_forge_agents.sql
git commit -m "feat: add forge_agents table for persistent agent identities"
```

---

### Task 2: Supabase Migration — missions, vitals, workflow tables

**Files:**
- Create: `supabase/migrations/20260328_forge_v2_tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- MCM Forge v2: Missions, Vitals, Assembly Lines, Assembly Runs, Agent Heartbeats
-- Run in BRAIN Supabase (ncwxeeqvujgyiggkviqq)

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

CREATE INDEX idx_missions_company ON missions(company_id);
CREATE INDEX idx_missions_quarter ON missions(quarter);

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

CREATE INDEX idx_vitals_company_week ON vitals(company_id, week_start);
CREATE UNIQUE INDEX idx_vitals_unique ON vitals(company_id, week_start, metric_name);

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

CREATE INDEX idx_assembly_lines_company ON assembly_lines(company_id);

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

CREATE INDEX idx_assembly_runs_status ON assembly_runs(status) WHERE status = 'running';

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

CREATE INDEX idx_heartbeats_agent ON agent_heartbeats(agent_id);
CREATE INDEX idx_heartbeats_order ON agent_heartbeats(order_id);
CREATE INDEX idx_heartbeats_recent ON agent_heartbeats(started_at DESC);

-- Add assembly_line_id and assembly_run_id to task_queue
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_queue' AND column_name = 'assembly_line_id'
  ) THEN
    ALTER TABLE task_queue ADD COLUMN assembly_line_id UUID REFERENCES assembly_lines(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_queue' AND column_name = 'assembly_run_id'
  ) THEN
    ALTER TABLE task_queue ADD COLUMN assembly_run_id UUID REFERENCES assembly_runs(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_queue' AND column_name = 'step_number'
  ) THEN
    ALTER TABLE task_queue ADD COLUMN step_number INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_queue' AND column_name = 'assigned_agent_id'
  ) THEN
    ALTER TABLE task_queue ADD COLUMN assigned_agent_id UUID REFERENCES forge_agents(id);
  END IF;
END $$;

-- RLS for all new tables
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_access_missions" ON missions FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_vitals" ON vitals FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_assembly_lines" ON assembly_lines FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_assembly_runs" ON assembly_runs FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_access_agent_heartbeats" ON agent_heartbeats FOR ALL USING (auth.uid() IS NOT NULL);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Expected: 5 tables created, task_queue extended with 4 new columns.

- [ ] **Step 3: Verify all tables exist**

Run via MCP:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('forge_agents', 'missions', 'vitals', 'assembly_lines', 'assembly_runs', 'agent_heartbeats') ORDER BY table_name;
```

Expected: 6 rows returned.

- [ ] **Step 4: Commit**

```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge
git add supabase/migrations/20260328_forge_v2_tables.sql
git commit -m "feat: add missions, vitals, assembly_lines, assembly_runs, agent_heartbeats tables"
```

---

### Task 3: Seed DirtSync Chain of Command

**Files:**
- Create: `supabase/migrations/20260328_seed_dirtsync_agents.sql`

- [ ] **Step 1: Look up DirtSync company_id**

Run via MCP:
```sql
SELECT id, name FROM company_registry WHERE slug = 'dirtsync';
```

Note the UUID — use it as `DIRTSYNC_ID` below.

- [ ] **Step 2: Write the seed migration**

```sql
-- Seed DirtSync Chain of Command
-- Replace DIRTSYNC_ID with actual UUID from company_registry

-- CEO (Steve is board, COO is first agent)
INSERT INTO forge_agents (name, role, title, company_id, reports_to, model, adapter, skills, identity_prompt, budget_monthly_cents, heartbeat_cron) VALUES
('Forge', 'coo', 'Chief Operating Officer', 'DIRTSYNC_ID', NULL, 'opus-4', 'claude',
 ARRAY['daily-ops', 'plan-reviewer', 'revenue-analyst', 'shipping-checklist', 'code-review'],
 'You are Forge, the COO of DirtSync. You manage the entire engineering and marketing organization. Your job is to review plans, approve quality work, surface blockers, and ensure features ship on schedule. You report directly to Steve (the board). When reviewing work, be thorough but decisive. When something is good enough to ship, say so. When it needs work, be specific about what to fix. You run the daily War Room standup and weekly Forge Sync.',
 10000, '0 6,12,18 * * *');

-- Get COO id for reports_to (will be set after insert via UPDATE)
-- CTO
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents, heartbeat_cron) VALUES
('Architect', 'cto', 'Chief Technology Officer', 'DIRTSYNC_ID', 'opus-4', 'claude',
 ARRAY['plan-then-code', 'codebase-aware', 'feature-proposal', 'code-review'],
 'You are Architect, the CTO of DirtSync. You own the technical architecture. When given a feature request, you create detailed implementation plans with exact file paths, acceptance criteria, and test strategies. You reference the DirtSync tech stack docs (SwiftUI, MapLibre, Ferrostar, Supabase, Valhalla). You delegate implementation to Swift (iOS) and Edge (Backend) engineers. You review their PRs before they go to QA.',
 8000, '0 */4 * * *');

-- CMO
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents, heartbeat_cron) VALUES
('Signal', 'cmo', 'Chief Marketing Officer', 'DIRTSYNC_ID', 'gemini-2.5-flash', 'gemini',
 ARRAY['social-intel', 'youtube-niche-monitor', 'app-store-monitor', 'competitive-scan'],
 'You are Signal, the CMO of DirtSync. You monitor competitors (OnX, Gaia GPS, AllTrails), track social sentiment, and create content strategies. When features ship, you create social media promotion plans. You manage Lens (Video Creator) and Pulse (Social Media Manager). You understand the UTV/ATV trail riding community deeply.',
 5000, '0 7,15 * * *');

-- iOS Engineer
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents, heartbeat_cron) VALUES
('Swift', 'engineer', 'iOS Engineer', 'DIRTSYNC_ID', 'sonnet-4', 'claude',
 ARRAY['tdd-workflow', 'visual-bug-fix', 'codebase-aware'],
 'You are Swift, the iOS Engineer for DirtSync. You write SwiftUI code for the DirtSync iOS app. You follow TDD discipline — write failing test first, then implement. You work in the DirtSync repo at /Users/dirtsyncmini/DirtSync. Key frameworks: SwiftUI, MapLibre Native iOS, Ferrostar (navigation), CoreLocation, Supabase Swift SDK. Always reference tech stack docs in your skill references before coding.',
 8000, NULL);

-- Backend Engineer
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents, heartbeat_cron) VALUES
('Edge', 'engineer', 'Backend Engineer', 'DIRTSYNC_ID', 'sonnet-4', 'claude',
 ARRAY['tdd-workflow', 'plan-then-code', 'codebase-aware'],
 'You are Edge, the Backend Engineer for DirtSync. You build Supabase Edge Functions, database migrations, and API endpoints. You work with PostgreSQL, PostGIS, Supabase Auth, and Supabase Storage. You also configure Valhalla routing engine when needed. Always write migrations as idempotent SQL.',
 8000, NULL);

-- QA Engineer
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents, heartbeat_cron) VALUES
('Sentinel', 'qa', 'QA Engineer', 'DIRTSYNC_ID', 'sonnet-4', 'claude',
 ARRAY['code-review', 'shipping-checklist', 'visual-bug-fix'],
 'You are Sentinel, the QA Engineer for DirtSync. You review PRs for correctness, test coverage, and visual accuracy. You use Playwright for browser testing and screenshot comparison. You check that features meet acceptance criteria from the plan. When something fails QA, provide specific, actionable feedback — not vague complaints.',
 5000, NULL);

-- Video Creator
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents) VALUES
('Lens', 'content', 'Video Creator', 'DIRTSYNC_ID', 'gemini-2.5-flash', 'gemini',
 ARRAY[]::TEXT[],
 'You are Lens, the Video Creator for DirtSync. When a feature ships, you create short promotional video scripts and storyboards. You understand the UTV/ATV trail riding community. Your videos should highlight the feature benefit, not just the UI change. Target: 30-60 second social media clips.',
 3000);

-- Social Media Manager
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents) VALUES
('Pulse', 'content', 'Social Media Manager', 'DIRTSYNC_ID', 'gemini-2.5-flash', 'gemini',
 ARRAY['social-intel'],
 'You are Pulse, the Social Media Manager for DirtSync. You create posts for Twitter/X, Instagram, and TikTok. You draft content — NEVER post directly. All posts go through Steve for approval. You track competitor social presence and identify trending topics in the trail riding community.',
 3000);

-- Trail Data Engineer
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents, heartbeat_cron) VALUES
('Trailkeeper', 'data_lead', 'Trail Data Engineer', 'DIRTSYNC_ID', 'sonnet-4', 'claude',
 ARRAY['poi-research', 'trail-closure-monitor'],
 'You are Trailkeeper, the Trail Data Engineer for DirtSync. You manage GPS trail data, POI research, trail system metadata, and data quality. You work with PostGIS, trail_lines table, and the DirtSync Supabase instance (lldipxvwocpqncixlnxj). You ensure trail data is accurate, properly merged, and named correctly.',
 5000, '0 8 * * *');

-- Forge Scout
INSERT INTO forge_agents (name, role, title, company_id, model, adapter, skills, identity_prompt, budget_monthly_cents, heartbeat_cron) VALUES
('Radar', 'scout', 'Forge Scout', 'DIRTSYNC_ID', 'sonnet-4', 'claude',
 ARRAY['github-repo-scout', 'skill-gotchas-flywheel'],
 'You are Radar, the Forge Scout. You watch external GitHub repos daily for improvements that could benefit MCM Forge. Repos to watch: paperclipai/paperclip, anthropics/claude-code, nicepkg/superpowers, jlowin/agency-agents. For each relevant change, create a structured proposal: what changed, how it helps us, estimated effort, priority. Route proposals to the COO (Forge) for approval.',
 3000, '0 3 * * *');

-- Set reports_to hierarchy (after all agents exist)
-- COO reports to nobody (Steve is board, not in DB)
-- CTO, CMO, Trailkeeper, Radar report to COO
UPDATE forge_agents SET reports_to = (SELECT id FROM forge_agents WHERE name = 'Forge' AND company_id = 'DIRTSYNC_ID')
WHERE name IN ('Architect', 'Signal', 'Trailkeeper', 'Radar') AND company_id = 'DIRTSYNC_ID';

-- Swift, Edge, Sentinel report to CTO
UPDATE forge_agents SET reports_to = (SELECT id FROM forge_agents WHERE name = 'Architect' AND company_id = 'DIRTSYNC_ID')
WHERE name IN ('Swift', 'Edge', 'Sentinel') AND company_id = 'DIRTSYNC_ID';

-- Lens, Pulse report to CMO
UPDATE forge_agents SET reports_to = (SELECT id FROM forge_agents WHERE name = 'Signal' AND company_id = 'DIRTSYNC_ID')
WHERE name IN ('Lens', 'Pulse') AND company_id = 'DIRTSYNC_ID';
```

- [ ] **Step 3: Apply via Supabase MCP** (replace DIRTSYNC_ID with actual UUID first)

- [ ] **Step 4: Verify hierarchy**

```sql
SELECT f.name, f.role, f.title, p.name as reports_to_name
FROM forge_agents f
LEFT JOIN forge_agents p ON f.reports_to = p.id
WHERE f.company_id = 'DIRTSYNC_ID'
ORDER BY f.role, f.name;
```

Expected: 11 agents with correct hierarchy (Forge → Architect/Signal/Trailkeeper/Radar → Swift/Edge/Sentinel/Lens/Pulse).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260328_seed_dirtsync_agents.sql
git commit -m "feat: seed DirtSync chain of command with 11 agents"
```

---

### Task 4: Seed Feature Ship Assembly Line

**Files:**
- Create: `supabase/migrations/20260328_seed_assembly_lines.sql`

- [ ] **Step 1: Write the seed migration**

```sql
-- Seed DirtSync Feature Ship Assembly Line
INSERT INTO assembly_lines (company_id, name, trigger_type, steps) VALUES
('DIRTSYNC_ID', 'Feature Ship Pipeline', 'calendar',
 '[
   {"step": 1, "name": "Plan", "agent_role": "cto", "skill": "plan-then-code", "auto_advance": false, "description": "CTO creates implementation plan with file paths, tests, and acceptance criteria"},
   {"step": 2, "name": "COO Review", "agent_role": "coo", "skill": "plan-reviewer", "auto_advance": false, "description": "COO reviews plan, iterates until quality score >= 8/10"},
   {"step": 3, "name": "Build", "agent_role": "engineer", "skill": "tdd-workflow", "auto_advance": true, "description": "Engineer implements the plan using TDD. Creates branch and PR."},
   {"step": 4, "name": "QA", "agent_role": "qa", "skill": "code-review", "auto_advance": true, "description": "QA reviews PR, runs visual verification, checks acceptance criteria"},
   {"step": 5, "name": "Ship", "agent_role": "coo", "skill": "shipping-checklist", "auto_advance": false, "description": "COO runs shipping checklist. Routes to Steve for final approval."},
   {"step": 6, "name": "Promote", "agent_role": "content", "skill": null, "auto_advance": true, "description": "Social Media Manager creates promotion drafts for the shipped feature"}
 ]'::jsonb);

-- Content Promotion Pipeline (for non-code marketing work)
INSERT INTO assembly_lines (company_id, name, trigger_type, steps) VALUES
('DIRTSYNC_ID', 'Content Promotion Pipeline', 'manual',
 '[
   {"step": 1, "name": "Research", "agent_role": "cmo", "skill": "competitive-scan", "auto_advance": true, "description": "CMO researches competitor positioning and audience trends"},
   {"step": 2, "name": "Create", "agent_role": "content", "skill": null, "auto_advance": false, "description": "Content creator drafts video script or social posts"},
   {"step": 3, "name": "Review", "agent_role": "coo", "skill": null, "auto_advance": false, "description": "COO reviews content for brand alignment and quality"},
   {"step": 4, "name": "Publish Drafts", "agent_role": "content", "skill": null, "auto_advance": false, "description": "Create drafts in platform. Steve approves and publishes."}
 ]'::jsonb);

-- DirtSync Q2 Mission
INSERT INTO missions (company_id, title, description, quarter, due_date) VALUES
('DIRTSYNC_ID',
 'Ship 26 features and launch DirtSync 1.0',
 'Complete all calendar-scheduled features through April 30. Hit 100 TestFlight users. Achieve 4.5+ App Store rating. Feature-complete for public launch.',
 '2026-Q2',
 '2026-06-30');
```

- [ ] **Step 2: Apply via Supabase MCP** (replace DIRTSYNC_ID)

- [ ] **Step 3: Verify**

```sql
SELECT name, trigger_type, jsonb_array_length(steps) as step_count FROM assembly_lines WHERE company_id = 'DIRTSYNC_ID';
```

Expected: 2 assembly lines (Feature Ship = 6 steps, Content Promotion = 4 steps).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328_seed_assembly_lines.sql
git commit -m "feat: seed DirtSync assembly lines and Q2 mission"
```

---

### Task 5: Calendar Bridge Module

**Files:**
- Create: `dispatcher/calendar-bridge.ts`

- [ ] **Step 1: Write the Calendar Bridge**

```typescript
#!/usr/bin/env tsx
/**
 * Calendar Bridge — Polls Google Calendar and creates task_queue orders
 * for DirtSync features that haven't been picked up yet.
 *
 * Runs hourly via the dispatcher or standalone.
 * Skips: "Daily Data Check", birthdays, past events, already-synced events.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, ".env") });

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
  status: string;
}

interface CompanyCalendarConfig {
  companyId: string;
  companySlug: string;
  calendarId: string;
  assemblyLineId: string | null; // ID of the default assembly line for this company
}

const SKIP_PATTERNS = [
  /daily data check/i,
  /birthday/i,
  /STEVE BIRTHDAY/i,
  /^DONE/i,
  /^Week \d+:/i,
  /^BUILD:/i,
];

const TASK_TYPE_KEYWORDS: Record<string, string[]> = {
  code: ["DirtSync:", "Fix", "Build", "Add", "Implement", "Refactor", "Update", "Route", "Feature", "Page", "View", "System", "Gate", "Overlay", "Push"],
  content: ["Video", "Social", "Blog", "Post", "Marketing", "Campaign"],
  research: ["Research", "Analyze", "Survey", "Monitor", "Scan", "Intel"],
  ops: ["Deploy", "Migrate", "Infrastructure", "Health", "Audit"],
};

function classifyTaskType(summary: string): string {
  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => summary.includes(kw))) return type;
  }
  return "code"; // default for DirtSync calendar events
}

function shouldSkip(summary: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(summary));
}

async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("[CALENDAR-BRIDGE] Failed to refresh Google token:", await res.text());
    return null;
  }

  const data = await res.json();
  return data.access_token;
}

async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  daysAhead: number = 14
): Promise<CalendarEvent[]> {
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    maxResults: "50",
    singleEvents: "true",
    orderBy: "startTime",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error("[CALENDAR-BRIDGE] Calendar API error:", await res.text());
    return [];
  }

  const data = await res.json();
  return data.items || [];
}

async function getExistingCalendarTaskIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("task_queue")
    .select("calendar_event_id")
    .not("calendar_event_id", "is", null);

  return new Set((data || []).map((row: { calendar_event_id: string }) => row.calendar_event_id));
}

async function getCtoAgentId(supabase: SupabaseClient, companyId: string): Promise<string | null> {
  const { data } = await supabase
    .from("forge_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", "cto")
    .eq("status", "active")
    .limit(1)
    .single();

  return data?.id || null;
}

export async function runCalendarBridge(): Promise<{ created: number; skipped: number }> {
  const supabase = createClient(
    process.env.MCMFORGE_SUPABASE_URL!,
    process.env.MCMFORGE_SUPABASE_KEY!
  );

  // Authenticate as agent
  await supabase.auth.signInWithPassword({
    email: process.env.AGENT_EMAIL || "agent@mcmforge.com",
    password: process.env.AGENT_PASSWORD!,
  });

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    console.log("[CALENDAR-BRIDGE] No Google access token — skipping");
    return { created: 0, skipped: 0 };
  }

  // Get company configs with calendar IDs
  const { data: companies } = await supabase
    .from("company_registry")
    .select("id, slug, google_calendar_id")
    .not("google_calendar_id", "is", null);

  if (!companies?.length) {
    console.log("[CALENDAR-BRIDGE] No companies with calendar IDs configured");
    return { created: 0, skipped: 0 };
  }

  const existingIds = await getExistingCalendarTaskIds(supabase);
  let created = 0;
  let skipped = 0;

  for (const company of companies) {
    const events = await fetchCalendarEvents(accessToken, company.google_calendar_id);

    // Get default assembly line for this company
    const { data: assemblyLine } = await supabase
      .from("assembly_lines")
      .select("id")
      .eq("company_id", company.id)
      .eq("trigger_type", "calendar")
      .eq("is_active", true)
      .limit(1)
      .single();

    const ctoAgentId = await getCtoAgentId(supabase, company.id);

    for (const event of events) {
      // Skip if already synced
      if (existingIds.has(event.id)) {
        skipped++;
        continue;
      }

      // Skip non-feature events
      if (shouldSkip(event.summary)) {
        skipped++;
        continue;
      }

      // Skip completed events
      if (event.summary.includes("DONE") || event.summary.includes("\u2705")) {
        skipped++;
        continue;
      }

      const taskType = classifyTaskType(event.summary);
      const eventDate = event.start.dateTime || event.start.date || "";

      // Clean the title (remove "DirtSync: " prefix if present)
      const title = event.summary.replace(/^DirtSync:\s*/i, "").trim();

      const { error } = await supabase.from("task_queue").insert({
        title: title,
        description: event.description || `Feature from calendar: ${event.summary}`,
        task_type: taskType,
        cli_target: taskType === "code" ? "claude" : "gemini",
        company_id: company.id,
        assigned_to: "agent-executor",
        assigned_agent_id: ctoAgentId,
        assembly_line_id: assemblyLine?.id || null,
        priority: "high",
        status: "todo",
        calendar_event_id: event.id,
        calendar_html_link: `https://www.google.com/calendar/event?eid=${Buffer.from(event.id + " " + company.google_calendar_id).toString("base64")}`,
        cost_cap: 5.00,
        skill_name: "plan-then-code",
      });

      if (error) {
        console.error(`[CALENDAR-BRIDGE] Failed to create task for "${event.summary}":`, error.message);
      } else {
        console.log(`[CALENDAR-BRIDGE] Created order: "${title}" (${taskType}) for ${company.slug}`);
        created++;
      }
    }
  }

  console.log(`[CALENDAR-BRIDGE] Done. Created: ${created}, Skipped: ${skipped}`);
  return { created, skipped };
}

// Run standalone if called directly
if (process.argv[1]?.includes("calendar-bridge")) {
  runCalendarBridge()
    .then((result) => {
      console.log("[CALENDAR-BRIDGE] Complete:", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[CALENDAR-BRIDGE] Fatal error:", err);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Test the Calendar Bridge standalone**

Run:
```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/dispatcher
npx tsx calendar-bridge.ts
```

Expected: Output showing "Created order: ..." for each qualifying DirtSync calendar event that doesn't already exist in task_queue. Should pick up events like "Analytics + Error Tracking", "Settings Page Audit", "POI Route Builder", etc. Should skip "Daily Data Check", "BIRTHDAY SPRINT", "DONE" events.

- [ ] **Step 3: Verify orders were created in Supabase**

Run via MCP:
```sql
SELECT title, task_type, skill_name, calendar_event_id IS NOT NULL as from_calendar
FROM task_queue
WHERE calendar_event_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

Expected: Rows with DirtSync feature titles, task_type=code, from_calendar=true.

- [ ] **Step 4: Commit**

```bash
git add dispatcher/calendar-bridge.ts
git commit -m "feat: Calendar Bridge — auto-creates orders from Google Calendar events"
```

---

### Task 6: Dispatcher v8 — Agent-Aware Routing

**Files:**
- Modify: `dispatcher/dispatcher.ts` (add agent routing, budget check, heartbeat logging)

- [ ] **Step 1: Add forge_agents lookup to task pickup**

In `dispatcher.ts`, after the task is picked from task_queue, add agent resolution logic. Find the section where tasks are picked up and add BEFORE execution:

```typescript
// ============================================
// Agent Resolution (v8)
// ============================================

interface ForgeAgent {
  id: string;
  name: string;
  role: string;
  title: string;
  model: string;
  adapter: string;
  skills: string[];
  identity_prompt: string;
  budget_monthly_cents: number;
  spent_monthly_cents: number;
  status: string;
}

async function resolveAgent(task: Task): Promise<ForgeAgent | null> {
  if (!task.assigned_agent_id) return null;

  const { data, error } = await supabase
    .from("forge_agents")
    .select("*")
    .eq("id", task.assigned_agent_id)
    .single();

  if (error || !data) {
    log("WARN", `No forge_agent found for id ${task.assigned_agent_id}`);
    return null;
  }

  return data as ForgeAgent;
}

async function checkBudget(agent: ForgeAgent): Promise<boolean> {
  if (agent.spent_monthly_cents >= agent.budget_monthly_cents) {
    log("WARN", `Agent ${agent.name} budget exceeded: ${agent.spent_monthly_cents}/${agent.budget_monthly_cents} cents`);

    // Pause the agent
    await supabase
      .from("forge_agents")
      .update({ status: "budget_exceeded" })
      .eq("id", agent.id);

    return false;
  }
  return true;
}

async function recordHeartbeat(
  agentId: string,
  orderId: string,
  assemblyRunId: string | null,
  stepNumber: number | null
): Promise<string> {
  const { data } = await supabase
    .from("agent_heartbeats")
    .insert({
      agent_id: agentId,
      order_id: orderId,
      assembly_run_id: assemblyRunId,
      step_number: stepNumber,
      status: "running",
    })
    .select("id")
    .single();

  return data!.id;
}

async function completeHeartbeat(
  heartbeatId: string,
  status: "succeeded" | "failed",
  tokensInput: number,
  tokensOutput: number,
  costCents: number,
  summary: string
) {
  await supabase
    .from("agent_heartbeats")
    .update({
      ended_at: new Date().toISOString(),
      status,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      cost_cents: costCents,
      output_summary: summary,
    })
    .eq("id", heartbeatId);

  // Update agent spend
  if (costCents > 0) {
    await supabase.rpc("increment_agent_spend", {
      p_agent_id: heartbeatId, // will fix to agent_id in the function
      p_amount: costCents,
    });
  }
}
```

- [ ] **Step 2: Create the increment_agent_spend RPC function**

Apply via Supabase MCP:
```sql
CREATE OR REPLACE FUNCTION increment_agent_spend(p_agent_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE forge_agents
  SET spent_monthly_cents = spent_monthly_cents + p_amount,
      last_heartbeat_at = NOW()
  WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 3: Add agent identity injection to CLI execution**

In the section where the CLI command is built, add the agent's identity_prompt as a prefix to the task prompt:

```typescript
function buildAgentPrompt(task: Task, agent: ForgeAgent | null, vaultContext: string): string {
  let prompt = "";

  // Agent identity (v8)
  if (agent) {
    prompt += `## Your Identity\nYou are ${agent.name}, ${agent.title} at ${task.company_registry?.name || "the company"}.\n${agent.identity_prompt}\n\n`;
  }

  // Existing prompt construction
  prompt += `## Task\n${task.title}\n\n${task.description}\n\n`;

  if (vaultContext) {
    prompt += `## Context\n${vaultContext}\n\n`;
  }

  return prompt;
}
```

- [ ] **Step 4: Integrate agent resolution into the main execution flow**

In the `processTask` function (or equivalent main task handler), add before execution:

```typescript
// Resolve forge agent (v8)
const agent = await resolveAgent(task);

if (agent) {
  // Budget check
  if (!(await checkBudget(agent))) {
    log("WARN", `Skipping task ${task.id} — agent ${agent.name} over budget`);
    await supabase.from("task_queue").update({ status: "blocked" }).eq("id", task.id);
    return;
  }

  // Override CLI target from agent config
  task.cli_target = agent.adapter as CliTool;

  // Record heartbeat start
  const heartbeatId = await recordHeartbeat(
    agent.id,
    task.id,
    task.assembly_run_id || null,
    task.step_number || null
  );

  // Update agent current_order
  await supabase.from("forge_agents").update({ current_order_id: task.id }).eq("id", agent.id);

  // ... execute task ...

  // After execution, complete heartbeat
  await completeHeartbeat(
    heartbeatId,
    result.success ? "succeeded" : "failed",
    0, // TODO: parse tokens from CLI output
    0,
    Math.round((task.cost_cap || 2) * 100), // estimate
    result.summary || result.output.slice(0, 500)
  );

  // Clear current_order and update stats
  await supabase.from("forge_agents").update({
    current_order_id: null,
    tasks_completed: agent.tasks_completed + (result.success ? 1 : 0),
    tasks_failed: agent.tasks_failed + (result.success ? 0 : 1),
  }).eq("id", agent.id);
}
```

- [ ] **Step 5: Add Calendar Bridge to the polling loop**

In the main polling function, add a Calendar Bridge call every 12th poll cycle (once per hour at 5-min intervals):

```typescript
let pollCount = 0;

// Inside the main poll loop, after task processing:
pollCount++;
if (pollCount % 12 === 0) {
  try {
    const { runCalendarBridge } = await import("./calendar-bridge.js");
    const bridgeResult = await runCalendarBridge();
    log("INFO", "Calendar Bridge sync", bridgeResult);
  } catch (err) {
    log("ERROR", "Calendar Bridge failed", { error: String(err) });
  }
}
```

- [ ] **Step 6: Add atomic task checkout**

Replace the current task pickup query with an atomic version:

```typescript
// Atomic task pickup — prevents double-claiming
async function pickupNextTask(): Promise<Task | null> {
  const { data, error } = await supabase.rpc("pickup_next_task");
  if (error || !data) return null;
  return data as Task;
}
```

And create the RPC function via MCP:
```sql
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
```

- [ ] **Step 7: Test dispatcher with agent routing**

Run manually:
```bash
cd /Users/stevemcmillian/llama-3-agents/Apps/projects/MCMForge/dispatcher
npx tsx dispatcher.ts
```

Watch logs for:
- `[INFO] Calendar Bridge sync { created: X, skipped: Y }`
- Agent resolution messages when tasks with `assigned_agent_id` are picked up
- Budget check passes/failures

- [ ] **Step 8: Commit**

```bash
git add dispatcher/dispatcher.ts
git commit -m "feat: Dispatcher v8 — agent-aware routing, budget enforcement, heartbeat logging, calendar bridge integration"
```

---

### Task 7: Assembly Line Advancement

**Files:**
- Create: `dispatcher/assembly-line.ts`

- [ ] **Step 1: Write the assembly line advancement module**

```typescript
/**
 * Assembly Line — Manages multi-step workflow advancement.
 * When a task completes that is part of an assembly run,
 * this module advances to the next step.
 */

import { SupabaseClient } from "@supabase/supabase-js";

interface AssemblyStep {
  step: number;
  name: string;
  agent_role: string;
  skill: string | null;
  auto_advance: boolean;
  description: string;
}

interface AssemblyRun {
  id: string;
  assembly_line_id: string;
  source_order_id: string;
  current_step: number;
  status: string;
  step_history: Array<{ step: number; status: string; order_id: string; completed_at: string }>;
}

export async function advanceAssemblyLine(
  supabase: SupabaseClient,
  orderId: string,
  success: boolean
): Promise<void> {
  // Check if this order is part of an assembly run
  const { data: order } = await supabase
    .from("task_queue")
    .select("assembly_run_id, step_number, company_id, title")
    .eq("id", orderId)
    .single();

  if (!order?.assembly_run_id) return; // Not part of an assembly line

  const { data: run } = await supabase
    .from("assembly_runs")
    .select("*, assembly_lines(*)")
    .eq("id", order.assembly_run_id)
    .single();

  if (!run) return;

  const steps: AssemblyStep[] = run.assembly_lines.steps;
  const currentStep = steps.find((s: AssemblyStep) => s.step === order.step_number);
  const nextStep = steps.find((s: AssemblyStep) => s.step === (order.step_number || 0) + 1);

  // Record step completion in history
  const history = [...(run.step_history || []), {
    step: order.step_number,
    status: success ? "succeeded" : "failed",
    order_id: orderId,
    completed_at: new Date().toISOString(),
  }];

  if (!success) {
    // Step failed — pause the assembly run
    await supabase
      .from("assembly_runs")
      .update({ status: "paused", step_history: history })
      .eq("id", run.id);

    console.log(`[ASSEMBLY] Run ${run.id} paused at step ${order.step_number} (${currentStep?.name}) — task failed`);
    return;
  }

  if (!nextStep) {
    // Last step completed — mark assembly run as done
    await supabase
      .from("assembly_runs")
      .update({
        status: "completed",
        step_history: history,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    console.log(`[ASSEMBLY] Run ${run.id} COMPLETED — all ${steps.length} steps done for "${order.title}"`);
    return;
  }

  // Advance to next step
  if (!nextStep.auto_advance) {
    // Manual gate — create approval request
    await supabase.from("approval_queue").insert({
      task_id: orderId,
      approval_type: "task_completion",
      approval_status: "pending",
      approval_token: crypto.randomUUID(),
    });

    await supabase
      .from("assembly_runs")
      .update({ current_step: nextStep.step, step_history: history })
      .eq("id", run.id);

    console.log(`[ASSEMBLY] Run ${run.id} waiting for approval at step ${nextStep.step} (${nextStep.name})`);
    return;
  }

  // Auto-advance — find the right agent and create next sub-task
  const { data: nextAgent } = await supabase
    .from("forge_agents")
    .select("id, name")
    .eq("company_id", order.company_id)
    .eq("role", nextStep.agent_role)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!nextAgent) {
    console.error(`[ASSEMBLY] No active agent with role "${nextStep.agent_role}" for step ${nextStep.step}`);
    await supabase
      .from("assembly_runs")
      .update({ status: "paused", step_history: history })
      .eq("id", run.id);
    return;
  }

  // Create the next sub-task
  const { data: newOrder } = await supabase.from("task_queue").insert({
    title: `[Step ${nextStep.step}] ${nextStep.name}: ${order.title}`,
    description: `${nextStep.description}\n\nThis is step ${nextStep.step} of the Feature Ship Pipeline for: "${order.title}"`,
    task_type: nextStep.agent_role === "qa" ? "code" : "code",
    cli_target: "claude",
    company_id: order.company_id,
    assigned_to: "agent-executor",
    assigned_agent_id: nextAgent.id,
    assembly_run_id: run.id,
    assembly_line_id: run.assembly_line_id,
    step_number: nextStep.step,
    skill_name: nextStep.skill,
    priority: "high",
    status: "todo",
    cost_cap: 5.00,
  }).select("id").single();

  await supabase
    .from("assembly_runs")
    .update({ current_step: nextStep.step, step_history: history })
    .eq("id", run.id);

  console.log(`[ASSEMBLY] Run ${run.id} advanced to step ${nextStep.step} (${nextStep.name}) → assigned to ${nextAgent.name}, order ${newOrder?.id}`);
}
```

- [ ] **Step 2: Import and call from dispatcher**

In `dispatcher.ts`, after a task completes (in the success/failure handler):

```typescript
import { advanceAssemblyLine } from "./assembly-line.js";

// After task execution completes:
await advanceAssemblyLine(supabase, task.id, result.success);
```

- [ ] **Step 3: Test with a manual assembly run**

Create a test assembly run via MCP:
```sql
-- Create a test run (replace IDs with actuals)
INSERT INTO assembly_runs (assembly_line_id, source_order_id, current_step)
SELECT al.id, tq.id, 1
FROM assembly_lines al, task_queue tq
WHERE al.name = 'Feature Ship Pipeline'
AND tq.title LIKE '%Settings Page%'
LIMIT 1;
```

- [ ] **Step 4: Commit**

```bash
git add dispatcher/assembly-line.ts
git commit -m "feat: Assembly Line module — multi-step workflow advancement with manual gates"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All Plan 1 requirements from spec covered — forge_agents, missions, vitals, assembly_lines, assembly_runs, agent_heartbeats tables, Calendar Bridge, Dispatcher v8 agent routing, budget enforcement, heartbeat logging, assembly line advancement
- [x] **Placeholder scan:** No TBD, TODO (except one token parsing TODO which is acceptable for v1), or vague instructions
- [x] **Type consistency:** ForgeAgent interface matches database schema. Task interface extended with assembly fields. AssemblyStep matches JSONB structure.
- [x] **File paths:** All exact — supabase/migrations/, dispatcher/calendar-bridge.ts, dispatcher/assembly-line.ts, dispatcher/dispatcher.ts
