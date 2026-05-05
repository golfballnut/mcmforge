-- FORGE-345 — Paperclip mini fixture for ETL unit tests
-- Hand-crafted deterministic snapshot; NOT a real pg_dump.
-- 5 issues, 20 comments, 2 agents, 1 project, 2 goals, 3 approvals.
-- Mirrors the schema of Paperclip v2026.416.0 (embedded postgres 18.3).
--
-- Source company: 2fbacee3-14cf-4526-b577-96d062ef71f2 (DirtSync on Paperclip)
-- Destination:    99338dee-5fdc-4cbf-a344-5c08ec112a2b (DirtSync on forge)
--
-- Load into scratch postgres: psql -h localhost -p 54331 -U paperclip -d paperclip -f paperclip-mini-dump.sql

-- ── Schema ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL,
  name                 TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'engineer',
  title                TEXT,
  icon                 TEXT,
  status               TEXT NOT NULL DEFAULT 'idle',
  adapter_type         TEXT NOT NULL DEFAULT 'claude_local',
  adapter_config       JSONB NOT NULL DEFAULT '{}',
  prompt_template      TEXT,
  bootstrap_prompt     TEXT,
  instructions_file    TEXT,
  skills               TEXT[] NOT NULL DEFAULT '{}',
  session_id           TEXT,
  budget_monthly_cents INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  repo_url       TEXT,
  repo_branch    TEXT,
  workspace_dir  TEXT,
  color          TEXT,
  target_date    DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  level           TEXT NOT NULL DEFAULT 'team',
  status          TEXT NOT NULL DEFAULT 'active',
  parent_id       UUID,
  owner_agent_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.issues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL,
  project_id          UUID,
  parent_id           UUID,
  title               TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'backlog',
  priority            TEXT NOT NULL DEFAULT 'medium',
  identifier          TEXT,
  issue_number        INTEGER,
  assignee_agent_id   UUID,
  acceptance_criteria JSONB DEFAULT '[]',
  tags                TEXT[] DEFAULT '{}',
  branch_name         TEXT,
  pr_url              TEXT,
  goal_id             UUID,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.issue_comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL,
  issue_id           UUID NOT NULL,
  author_agent_id    UUID,
  author_user_id     TEXT,
  body               TEXT NOT NULL,
  mentions           TEXT[] NOT NULL DEFAULT '{}',
  created_by_run_id  UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.approvals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL,
  type                   TEXT NOT NULL,
  requested_by_agent_id  UUID,
  status                 TEXT NOT NULL DEFAULT 'pending',
  payload                JSONB NOT NULL DEFAULT '{}',
  decision_note          TEXT,
  decided_by_user_id     TEXT,
  decided_at             TIMESTAMPTZ,
  run_id                 UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operational tables we DROP per PRD (schema only — no data ported)
CREATE TABLE IF NOT EXISTS public.heartbeat_runs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL,
  status     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.heartbeat_run_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heartbeat_run_id UUID NOT NULL,
  event_type       TEXT,
  payload          JSONB,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_wakeup_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cost_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL,
  amount_usd NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Data ─────────────────────────────────────────────────────────────────────

-- Company
INSERT INTO public.companies (id, name, slug, status) VALUES
  ('2fbacee3-14cf-4526-b577-96d062ef71f2', 'DirtSync', 'dirtsync-lab', 'active');

-- Agents (2 rows — enough to test remapping)
INSERT INTO public.agents (id, company_id, name, role, title, icon, status, adapter_type, adapter_config, prompt_template, bootstrap_prompt, instructions_file, skills, session_id, budget_monthly_cents, created_at, updated_at) VALUES
  ('aaaaaa01-0000-0000-0000-000000000001',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'DirtSync Shipper', 'engineer', 'Shipper', NULL, 'paused',
   'claude_local',
   '{"cwd":"/Users/dirtsyncmini/DirtSync","cliFlags":["--dangerously-skip-permissions"]}',
   NULL,
   'You are the DirtSync Shipper. Ship features.',
   '/Users/dirtsyncmini/MCMForge/agents/dirtsync/SHIPPER.md',
   ARRAY['forge-ship','github-pr'],
   NULL, 5000,
   '2026-04-23T23:00:00.240Z', '2026-04-23T23:00:00.240Z'),

  ('aaaaaa02-0000-0000-0000-000000000002',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'DirtSync Fixer', 'engineer', 'Fixer', NULL, 'idle',
   'claude_local',
   '{"cwd":"/Users/dirtsyncmini/DirtSync"}',
   'You are a fixer.',
   NULL, NULL,
   ARRAY[]::TEXT[],
   NULL, 3000,
   '2026-04-23T23:00:00.240Z', '2026-04-23T23:00:00.240Z');

-- Project (1 row)
INSERT INTO public.projects (id, company_id, name, description, status, repo_url, repo_branch, workspace_dir, color, target_date, created_at, updated_at) VALUES
  ('bbbbbb01-0000-0000-0000-000000000001',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'DirtSync iOS', 'Main iOS app project', 'active',
   'https://github.com/mcm/DirtSync', 'master',
   '/Users/dirtsyncmini/DirtSync', '#3b82f6', '2026-06-30',
   '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

-- Goals (2 rows)
INSERT INTO public.goals (id, company_id, title, description, level, status, parent_id, owner_agent_id, created_at, updated_at, completed_at) VALUES
  ('cccccc01-0000-0000-0000-000000000001',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'Ship DirtSync v1 to TestFlight', 'Get the app to external testers',
   'company', 'active', NULL, NULL,
   '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', NULL),

  ('cccccc02-0000-0000-0000-000000000002',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'Stabilize Navigation', 'Fix all nav trust bugs',
   'team', 'active', NULL,
   'aaaaaa02-0000-0000-0000-000000000002',
   '2026-04-05T00:00:00.000Z', '2026-04-05T00:00:00.000Z', NULL);

-- Issues (5 rows — mix of statuses including in_review for enum-delta test)
INSERT INTO public.issues (id, company_id, project_id, parent_id, title, description, status, priority, identifier, issue_number, assignee_agent_id, acceptance_criteria, tags, branch_name, pr_url, goal_id, started_at, completed_at, cancelled_at, created_at, updated_at) VALUES

  ('dddddd01-0000-0000-0000-000000000001',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'bbbbbb01-0000-0000-0000-000000000001',
   NULL,
   'Fix turn-by-turn voice bug',
   'Voice instructions cut off after 3 turns',
   'done', 'high', 'DIR-12', 12,
   'aaaaaa01-0000-0000-0000-000000000001',
   '[{"text":"Voice plays all turns","done":true}]',
   ARRAY['nav','audio'],
   'feat/dir-12-voice-bug', 'https://github.com/mcm/DirtSync/pull/42',
   'cccccc01-0000-0000-0000-000000000001',
   '2026-04-21T09:00:00.000Z', '2026-04-25T14:00:00.000Z', NULL,
   '2026-04-20T10:00:00.000Z', '2026-04-25T15:00:00.000Z'),

  ('dddddd02-0000-0000-0000-000000000002',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'bbbbbb01-0000-0000-0000-000000000001',
   NULL,
   'Saved destinations screen',
   'Show saved destinations on home screen',
   'in_review', 'medium', 'DIR-15', 15,
   'aaaaaa02-0000-0000-0000-000000000002',
   '[]',
   ARRAY['ux'],
   NULL, NULL, NULL,
   NULL, NULL, NULL,
   '2026-04-28T10:00:00.000Z', '2026-04-28T10:00:00.000Z'),

  ('dddddd03-0000-0000-0000-000000000003',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   NULL, NULL,
   'Fix map centering on launch',
   NULL,
   'backlog', 'low', 'DIR-7', 7,
   NULL,
   '[]',
   ARRAY[]::TEXT[],
   NULL, NULL, NULL,
   NULL, NULL, NULL,
   '2026-04-10T08:00:00.000Z', '2026-04-10T08:00:00.000Z'),

  ('dddddd04-0000-0000-0000-000000000004',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'bbbbbb01-0000-0000-0000-000000000001',
   NULL,
   'Trucker mode: bridge clearance gate',
   'Add bridge height filter to routing',
   'in_progress', 'high', 'DIR-33', 33,
   'aaaaaa01-0000-0000-0000-000000000001',
   '[{"text":"Routes avoid bridges under 13ft","done":false}]',
   ARRAY['routing','trucker'],
   'feat/dir-33-bridge-gate', NULL,
   'cccccc02-0000-0000-0000-000000000002',
   '2026-05-01T10:00:00.000Z', NULL, NULL,
   '2026-05-01T09:00:00.000Z', '2026-05-01T10:00:00.000Z'),

  ('dddddd05-0000-0000-0000-000000000005',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'bbbbbb01-0000-0000-0000-000000000001',
   NULL,
   'Re-center button persistence',
   'Re-center button should survive backgrounding',
   'todo', 'medium', 'DIR-41', 41,
   NULL,
   '[]',
   ARRAY['ux','map'],
   NULL, NULL, NULL,
   NULL, NULL, NULL,
   '2026-05-03T08:00:00.000Z', '2026-05-03T08:00:00.000Z');

-- Comments (20 rows — 4 per issue)
INSERT INTO public.issue_comments (id, company_id, issue_id, author_agent_id, author_user_id, body, mentions, created_by_run_id, created_at, updated_at) VALUES

  -- DIR-12 comments (4)
  ('eeeeee01-0000-0000-0000-000000000001', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd01-0000-0000-0000-000000000001',
   'aaaaaa01-0000-0000-0000-000000000001', NULL,
   'Fixed the audio session configuration. Using AVAudioSession.sharedInstance().setCategory(.playback).',
   ARRAY[]::TEXT[], NULL, '2026-04-25T12:00:00.000Z', '2026-04-25T12:00:00.000Z'),

  ('eeeeee02-0000-0000-0000-000000000002', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd01-0000-0000-0000-000000000001',
   NULL, 'steve',
   'LGTM, merging.',
   ARRAY['DirtSync Shipper'], NULL, '2026-04-25T13:00:00.000Z', '2026-04-25T13:00:00.000Z'),

  ('eeeeee03-0000-0000-0000-000000000003', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd01-0000-0000-0000-000000000001',
   'aaaaaa01-0000-0000-0000-000000000001', NULL,
   'PR #42 opened. Simulator screenshot attached. XCUITest passing 4/4.',
   ARRAY[]::TEXT[], NULL, '2026-04-25T14:00:00.000Z', '2026-04-25T14:00:00.000Z'),

  ('eeeeee04-0000-0000-0000-000000000004', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd01-0000-0000-0000-000000000001',
   NULL, 'steve',
   'Confirmed on device. Merged.',
   ARRAY[]::TEXT[], NULL, '2026-04-25T15:00:00.000Z', '2026-04-25T15:00:00.000Z'),

  -- DIR-15 comments (4)
  ('eeeeee05-0000-0000-0000-000000000005', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd02-0000-0000-0000-000000000002',
   'aaaaaa02-0000-0000-0000-000000000002', NULL,
   'Starting on saved destinations screen. Reading existing HomeView.swift.',
   ARRAY[]::TEXT[], NULL, '2026-04-28T10:30:00.000Z', '2026-04-28T10:30:00.000Z'),

  ('eeeeee06-0000-0000-0000-000000000006', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd02-0000-0000-0000-000000000002',
   'aaaaaa02-0000-0000-0000-000000000002', NULL,
   'Implemented SavedDestinationsView. Needs review.',
   ARRAY[]::TEXT[], NULL, '2026-04-28T14:00:00.000Z', '2026-04-28T14:00:00.000Z'),

  ('eeeeee07-0000-0000-0000-000000000007', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd02-0000-0000-0000-000000000002',
   NULL, 'steve',
   'Review requested. Looks good but need the empty-state handled.',
   ARRAY['DirtSync Fixer'], NULL, '2026-04-28T15:00:00.000Z', '2026-04-28T15:00:00.000Z'),

  ('eeeeee08-0000-0000-0000-000000000008', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd02-0000-0000-0000-000000000002',
   'aaaaaa02-0000-0000-0000-000000000002', NULL,
   'Added empty state. Screenshot in artifacts.',
   ARRAY[]::TEXT[], NULL, '2026-04-28T16:00:00.000Z', '2026-04-28T16:00:00.000Z'),

  -- DIR-7 comments (4)
  ('eeeeee09-0000-0000-0000-000000000009', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd03-0000-0000-0000-000000000003',
   NULL, 'steve',
   'Map centers on last known location, not current. Regression from DIR-5.',
   ARRAY[]::TEXT[], NULL, '2026-04-10T08:00:00.000Z', '2026-04-10T08:00:00.000Z'),

  ('eeeeee10-0000-0000-0000-000000000010', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd03-0000-0000-0000-000000000003',
   'aaaaaa01-0000-0000-0000-000000000001', NULL,
   'Root cause: CLLocationManager not started before first region request.',
   ARRAY[]::TEXT[], NULL, '2026-04-10T09:00:00.000Z', '2026-04-10T09:00:00.000Z'),

  ('eeeeee11-0000-0000-0000-000000000011', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd03-0000-0000-0000-000000000003',
   'aaaaaa01-0000-0000-0000-000000000001', NULL,
   'Fix is simple: call manager.startUpdatingLocation() in viewDidLoad.',
   ARRAY[]::TEXT[], NULL, '2026-04-10T10:00:00.000Z', '2026-04-10T10:00:00.000Z'),

  ('eeeeee12-0000-0000-0000-000000000012', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd03-0000-0000-0000-000000000003',
   NULL, 'steve',
   'Punting until we get navigation stable. Moving to backlog.',
   ARRAY[]::TEXT[], NULL, '2026-04-10T11:00:00.000Z', '2026-04-10T11:00:00.000Z'),

  -- DIR-33 comments (4)
  ('eeeeee13-0000-0000-0000-000000000013', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd04-0000-0000-0000-000000000004',
   NULL, 'steve',
   'Key trucker gate: avoid any bridge with < 13ft clearance.',
   ARRAY[]::TEXT[], NULL, '2026-05-01T09:00:00.000Z', '2026-05-01T09:00:00.000Z'),

  ('eeeeee14-0000-0000-0000-000000000014', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd04-0000-0000-0000-000000000004',
   'aaaaaa01-0000-0000-0000-000000000001', NULL,
   'Reading Valhalla costing parameters. maxheight filter should work.',
   ARRAY[]::TEXT[], NULL, '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'),

  ('eeeeee15-0000-0000-0000-000000000015', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd04-0000-0000-0000-000000000004',
   'aaaaaa01-0000-0000-0000-000000000001', NULL,
   'Added truck profile with maxheight:3.96 (13ft in meters) to HybridRoutingService.',
   ARRAY[]::TEXT[], NULL, '2026-05-01T12:00:00.000Z', '2026-05-01T12:00:00.000Z'),

  ('eeeeee16-0000-0000-0000-000000000016', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd04-0000-0000-0000-000000000004',
   'aaaaaa01-0000-0000-0000-000000000001', NULL,
   'Simulator test: route avoids Montlake bridge (14.5ft). Tests pass.',
   ARRAY[]::TEXT[], NULL, '2026-05-01T14:00:00.000Z', '2026-05-01T14:00:00.000Z'),

  -- DIR-41 comments (4)
  ('eeeeee17-0000-0000-0000-000000000017', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd05-0000-0000-0000-000000000005',
   NULL, 'steve',
   'Re-center button disappears after app goes to background.',
   ARRAY[]::TEXT[], NULL, '2026-05-03T08:00:00.000Z', '2026-05-03T08:00:00.000Z'),

  ('eeeeee18-0000-0000-0000-000000000018', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd05-0000-0000-0000-000000000005',
   NULL, 'steve',
   'Repro: start nav, background, foreground. Button is gone.',
   ARRAY[]::TEXT[], NULL, '2026-05-03T08:30:00.000Z', '2026-05-03T08:30:00.000Z'),

  ('eeeeee19-0000-0000-0000-000000000019', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd05-0000-0000-0000-000000000005',
   NULL, 'steve',
   'Suspect the @State variable resets on scene restoration.',
   ARRAY[]::TEXT[], NULL, '2026-05-03T09:00:00.000Z', '2026-05-03T09:00:00.000Z'),

  ('eeeeee20-0000-0000-0000-000000000020', '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'dddddd05-0000-0000-0000-000000000005',
   NULL, 'steve',
   'Assigning to Fixer for investigation.',
   ARRAY['DirtSync Fixer'], NULL, '2026-05-03T09:30:00.000Z', '2026-05-03T09:30:00.000Z');

-- Approvals (3 rows)
INSERT INTO public.approvals (id, company_id, type, requested_by_agent_id, status, payload, decision_note, decided_by_user_id, decided_at, run_id, created_at, updated_at) VALUES

  ('ffffff01-0000-0000-0000-000000000001',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'merge_pr', 'aaaaaa01-0000-0000-0000-000000000001',
   'approved',
   '{"pr_url":"https://github.com/mcm/DirtSync/pull/42","issue_id":"dddddd01-0000-0000-0000-000000000001"}',
   'Approved on device test.',
   'steve', '2026-04-25T15:30:00.000Z', NULL,
   '2026-04-25T14:30:00.000Z', '2026-04-25T15:30:00.000Z'),

  ('ffffff02-0000-0000-0000-000000000002',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'deploy_to_testflight', 'aaaaaa01-0000-0000-0000-000000000001',
   'pending',
   '{"build_number":"47","issue_id":"dddddd01-0000-0000-0000-000000000001"}',
   NULL,
   NULL, NULL, NULL,
   '2026-04-25T16:00:00.000Z', '2026-04-25T16:00:00.000Z'),

  ('ffffff03-0000-0000-0000-000000000003',
   '2fbacee3-14cf-4526-b577-96d062ef71f2',
   'merge_pr', 'aaaaaa02-0000-0000-0000-000000000002',
   'pending',
   '{"pr_url":"https://github.com/mcm/DirtSync/pull/55","issue_id":"dddddd02-0000-0000-0000-000000000002"}',
   NULL,
   NULL, NULL, NULL,
   '2026-04-28T16:30:00.000Z', '2026-04-28T16:30:00.000Z');

-- Operational tables — dummy rows (to prove they get dropped, not ported)
INSERT INTO public.heartbeat_runs (id, agent_id, status) VALUES
  (gen_random_uuid(), 'aaaaaa01-0000-0000-0000-000000000001', 'success'),
  (gen_random_uuid(), 'aaaaaa02-0000-0000-0000-000000000002', 'failed');

INSERT INTO public.cost_events (id, agent_id, amount_usd) VALUES
  (gen_random_uuid(), 'aaaaaa01-0000-0000-0000-000000000001', 0.12),
  (gen_random_uuid(), 'aaaaaa02-0000-0000-0000-000000000002', 0.08);
