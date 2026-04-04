# MCM Forge Orchestrator -- Project Plan

**Date:** 2026-04-03
**Status:** Draft
**Author:** COO + Claude Code

---

## 1. Executive Summary

MCM Forge Orchestrator replaces Paperclip as our agent orchestration layer. It is purpose-built for our stack: Supabase (Postgres + Realtime), Next.js on Vercel (dashboard), and a Mac Mini running a Node.js orchestrator process that spawns CLI agents (Claude, Gemini, Codex).

**Why build our own:**
- Paperclip bundles an embedded Postgres (PGlite), a Vite SPA, and an Express monolith. We already have Supabase and a Vercel-deployed Next.js app.
- Paperclip's plugin system, multi-tenant auth, billing, and embedded DB add complexity we don't need.
- We need first-class iOS simulator integration (visual QA loop) that Paperclip doesn't support.
- We need tight integration with our existing Supabase tables (companies, trail_systems, etc.).
- 46K stars means Paperclip moves fast and breaks things. Invisible issues (#2251), missing promptTemplate (#206), and hidden UI (#1423) cost us days.

**What we keep from Paperclip's design:**
- The heartbeat/wakeup/run lifecycle (proven pattern)
- CLI adapter architecture (spawn `claude -p`, `gemini -p`, `codex -p` as child processes)
- Session persistence (resume conversations across heartbeats)
- Git worktree isolation per task
- Issue board with single-assignee checkout semantics
- @-mention wakeups between agents
- Routine triggers with cron + catch-up policies
- Cost event ledger per agent per run
- Org hierarchy with `reportsTo` chains

**What we drop:**
- Embedded Postgres (use Supabase)
- Express API + Vite SPA (use Next.js API routes + React Server Components)
- Plugin system (YAGNI)
- Multi-tenant auth / sign-up flow (single-owner, Supabase auth)
- Better-Auth integration
- Company export/import
- Complex approval workflows (start with manual dashboard approval)
- Adapter marketplace (we support exactly 3 CLIs)

---

## 2. Architecture Overview

```
+---------------------+         +---------------------+
|   Vercel (Next.js)  |         |    Supabase         |
|   mcmforge.com      |<------->|    (Postgres +      |
|                     |  REST   |     Realtime +      |
|   - Dashboard UI    |  + WS   |     Storage +       |
|   - API Routes      |         |     Auth)           |
+---------------------+         +----------+----------+
                                           |
                                           | postgres + realtime
                                           |
                                +----------+----------+
                                |  Mac Mini           |
                                |  (orchestrator)     |
                                |                     |
                                |  - Poll loop        |
                                |  - Spawn CLIs       |
                                |  - Git worktrees    |
                                |  - Simulator ctrl   |
                                +---------------------+
```

**Three runtime components:**

1. **Supabase** -- All state. Postgres tables, Realtime subscriptions, Row Level Security, Edge Functions for webhooks.
2. **Mac Mini Orchestrator** -- Node.js process (`forge-orchestrator`) that polls Supabase for queued runs, spawns CLI processes, captures output, updates state. Also manages git worktrees and Xcode simulator for visual QA.
3. **Vercel Dashboard** -- Next.js App Router. Server Components read Supabase directly. Client Components subscribe to Realtime for live updates. API Routes handle mutations.

---

## 3. Supabase Schema

All tables live in the `forge` schema to avoid conflicts with existing MCM Forge tables in the `public` schema.

### 3.1 Core Tables

```sql
-- ============================================================
-- MCM Forge Orchestrator Schema
-- Supabase project: ncwxeeqvujgyiggkviqq
-- ============================================================

-- Use a dedicated schema to isolate orchestrator tables
create schema if not exists forge;

-- ============================================================
-- forge.companies
-- Maps to our 5 businesses. Lightweight -- just identity + budget.
-- ============================================================
create table forge.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  slug          text not null unique,           -- e.g. 'dirtsync', 'mcm-forge'
  status        text not null default 'active', -- active | paused
  issue_prefix  text not null unique,           -- e.g. 'DIRA', 'FORGE'
  issue_counter int  not null default 0,
  budget_monthly_cents int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- forge.projects
-- A project groups issues and maps to a repo / workspace.
-- ============================================================
create table forge.projects (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references forge.companies(id),
  name          text not null,
  description   text,
  status        text not null default 'active',  -- active | paused | archived
  repo_url      text,                            -- e.g. 'golfballnut/DirtSync'
  repo_branch   text default 'main',             -- default branch
  workspace_dir text,                            -- absolute path on Mac Mini
  color         text,
  target_date   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on forge.projects (company_id);

-- ============================================================
-- forge.agents
-- Each agent is a CLI personality with a heartbeat config.
-- ============================================================
create table forge.agents (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references forge.companies(id),
  name                 text not null,
  role                 text not null default 'engineer',  -- engineer | manager | scout | routine
  title                text,                               -- human-readable title
  icon                 text,                               -- emoji or URL
  status               text not null default 'idle',       -- idle | running | paused | error | terminated
  reports_to           uuid references forge.agents(id),
  
  -- CLI adapter config
  adapter_type         text not null default 'claude',     -- claude | gemini | codex
  adapter_config       jsonb not null default '{}',        -- model, maxTurns, timeoutSec, extraArgs, etc.
  prompt_template      text,                               -- Mustache template for heartbeat prompt
  bootstrap_prompt     text,                               -- One-time prompt for new sessions
  instructions_file    text,                               -- Path to AGENTS.md or similar
  skills               text[] not null default '{}',       -- Skill file names to inject
  
  -- Runtime state
  session_id           text,                               -- Current CLI session ID
  session_params       jsonb,                              -- Session resume params (cwd, etc.)
  last_heartbeat_at    timestamptz,
  
  -- Budget
  budget_monthly_cents int not null default 0,
  pause_reason         text,
  paused_at            timestamptz,
  
  -- Permissions
  can_create_agents    boolean not null default false,
  can_create_issues    boolean not null default true,
  
  -- Agent definition source
  definition_repo      text,                               -- Repo where AGENTS.md lives
  definition_path      text,                               -- Path within repo
  
  metadata             jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on forge.agents (company_id, status);
create index on forge.agents (company_id, reports_to);

-- ============================================================
-- forge.issues
-- Kanban board items. Single-assignee checkout model.
-- ============================================================
create table forge.issues (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references forge.companies(id),
  project_id            uuid references forge.projects(id),
  parent_id             uuid references forge.issues(id),
  
  title                 text not null,
  description           text,
  status                text not null default 'backlog',   -- backlog | todo | in_progress | in_review | done | cancelled
  priority              text not null default 'medium',    -- critical | high | medium | low
  
  -- Assignment
  assignee_agent_id     uuid references forge.agents(id),
  
  -- Execution tracking
  execution_run_id      uuid,                              -- FK added after runs table
  execution_locked_at   timestamptz,
  
  -- Origin tracking (for routines, @-mentions, etc.)
  origin_kind           text not null default 'manual',    -- manual | routine | mention | agent_created
  origin_id             text,                              -- routine_id, comment_id, etc.
  
  -- Identifiers
  issue_number          int,
  identifier            text unique,                       -- e.g. 'DIRA-42'
  
  -- Timestamps
  started_at            timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on forge.issues (company_id, status);
create index on forge.issues (company_id, assignee_agent_id, status);
create index on forge.issues (company_id, project_id);
create index on forge.issues (company_id, parent_id);

-- ============================================================
-- forge.issue_comments
-- Agent and human comments on issues. @-mentions parsed here.
-- ============================================================
create table forge.issue_comments (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references forge.companies(id),
  issue_id          uuid not null references forge.issues(id) on delete cascade,
  author_agent_id   uuid references forge.agents(id),
  author_user_id    text,                                  -- Supabase auth user ID
  body              text not null,
  mentions          text[] not null default '{}',           -- Agent names mentioned with @
  created_by_run_id uuid,                                  -- FK added after runs table
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on forge.issue_comments (issue_id, created_at);
create index on forge.issue_comments (company_id);

-- ============================================================
-- forge.runs
-- Every CLI invocation is a run. This is the heartbeat_runs equivalent.
-- ============================================================
create table forge.runs (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references forge.companies(id),
  agent_id           uuid not null references forge.agents(id),
  
  -- Lifecycle
  status             text not null default 'queued',       -- queued | running | succeeded | failed | cancelled | timed_out
  invocation_source  text not null default 'on_demand',    -- timer | assignment | on_demand | routine | mention
  trigger_detail     text,                                 -- manual | ping | system
  
  -- Context (what woke the agent)
  context_snapshot   jsonb,                                -- { issueId, wakeReason, commentId, ... }
  
  -- Process tracking
  process_pid        int,
  process_started_at timestamptz,
  exit_code          int,
  signal             text,
  timed_out          boolean not null default false,
  error              text,
  error_code         text,
  
  -- Session tracking
  session_id_before  text,
  session_id_after   text,
  session_params     jsonb,
  
  -- Output
  stdout_excerpt     text,
  stderr_excerpt     text,
  result_json        jsonb,                                -- Parsed CLI output
  summary            text,                                 -- Agent's summary of what it did
  
  -- Usage (token counts from CLI output)
  input_tokens       int not null default 0,
  cached_input_tokens int not null default 0,
  output_tokens      int not null default 0,
  cost_usd           numeric(10,4),
  model              text,
  
  -- Log storage
  log_ref            text,                                 -- Supabase Storage path
  log_bytes          bigint,
  
  -- Retry
  retry_of_run_id    uuid references forge.runs(id),
  
  started_at         timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on forge.runs (company_id, agent_id, started_at);
create index on forge.runs (agent_id, status);

-- Add FK from issues to runs now that both tables exist
alter table forge.issues
  add constraint issues_execution_run_fk
  foreign key (execution_run_id) references forge.runs(id) on delete set null;

alter table forge.issue_comments
  add constraint comments_run_fk
  foreign key (created_by_run_id) references forge.runs(id) on delete set null;

-- ============================================================
-- forge.run_events
-- Streaming log events for a run (stdout, stderr, lifecycle).
-- ============================================================
create table forge.run_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references forge.companies(id),
  run_id      uuid not null references forge.runs(id) on delete cascade,
  agent_id    uuid not null references forge.agents(id),
  seq         int not null,
  event_type  text not null,                               -- stdout | stderr | lifecycle | meta
  stream      text,                                        -- stdout | stderr | system
  level       text,                                        -- info | warn | error
  message     text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index on forge.run_events (run_id, seq);

-- ============================================================
-- forge.cost_events
-- Per-run cost ledger. One row per completed run.
-- ============================================================
create table forge.cost_events (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references forge.companies(id),
  agent_id          uuid not null references forge.agents(id),
  run_id            uuid references forge.runs(id),
  issue_id          uuid references forge.issues(id),
  project_id        uuid references forge.projects(id),
  
  provider          text not null,                         -- anthropic | google | openai
  model             text not null,
  billing_type      text not null default 'subscription',  -- api | subscription
  input_tokens      int not null default 0,
  cached_input_tokens int not null default 0,
  output_tokens     int not null default 0,
  cost_cents        int not null default 0,
  
  occurred_at       timestamptz not null,
  created_at        timestamptz not null default now()
);
create index on forge.cost_events (company_id, occurred_at);
create index on forge.cost_events (company_id, agent_id, occurred_at);

-- ============================================================
-- forge.routines
-- Scheduled recurring tasks assigned to agents.
-- ============================================================
create table forge.routines (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references forge.companies(id),
  project_id          uuid not null references forge.projects(id),
  title               text not null,
  description         text,
  assignee_agent_id   uuid not null references forge.agents(id),
  priority            text not null default 'medium',
  status              text not null default 'active',      -- active | paused | archived
  
  -- Schedule
  cron_expression     text not null,                       -- e.g. '0 9 * * *'
  timezone            text not null default 'America/New_York',
  next_run_at         timestamptz,
  last_triggered_at   timestamptz,
  
  -- Policies
  concurrency_policy  text not null default 'skip_if_active', -- skip_if_active | queue | coalesce
  catch_up_policy     text not null default 'skip_missed',     -- skip_missed | run_once | run_all
  
  -- Template
  prompt_template     text,                                -- Override agent's default prompt
  
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on forge.routines (company_id, status);
create index on forge.routines (next_run_at) where status = 'active';

-- ============================================================
-- forge.routine_runs
-- Links a routine trigger to the resulting issue/run.
-- ============================================================
create table forge.routine_runs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references forge.companies(id),
  routine_id      uuid not null references forge.routines(id) on delete cascade,
  status          text not null default 'received',        -- received | issue_created | skipped | coalesced | completed | failed
  triggered_at    timestamptz not null default now(),
  linked_issue_id uuid references forge.issues(id),
  linked_run_id   uuid references forge.runs(id),
  failure_reason  text,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index on forge.routine_runs (routine_id, created_at);

-- ============================================================
-- forge.wakeup_requests
-- Queue of pending agent wakeups (assignment, @-mention, timer, manual).
-- ============================================================
create table forge.wakeup_requests (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references forge.companies(id),
  agent_id          uuid not null references forge.agents(id),
  source            text not null,                         -- timer | assignment | on_demand | mention | routine
  trigger_detail    text,                                  -- manual | system | ping
  reason            text,
  payload           jsonb,
  status            text not null default 'queued',        -- queued | claimed | completed | failed | cancelled
  idempotency_key   text,
  run_id            uuid references forge.runs(id),
  claimed_at        timestamptz,
  finished_at       timestamptz,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on forge.wakeup_requests (agent_id, status);

-- ============================================================
-- forge.approvals
-- Simple approval queue (agent requests, human approves/rejects).
-- ============================================================
create table forge.approvals (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references forge.companies(id),
  type                  text not null,                     -- agent_hire | code_merge | deploy | budget_increase
  requested_by_agent_id uuid references forge.agents(id),
  status                text not null default 'pending',   -- pending | approved | rejected
  payload               jsonb not null,
  decision_note         text,
  decided_by_user_id    text,
  decided_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on forge.approvals (company_id, status);

-- ============================================================
-- forge.goals
-- OKR-style goals that projects and issues roll up to.
-- ============================================================
create table forge.goals (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references forge.companies(id),
  title           text not null,
  description     text,
  level           text not null default 'task',            -- vision | strategy | task
  status          text not null default 'planned',         -- planned | active | completed | cancelled
  parent_id       uuid references forge.goals(id),
  owner_agent_id  uuid references forge.agents(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on forge.goals (company_id);

-- ============================================================
-- forge.execution_workspaces
-- Git worktree tracking for isolated agent work.
-- ============================================================
create table forge.execution_workspaces (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references forge.companies(id),
  project_id        uuid not null references forge.projects(id),
  issue_id          uuid references forge.issues(id),
  name              text not null,
  status            text not null default 'active',        -- active | closed | cleanup_pending
  strategy          text not null default 'project_primary', -- project_primary | git_worktree
  cwd               text,                                  -- Absolute path
  repo_url          text,
  base_ref          text,
  branch_name       text,
  worktree_path     text,
  last_used_at      timestamptz not null default now(),
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on forge.execution_workspaces (company_id, project_id, status);

-- ============================================================
-- RLS policies
-- Single-owner system. Supabase auth user = Steve.
-- All tables readable/writable by authenticated user.
-- ============================================================
alter table forge.companies enable row level security;
alter table forge.projects enable row level security;
alter table forge.agents enable row level security;
alter table forge.issues enable row level security;
alter table forge.issue_comments enable row level security;
alter table forge.runs enable row level security;
alter table forge.run_events enable row level security;
alter table forge.cost_events enable row level security;
alter table forge.routines enable row level security;
alter table forge.routine_runs enable row level security;
alter table forge.wakeup_requests enable row level security;
alter table forge.approvals enable row level security;
alter table forge.goals enable row level security;
alter table forge.execution_workspaces enable row level security;

-- Simple policy: authenticated users can do everything
-- (single-owner system, no multi-tenant needed)
do $$
declare
  tbl text;
begin
  for tbl in
    select table_name from information_schema.tables
    where table_schema = 'forge'
  loop
    execute format(
      'create policy "auth_full_access" on forge.%I for all to authenticated using (true) with check (true)',
      tbl
    );
  end loop;
end;
$$;

-- Service role (used by Mac Mini orchestrator) bypasses RLS automatically.
-- The orchestrator connects with the service_role key.

-- ============================================================
-- Realtime publication
-- Enable Supabase Realtime on key tables for dashboard live updates.
-- ============================================================
alter publication supabase_realtime add table forge.agents;
alter publication supabase_realtime add table forge.issues;
alter publication supabase_realtime add table forge.runs;
alter publication supabase_realtime add table forge.run_events;
alter publication supabase_realtime add table forge.wakeup_requests;
alter publication supabase_realtime add table forge.approvals;
alter publication supabase_realtime add table forge.routines;
```

### 3.2 Schema Notes

- **forge schema** keeps orchestrator tables separate from existing MCM Forge app tables.
- **No Drizzle ORM.** We use raw SQL migrations via Supabase CLI and the `@supabase/supabase-js` client. This removes a build step and keeps the schema as source of truth.
- **RLS** is enabled but permissive (single-owner). If we ever need agent-scoped access, we add policies that check `agent_id` against a JWT claim.
- **Realtime** is enabled on the 7 tables that the dashboard needs live updates for.

---

## 4. Mac Mini Orchestrator

### 4.1 File Structure

```
forge-orchestrator/
  package.json
  tsconfig.json
  .env                          # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
  src/
    index.ts                    # Entry point, starts all loops
    config.ts                   # Env var loading
    supabase.ts                 # Supabase client (service_role)
    
    loops/
      heartbeat-scheduler.ts    # Timer-based wakeups (check agent intervals)
      run-executor.ts           # Poll queued runs, claim, spawn, finalize
      routine-scheduler.ts      # Check cron schedules, create wakeups
      orphan-reaper.ts          # Detect stuck/orphaned runs
      
    adapters/
      types.ts                  # Adapter interface
      claude.ts                 # Claude CLI adapter
      gemini.ts                 # Gemini CLI adapter
      codex.ts                  # Codex CLI adapter
      registry.ts               # Adapter lookup by type
      
    workspace/
      worktree.ts               # Git worktree create/cleanup
      resolver.ts               # Resolve cwd for a run
      
    services/
      wakeup.ts                 # Create wakeup requests
      issue-lifecycle.ts        # Issue checkout/release/promote
      cost-ledger.ts            # Record cost events
      mention-parser.ts         # Parse @agent from comments
      session-manager.ts        # Session resume/rotate logic
      
    utils/
      child-process.ts          # Spawn + capture with timeout
      logger.ts                 # pino logger
      template.ts               # Mustache rendering
```

### 4.2 Core Orchestration Loop

The orchestrator runs four concurrent loops:

```typescript
// src/index.ts
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config.js';
import { startRunExecutor } from './loops/run-executor.js';
import { startHeartbeatScheduler } from './loops/heartbeat-scheduler.js';
import { startRoutineScheduler } from './loops/routine-scheduler.js';
import { startOrphanReaper } from './loops/orphan-reaper.js';
import { logger } from './utils/logger.js';

const config = loadConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

async function main() {
  logger.info('MCM Forge Orchestrator starting');

  // 1. On startup, reap any orphaned runs from previous crash
  await startOrphanReaper(supabase, { runOnce: true });

  // 2. Start concurrent loops
  await Promise.all([
    startRunExecutor(supabase, config),        // 5s poll: claim + spawn queued runs
    startHeartbeatScheduler(supabase, config),  // 30s poll: check agent timer intervals
    startRoutineScheduler(supabase, config),    // 60s poll: check cron schedules
    startOrphanReaper(supabase, config),        // 60s poll: detect stuck runs
  ]);
}

main().catch((err) => {
  logger.fatal(err, 'Orchestrator crashed');
  process.exit(1);
});
```

### 4.3 Run Executor (Core Loop)

This is the most critical component. It polls for queued runs, claims them atomically, spawns the CLI, captures output, and updates state.

```typescript
// src/loops/run-executor.ts
import { spawn } from 'node:child_process';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAdapter } from '../adapters/registry.js';
import { resolveWorkspace } from '../workspace/resolver.js';
import { recordCost } from '../services/cost-ledger.js';
import { releaseIssueExecution } from '../services/issue-lifecycle.js';
import { logger } from '../utils/logger.js';

const MAX_CONCURRENT_RUNS = 3;  // Mac Mini has 2 Claude Max accounts
const POLL_INTERVAL_MS = 5_000;
const activeRuns = new Map<string, { pid: number; abortController: AbortController }>();

export async function startRunExecutor(supabase: SupabaseClient, config: any) {
  setInterval(async () => {
    if (activeRuns.size >= MAX_CONCURRENT_RUNS) return;

    try {
      await claimAndExecuteNextRun(supabase, config);
    } catch (err) {
      logger.error(err, 'Run executor tick failed');
    }
  }, POLL_INTERVAL_MS);
}

async function claimAndExecuteNextRun(supabase: SupabaseClient, config: any) {
  // 1. Find oldest queued run
  const { data: queuedRuns } = await supabase
    .from('forge.runs')
    .select('*, agent:forge.agents(*)')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (!queuedRuns?.length) return;
  const run = queuedRuns[0];
  const agent = run.agent;

  // 2. Atomic claim (optimistic lock)
  const { data: claimed, error } = await supabase
    .from('forge.runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id)
    .eq('status', 'queued')  // Only claim if still queued
    .select()
    .single();

  if (error || !claimed) return; // Another instance claimed it

  // 3. Check agent is invokable
  if (agent.status === 'paused' || agent.status === 'terminated') {
    await cancelRun(supabase, run.id, `Agent ${agent.name} is ${agent.status}`);
    return;
  }

  // 4. Resolve workspace
  const workspace = await resolveWorkspace(supabase, agent, run);

  // 5. Spawn CLI
  logger.info({ runId: run.id, agent: agent.name }, 'Executing run');
  executeRun(supabase, config, run, agent, workspace);
}

async function executeRun(
  supabase: SupabaseClient,
  config: any,
  run: any,
  agent: any,
  workspace: { cwd: string; branchName?: string },
) {
  const adapter = getAdapter(agent.adapter_type);
  const abortController = new AbortController();

  try {
    const result = await adapter.execute({
      runId: run.id,
      agent,
      config: agent.adapter_config,
      promptTemplate: agent.prompt_template,
      bootstrapPrompt: agent.bootstrap_prompt,
      instructionsFile: agent.instructions_file,
      skills: agent.skills,
      sessionId: agent.session_id,
      sessionParams: agent.session_params,
      context: run.context_snapshot || {},
      cwd: workspace.cwd,
      signal: abortController.signal,
      onLog: async (stream, chunk) => {
        // Insert run_event for live streaming to dashboard
        await supabase.from('forge.run_events').insert({
          company_id: run.company_id,
          run_id: run.id,
          agent_id: run.agent_id,
          seq: Date.now(),  // Monotonic enough for ordering
          event_type: stream,
          stream,
          message: chunk,
        });
      },
      onSpawn: async (pid) => {
        activeRuns.set(run.id, { pid, abortController });
        await supabase
          .from('forge.runs')
          .update({ process_pid: pid, process_started_at: new Date().toISOString() })
          .eq('id', run.id);
      },
    });

    // 6. Finalize run
    const status = result.timedOut ? 'timed_out'
      : (result.exitCode === 0 ? 'succeeded' : 'failed');

    await supabase
      .from('forge.runs')
      .update({
        status,
        exit_code: result.exitCode,
        signal: result.signal,
        timed_out: result.timedOut,
        error: result.errorMessage,
        session_id_after: result.sessionId,
        session_params: result.sessionParams,
        result_json: result.resultJson,
        summary: result.summary,
        input_tokens: result.usage?.inputTokens ?? 0,
        cached_input_tokens: result.usage?.cachedInputTokens ?? 0,
        output_tokens: result.usage?.outputTokens ?? 0,
        cost_usd: result.costUsd,
        model: result.model,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    // 7. Update agent state
    await supabase
      .from('forge.agents')
      .update({
        status: status === 'succeeded' ? 'idle' : 'error',
        session_id: result.clearSession ? null : (result.sessionId ?? agent.session_id),
        session_params: result.clearSession ? null : (result.sessionParams ?? agent.session_params),
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id);

    // 8. Record cost
    if (result.usage) {
      await recordCost(supabase, {
        companyId: run.company_id,
        agentId: run.agent_id,
        runId: run.id,
        issueId: run.context_snapshot?.issueId,
        projectId: run.context_snapshot?.projectId,
        provider: result.provider ?? 'unknown',
        model: result.model ?? 'unknown',
        billingType: result.billingType ?? 'subscription',
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.cachedInputTokens ?? 0,
        outputTokens: result.usage.outputTokens,
        costCents: Math.round((result.costUsd ?? 0) * 100),
      });
    }

    // 9. Release issue execution lock
    await releaseIssueExecution(supabase, run);

  } catch (err) {
    logger.error({ err, runId: run.id }, 'Run execution failed');
    await supabase
      .from('forge.runs')
      .update({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);
  } finally {
    activeRuns.delete(run.id);
  }
}

async function cancelRun(supabase: SupabaseClient, runId: string, reason: string) {
  await supabase
    .from('forge.runs')
    .update({
      status: 'cancelled',
      error: reason,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
}
```

### 4.4 CLI Adapter Interface

```typescript
// src/adapters/types.ts
export interface AdapterExecuteInput {
  runId: string;
  agent: {
    id: string;
    companyId: string;
    name: string;
    adapter_config: Record<string, unknown>;
  };
  config: Record<string, unknown>;
  promptTemplate: string | null;
  bootstrapPrompt: string | null;
  instructionsFile: string | null;
  skills: string[];
  sessionId: string | null;
  sessionParams: Record<string, unknown> | null;
  context: Record<string, unknown>;
  cwd: string;
  signal: AbortSignal;
  onLog: (stream: 'stdout' | 'stderr', chunk: string) => Promise<void>;
  onSpawn: (pid: number) => Promise<void>;
}

export interface AdapterExecuteResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage: string | null;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null;
  sessionId: string | null;
  sessionParams: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
  billingType: string | null;
  costUsd: number | null;
  resultJson: Record<string, unknown> | null;
  summary: string | null;
  clearSession: boolean;
}

export interface CLIAdapter {
  type: string;
  execute(input: AdapterExecuteInput): Promise<AdapterExecuteResult>;
}
```

### 4.5 Claude Adapter

```typescript
// src/adapters/claude.ts
import { CLIAdapter, AdapterExecuteInput, AdapterExecuteResult } from './types.js';
import { runChildProcess } from '../utils/child-process.js';
import { renderTemplate } from '../utils/template.js';

export const claudeAdapter: CLIAdapter = {
  type: 'claude',

  async execute(input: AdapterExecuteInput): Promise<AdapterExecuteResult> {
    const config = input.config;
    const command = (config.command as string) || 'claude';
    const model = (config.model as string) || '';
    const maxTurns = (config.maxTurnsPerRun as number) || 0;
    const timeoutSec = (config.timeoutSec as number) || 0;
    const dangerouslySkipPermissions = (config.dangerouslySkipPermissions as boolean) || false;

    // Build prompt
    const template = input.promptTemplate ||
      'You are agent {{agent.id}} ({{agent.name}}). Execute your assigned work.';
    const prompt = renderTemplate(template, {
      agent: input.agent,
      context: input.context,
      run: { id: input.runId },
    });

    // Build args
    const args = ['--print', '-', '--output-format', 'stream-json', '--verbose'];
    if (input.sessionId) args.push('--resume', input.sessionId);
    if (dangerouslySkipPermissions) args.push('--dangerously-skip-permissions');
    if (model) args.push('--model', model);
    if (maxTurns > 0) args.push('--max-turns', String(maxTurns));
    if (input.instructionsFile) {
      args.push('--append-system-prompt-file', input.instructionsFile);
    }

    // Build env
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      FORGE_RUN_ID: input.runId,
      FORGE_AGENT_ID: input.agent.id,
      FORGE_AGENT_NAME: input.agent.name,
      FORGE_COMPANY_ID: input.agent.companyId,
    };

    // Add context env vars
    if (input.context.issueId) env.FORGE_ISSUE_ID = input.context.issueId as string;
    if (input.context.wakeReason) env.FORGE_WAKE_REASON = input.context.wakeReason as string;

    // Spawn process
    const result = await runChildProcess({
      command,
      args,
      cwd: input.cwd,
      env,
      stdin: prompt,
      timeoutSec,
      signal: input.signal,
      onLog: input.onLog,
      onSpawn: (pid) => input.onSpawn(pid),
    });

    // Parse Claude stream-json output
    return parseClaudeResult(result);
  },
};

function parseClaudeResult(proc: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
}): AdapterExecuteResult {
  // Parse the stream-json format line by line
  let sessionId: string | null = null;
  let model: string | null = null;
  let summary: string | null = null;
  let costUsd: number | null = null;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let resultJson: Record<string, unknown> | null = null;

  for (const line of proc.stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'system' && event.session_id) {
        sessionId = event.session_id;
      }
      if (event.type === 'system' && event.model) {
        model = event.model;
      }
      if (event.type === 'result') {
        resultJson = event;
        summary = event.result || event.summary || null;
        costUsd = event.total_cost_usd ?? null;
        inputTokens = event.usage?.input_tokens ?? 0;
        cachedInputTokens = event.usage?.cache_read_input_tokens ?? 0;
        outputTokens = event.usage?.output_tokens ?? 0;
        sessionId = event.session_id ?? sessionId;
      }
    } catch {
      // Not JSON, skip
    }
  }

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: proc.timedOut,
    errorMessage: proc.exitCode === 0 ? null : `Claude exited ${proc.exitCode}`,
    usage: { inputTokens, cachedInputTokens, outputTokens },
    sessionId,
    sessionParams: sessionId ? { sessionId, cwd: '' } : null,
    provider: 'anthropic',
    model,
    billingType: 'subscription',
    costUsd,
    resultJson,
    summary,
    clearSession: false,
  };
}
```

### 4.6 Gemini and Codex Adapters

Same pattern as Claude. Key differences:

**Gemini (`gemini -p`):**
- Uses `--output-format jsonl` instead of `stream-json`
- Skills injected to `~/.gemini/skills/` via symlinks
- Model default: `gemini-2.5-pro`
- Billing detection: `GEMINI_API_KEY` or `GOOGLE_API_KEY` present = api, else subscription

**Codex (`codex -p`):**
- Uses `--output-format jsonl`
- Managed CODEX_HOME per agent to isolate session state
- Model default: `codex-1` (or `o4-mini`)
- Billing detection: `OPENAI_API_KEY` present = api, else subscription

### 4.7 Process Management

```typescript
// src/utils/child-process.ts
import { spawn } from 'node:child_process';

interface RunOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdin?: string;
  timeoutSec: number;
  signal?: AbortSignal;
  onLog: (stream: 'stdout' | 'stderr', chunk: string) => Promise<void>;
  onSpawn: (pid: number) => void;
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
}

export async function runChildProcess(opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    opts.onSpawn(child.pid!);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      opts.onLog('stdout', text).catch(() => {});
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      opts.onLog('stderr', text).catch(() => {});
    });

    // Send prompt via stdin
    if (opts.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }

    // Timeout handling
    if (opts.timeoutSec > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Force kill after grace period
        setTimeout(() => child.kill('SIGKILL'), 20_000);
      }, opts.timeoutSec * 1000);
    }

    // Abort signal handling
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        child.kill('SIGTERM');
      });
    }

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal: signal ?? null,
        timedOut,
      });
    });
  });
}
```

### 4.8 Git Worktree Management

```typescript
// src/workspace/worktree.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);

export async function createWorktree(input: {
  repoDir: string;
  branchName: string;
  baseRef: string;
  worktreeParentDir: string;
}): Promise<string> {
  const worktreePath = path.join(input.worktreeParentDir, input.branchName);

  // Create branch from base
  await exec('git', ['-C', input.repoDir, 'fetch', 'origin', input.baseRef], {
    timeout: 60_000,
  });

  // Create worktree
  await exec('git', [
    '-C', input.repoDir,
    'worktree', 'add',
    '-b', input.branchName,
    worktreePath,
    `origin/${input.baseRef}`,
  ], { timeout: 60_000 });

  return worktreePath;
}

export async function removeWorktree(repoDir: string, worktreePath: string) {
  await exec('git', ['-C', repoDir, 'worktree', 'remove', '--force', worktreePath], {
    timeout: 30_000,
  }).catch(() => {});
}
```

### 4.9 Environment Variables

```
# .env for forge-orchestrator

# Supabase
SUPABASE_URL=https://ncwxeeqvujgyiggkviqq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Orchestrator
FORGE_MAX_CONCURRENT_RUNS=3
FORGE_RUN_POLL_INTERVAL_MS=5000
FORGE_HEARTBEAT_POLL_INTERVAL_MS=30000
FORGE_ROUTINE_POLL_INTERVAL_MS=60000

# Workspace
FORGE_WORKTREE_PARENT_DIR=/Users/dirtsyncmini/.forge/worktrees
FORGE_AGENT_HOME_DIR=/Users/dirtsyncmini/.forge/agents

# CLI paths (if not in PATH)
CLAUDE_COMMAND=claude
GEMINI_COMMAND=gemini
CODEX_COMMAND=codex
```

---

## 5. Vercel Dashboard (Next.js App Router)

### 5.1 Page Structure

```
app/
  layout.tsx                    # Root layout with nav sidebar
  page.tsx                      # Dashboard home (redirect to /agents or summary)
  
  agents/
    page.tsx                    # Agent list with status indicators
    [agentId]/
      page.tsx                  # Agent detail (config, recent runs, sessions)
      
  issues/
    page.tsx                    # Kanban board (backlog/todo/in_progress/done)
    [issueId]/
      page.tsx                  # Issue detail with comments, run history
      
  runs/
    page.tsx                    # Run history list with filters
    [runId]/
      page.tsx                  # Run detail with live log streaming
      
  routines/
    page.tsx                    # Routine list with schedules
    [routineId]/
      page.tsx                  # Routine detail with run history
      
  costs/
    page.tsx                    # Cost dashboard (by agent, by project, by day)
    
  approvals/
    page.tsx                    # Approval queue
    
  projects/
    page.tsx                    # Project list
    [projectId]/
      page.tsx                  # Project detail with issues, agents, workspaces
      
  org/
    page.tsx                    # Org chart (agent hierarchy visualization)
    
  settings/
    page.tsx                    # Instance settings
```

### 5.2 Key Components

**Live Agent Status Cards** -- Subscribe to `forge.agents` Realtime changes. Show status (idle/running/error), last heartbeat, current run, monthly spend.

**Kanban Board** -- Drag-and-drop (use `@dnd-kit`). Columns: Backlog, Todo, In Progress, In Review, Done. Cards show title, assignee, priority badge.

**Run Log Viewer** -- Subscribe to `forge.run_events` Realtime inserts filtered by `run_id`. Auto-scroll. Syntax-highlighted. Shows tool calls, thinking, assistant output.

**Cost Charts** -- Server Component that queries `forge.cost_events` with date range aggregation. Recharts for daily/weekly/monthly views.

**Approval Queue** -- Simple list of pending approvals. Approve/Reject buttons. Shows payload, requester, timestamp.

### 5.3 Supabase Realtime Integration

```typescript
// lib/supabase-realtime.ts
'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export function useRealtimeAgents() {
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    // Initial fetch
    supabase.from('forge.agents').select('*').then(({ data }) => {
      if (data) setAgents(data);
    });

    // Subscribe to changes
    const channel = supabase
      .channel('agents-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'forge',
        table: 'agents',
      }, (payload) => {
        setAgents((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new];
          if (payload.eventType === 'UPDATE') {
            return prev.map((a) => a.id === payload.new.id ? payload.new : a);
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter((a) => a.id !== payload.old.id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return agents;
}

export function useRealtimeRunEvents(runId: string) {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    // Initial fetch
    supabase
      .from('forge.run_events')
      .select('*')
      .eq('run_id', runId)
      .order('seq', { ascending: true })
      .then(({ data }) => { if (data) setEvents(data); });

    // Subscribe to new events
    const channel = supabase
      .channel(`run-events-${runId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'forge',
        table: 'run_events',
        filter: `run_id=eq.${runId}`,
      }, (payload) => {
        setEvents((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [runId]);

  return events;
}
```

---

## 6. Agent Definition Format

### 6.1 AGENTS.md Structure

Each repo that agents work in has an `AGENTS.md` at the root. This is the primary instruction source for all agents in that project.

```markdown
# AGENTS.md

## Project Context
DirtSync is an iOS trail navigation app built with SwiftUI + MapLibre + Ferrostar.

## Build & Test
- Build: `xcodebuild -scheme DirtSync -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16 Pro'`
- Test: `xcodebuild test -scheme DirtSync -sdk iphonesimulator`
- Lint: `swiftlint`

## Architecture
- `DirtSync/Views/` -- SwiftUI views
- `DirtSync/Services/` -- Business logic
- `DirtSync/Map/` -- MapLibre integration

## Engineering Rules
1. Never push to master. Feature branch -> PR -> approval -> merge.
2. Screenshot BEFORE and AFTER visual changes.
3. Run tests before marking issues done.
```

### 6.2 Agent Definition in Database

Agents are defined in the `forge.agents` table. Key fields:

- `adapter_type`: `claude` | `gemini` | `codex`
- `adapter_config`: JSON with CLI-specific options:
  ```json
  {
    "model": "claude-sonnet-4-20250514",
    "maxTurnsPerRun": 10,
    "timeoutSec": 300,
    "dangerouslySkipPermissions": true,
    "command": "claude"
  }
  ```
- `prompt_template`: Mustache template rendered with `{ agent, context, run }`.
- `instructions_file`: Absolute path to AGENTS.md or a domain-specific instructions file.
- `skills`: Array of skill file names (resolved from the repo's `skills/` directory).

### 6.3 Skills Format

Skills are markdown files in the repo's `.claude/skills/` or `vault/agents/skills/` directory. They are injected into the CLI via `--add-dir` (Claude) or symlinks (Gemini/Codex).

No change from our current approach.

### 6.4 Loading Agent Definitions

On agent creation via the dashboard, the user specifies:
- Name, role, company, adapter type
- Adapter config (model, turns, timeout)
- Instructions file path
- Skill names

The orchestrator reads `instructions_file` from disk at execution time, not at definition time. This means updating AGENTS.md takes effect on the next heartbeat without touching the database.

---

## 7. Build Phases

### Phase 1: Schema + Orchestrator Core (Week 1)

**Goal:** One agent can execute one task from the CLI.

**Deliverables:**
1. Apply Supabase migration (all tables in `forge` schema)
2. `forge-orchestrator` project scaffolded with:
   - `src/index.ts` -- Entry point
   - `src/supabase.ts` -- Client
   - `src/loops/run-executor.ts` -- Poll + claim + spawn + finalize
   - `src/adapters/claude.ts` -- Claude adapter
   - `src/adapters/types.ts` -- Adapter interface
   - `src/utils/child-process.ts` -- Process spawner
   - `src/utils/logger.ts` -- pino
3. Manual test: Insert a row into `forge.agents` and `forge.runs` (status=queued), watch orchestrator claim it, spawn `claude -p`, capture output, update run to succeeded.

**Validation:**
- `INSERT INTO forge.runs (agent_id, company_id, status, context_snapshot) VALUES (..., 'queued', '{"wakeReason": "test"}')` triggers execution
- Run row transitions: queued -> running -> succeeded
- Agent row updated with session_id, last_heartbeat_at
- Cost event recorded

### Phase 2: Dashboard MVP (Week 2)

**Goal:** View agents, issues, and runs in the browser.

**Deliverables:**
1. Next.js pages: `/agents`, `/agents/[id]`, `/issues`, `/issues/[id]`, `/runs`, `/runs/[id]`
2. Supabase auth (Steve's account only)
3. Realtime subscriptions for agent status and run events
4. Issue creation form (title, description, assignee, priority, project)
5. Run log viewer with streaming output

**Validation:**
- Navigate to mcmforge.com/agents, see all agents with live status
- Create an issue, assign it to an agent, see it wake up
- Watch run logs stream in real-time

### Phase 3: Heartbeats + Wakeups + Routines (Week 3)

**Goal:** Agents wake on timers, issue assignment triggers wakeup, routines fire on cron.

**Deliverables:**
1. `src/loops/heartbeat-scheduler.ts` -- Timer-based wakeups based on agent `adapter_config.intervalSec`
2. `src/services/wakeup.ts` -- Create wakeup requests, claim them
3. Issue assignment wakeup: When issue is assigned to agent, insert wakeup_request
4. `src/loops/routine-scheduler.ts` -- Check `forge.routines` cron schedules
5. Routine execution: Create issue from routine, assign to agent, trigger wakeup
6. Dashboard: `/routines` page with schedule display

**Validation:**
- Agent with `intervalSec: 60` wakes every 60 seconds
- Assigning an issue to an agent triggers immediate execution
- Routine with `0 9 * * *` fires at 9 AM and creates an issue

### Phase 4: @-Mentions + Git Worktrees + Gemini/Codex (Week 4)

**Goal:** Agents can communicate via comments. Each task gets an isolated branch. All 3 CLIs work.

**Deliverables:**
1. `src/services/mention-parser.ts` -- Parse `@AgentName` from issue comments
2. @-mention wakeup: When comment mentions an agent, wake it with comment context
3. `src/workspace/worktree.ts` -- Create/cleanup git worktrees
4. `src/workspace/resolver.ts` -- Resolve cwd for a run (project primary vs worktree)
5. `src/adapters/gemini.ts` -- Gemini CLI adapter
6. `src/adapters/codex.ts` -- Codex CLI adapter
7. Dashboard: Comment form on issue detail page

**Validation:**
- Comment "@Build-Agent please review this" wakes Build-Agent with comment context
- Issue in project with `git_worktree` strategy creates isolated branch
- Gemini and Codex agents execute successfully

### Phase 5: Visual QA + Cost Tracking + Org Chart (Week 5)

**Goal:** Full feature parity with what we need from Paperclip, plus iOS simulator integration.

**Deliverables:**
1. Visual QA loop: Orchestrator can trigger Xcode build, launch simulator, take screenshot
2. Cost dashboard with charts (by agent, by project, by day)
3. Org chart visualization (D3 or Mermaid)
4. Approval queue UI (approve/reject agent actions)
5. Orphan reaper loop (detect stuck runs, auto-retry once)
6. Session compaction (rotate sessions after N runs or M tokens)

**Validation:**
- QA agent builds DirtSync, takes simulator screenshot, posts to issue
- Cost page shows daily spend breakdown by agent
- Org chart renders agent hierarchy

---

## 8. Migration Path from Paperclip

### 8.1 Current Paperclip State

- **DIRA company:** `b724f8bb-9567-47a1-8ec6-fd8e23c70093`
- **34 agents total:** 7 ship specialists + 20 routine + Routine Manager + 2 retired + COO + Trail Data Expert + Drive Publisher + Build & Test
- **~16 active routines** with cron schedules
- **Issue history** we want to preserve

### 8.2 Migration Strategy

**Phase A: Export from Paperclip (scripted)**

```bash
# Export agents
curl -s http://localhost:3100/api/companies/DIRA/agents | jq > paperclip-agents.json

# Export issues (paginated)
curl -s "http://localhost:3100/api/companies/DIRA/issues?limit=1000" | jq > paperclip-issues.json

# Export routines
curl -s http://localhost:3100/api/companies/DIRA/routines | jq > paperclip-routines.json
```

**Phase B: Transform + Import to Supabase**

Write a `scripts/migrate-from-paperclip.ts` that:
1. Maps Paperclip agent fields to `forge.agents` columns
2. Maps adapter configs (Paperclip uses `claude_local` -> we use `claude`)
3. Preserves issue identifiers (DIRA-1, DIRA-2, etc.)
4. Maps routine cron expressions and assignee references
5. Does NOT import run history (too large, not needed)

**Phase C: Parallel Running**

1. Start Forge Orchestrator on Mac Mini alongside Paperclip
2. Paperclip agents: pause all heartbeats
3. Forge agents: enable heartbeats one at a time
4. Validate each agent works (check run logs)
5. Once all agents work: stop Paperclip permanently

**Phase D: Cleanup**

1. Remove Paperclip from Mac Mini
2. Delete Paperclip data directory
3. Update all agent instructions files to reference Forge env vars instead of Paperclip env vars (`FORGE_*` instead of `PAPERCLIP_*`)

### 8.3 Risk Mitigation

- **Keep Paperclip data backup** for 30 days after full cutover
- **Don't migrate sessions** -- let agents start fresh sessions (avoids cwd mismatch issues)
- **Test with one routine agent first** (e.g., Trail Data Health) before migrating ship team

---

## 9. Key Design Decisions

### 9.1 Why Supabase Instead of Embedded Postgres

Paperclip bundles PGlite/embedded-postgres which:
- Requires data directory management
- Needs manual backup scripts
- Can't be queried from Vercel
- Loses data if Mac Mini disk fails

Supabase gives us:
- Managed Postgres with automatic backups
- Realtime subscriptions built-in
- Row Level Security
- Direct access from Vercel (no API proxy needed)
- Dashboard for ad-hoc queries
- Edge Functions for webhook receivers

### 9.2 Why Next.js Instead of Vite SPA

Paperclip's UI is a Vite SPA served by the Express server. Problems:
- Requires the Express server to be running for UI access
- No SSR, slow initial load
- All data goes through REST API calls

Next.js App Router gives us:
- Server Components read Supabase directly (no API needed for reads)
- Client Components subscribe to Realtime for live updates
- Vercel deployment = always available, even if Mac Mini is down
- API Routes for mutations (thin wrappers around Supabase)

### 9.3 Why Three Separate Loops Instead of One

Paperclip uses a single heartbeat scheduler that handles timers, wakeups, and orphan detection. This creates complex interleaving and race conditions (#1971).

We separate concerns:
- **Run Executor** (5s poll): Claims queued runs, spawns processes. This is latency-sensitive.
- **Heartbeat Scheduler** (30s poll): Checks agent timer intervals, creates wakeup requests. Not latency-sensitive.
- **Routine Scheduler** (60s poll): Checks cron schedules, creates issues and wakeups. Not latency-sensitive.
- **Orphan Reaper** (60s poll): Detects stuck runs. Rare, but important for reliability.

### 9.4 Why We Don't Need a Plugin System

Paperclip has 20+ plugin-related files (plugin-loader, plugin-registry, plugin-event-bus, plugin-worker-manager, etc.). This supports third-party integrations.

We have exactly 5 integrations: Supabase, GitHub, ClickUp, Google Workspace, and the iOS Simulator. All are accessed via MCP tools or CLI commands. No plugin system needed.

### 9.5 Session Management Strategy

Paperclip's session management is complex (500+ lines in heartbeat.ts) because it supports multiple adapter types with different session semantics.

Our simplified approach:
- Store `session_id` and `session_params` on the agent row
- On each run, pass `--resume <session_id>` to the CLI
- If resume fails (session expired), retry without `--resume`
- Rotate sessions after `maxSessionRuns` or `maxSessionAgeHours` (configured per agent)
- When rotating, generate a handoff summary from the last run's result

---

## 10. Estimated Effort

| Phase | Scope | Effort | Dependencies |
|-------|-------|--------|-------------|
| 1 | Schema + Orchestrator Core | 3 days | Supabase access |
| 2 | Dashboard MVP | 3 days | Phase 1 |
| 3 | Heartbeats + Routines | 2 days | Phase 2 |
| 4 | @-Mentions + Worktrees + Multi-CLI | 3 days | Phase 3 |
| 5 | Visual QA + Cost + Org | 3 days | Phase 4 |
| Migration | Export + Import + Validate | 2 days | Phase 3 |

**Total: ~16 working days (3-4 weeks with testing)**

The migration can overlap with Phase 4-5 development. Non-blocking agents (routines) migrate first; ship team migrates last.

---

## 11. Open Questions

1. **Schema namespace:** Do we use `forge` schema or add tables to `public`? This plan assumes `forge` schema but Supabase Realtime works best with `public`. May need to adjust.

2. **Log storage:** Run logs can get large. Store in Supabase Storage (S3-compatible) or local filesystem? This plan assumes Supabase Storage for durability but local might be faster.

3. **Multi-Mac-Mini:** If we ever add a second Mac Mini, the orchestrator needs distributed locking. The current `UPDATE ... WHERE status='queued'` pattern is sufficient for single-instance. For multi-instance, add a `claimed_by` column with instance ID.

4. **Supabase Edge Functions:** Should routine triggers (webhook-based) use Edge Functions instead of polling? Saves latency for webhook-triggered routines but adds deployment complexity.

5. **Agent API keys:** Do agents need their own API keys to call back to Forge (like Paperclip's `pcp_` tokens)? Not needed initially since agents run locally and can use env vars. Add if we ever have remote agents.

---

## 12. References

- **Paperclip source:** github.com/paperclipai/paperclip (46K stars, 7K forks)
- **Paperclip architecture:** Express + Drizzle + embedded Postgres + Vite SPA
- **Key Paperclip files studied:**
  - `server/src/services/heartbeat.ts` -- Core orchestration loop (3000+ lines)
  - `server/src/services/agents.ts` -- Agent CRUD with org hierarchy
  - `server/src/services/routines.ts` -- Cron scheduling with catch-up
  - `server/src/services/issues.ts` -- Issue lifecycle with checkout semantics
  - `packages/adapters/claude-local/src/server/execute.ts` -- Claude CLI spawning
  - `packages/adapters/gemini-local/src/server/execute.ts` -- Gemini CLI spawning
  - `packages/adapters/codex-local/src/server/execute.ts` -- Codex CLI spawning
  - `packages/adapter-utils/src/types.ts` -- Adapter interface definitions
  - `packages/db/src/schema/*.ts` -- All 60+ schema tables
  - `ui/src/pages/*.tsx` -- 40+ UI pages (React + Vite)
  - `server/src/config.ts` -- Environment configuration
- **Paperclip issues studied:**
  - #1971: Stale execution run lock on checkout (148 comments)
  - #2251: Invisible issues (known bug affecting us)
  - #206: Missing promptTemplate (known bug affecting us)
  - #1423: Hidden UI elements (known bug affecting us)
  - #187: Local LLM support via Ollama (19 thumbs-up)
  - #1413: Chat/conversations panel (18 comments)
