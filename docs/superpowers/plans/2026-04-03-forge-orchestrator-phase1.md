# Forge Orchestrator Phase 1: Schema + Core Orchestrator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 14-table Supabase schema and build a Node.js orchestrator that polls for queued runs, spawns Claude CLI, captures output, and updates state.

**Architecture:** Supabase `forge` schema stores all state. A Node.js process (`forge-orchestrator/`) polls `forge.runs` for `status=queued`, claims atomically, spawns `claude --print - --output-format stream-json`, parses output, updates run + agent + cost rows. Four concurrent loops: run-executor (5s), heartbeat-scheduler (30s), routine-scheduler (60s), orphan-reaper (60s). Phase 1 only implements run-executor; other loops are stubs.

**Tech Stack:** Node.js 20+, TypeScript, `@supabase/supabase-js`, `pino` logger, `mustache` templates

**Source plan:** `docs/mcm-forge-orchestrator-plan.md` (Sections 3-4)

---

## File Structure

```
forge-orchestrator/
  package.json
  tsconfig.json
  .env.example
  src/
    index.ts                    # Entry point, starts all loops
    config.ts                   # Env var loading + validation
    supabase.ts                 # Supabase client (service_role)
    loops/
      run-executor.ts           # Poll queued runs, claim, spawn, finalize
      heartbeat-scheduler.ts    # Stub (Phase 3)
      routine-scheduler.ts      # Stub (Phase 3)
      orphan-reaper.ts          # Detect stuck/orphaned runs
    adapters/
      types.ts                  # CLIAdapter interface + types
      claude.ts                 # Claude CLI adapter
      registry.ts               # Adapter lookup by type
    services/
      cost-ledger.ts            # Record cost events
      issue-lifecycle.ts        # Issue checkout/release
    utils/
      child-process.ts          # Spawn + capture with timeout
      logger.ts                 # pino logger
      template.ts               # Mustache rendering
```

---

### Task 1: Apply Supabase Schema Migration

**Files:**
- Create: `supabase/migrations/20260403_forge_schema.sql`

This applies the full 14-table `forge` schema via the Supabase MCP tool.

- [ ] **Step 1: Apply the forge schema migration**

Use `mcp__supabase__apply_migration` with `project_id: "ncwxeeqvujgyiggkviqq"` and the full SQL from the plan (Section 3.1). The SQL creates:

1. `forge` schema
2. `forge.companies` — 5 businesses
3. `forge.projects` — repos/workspaces  
4. `forge.agents` — CLI personalities with heartbeat config
5. `forge.issues` — kanban items, single-assignee checkout
6. `forge.issue_comments` — agent/human comments with @-mentions
7. `forge.runs` — every CLI invocation
8. `forge.run_events` — streaming log events
9. `forge.cost_events` — per-run cost ledger
10. `forge.routines` — scheduled recurring tasks
11. `forge.routine_runs` — routine trigger -> issue/run link
12. `forge.wakeup_requests` — pending agent wakeups
13. `forge.approvals` — human approval queue
14. `forge.goals` — OKR-style goals
15. `forge.execution_workspaces` — git worktree tracking

Plus: indexes, FK constraints, RLS policies (permissive for single-owner), Realtime publication on 7 key tables.

The full SQL is in `docs/mcm-forge-orchestrator-plan.md` lines 82-536.

- [ ] **Step 2: Verify tables exist**

Run: `mcp__supabase__execute_sql` with:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'forge' 
ORDER BY table_name;
```

Expected: 15 table names (companies, projects, agents, issues, issue_comments, runs, run_events, cost_events, routines, routine_runs, wakeup_requests, approvals, goals, execution_workspaces).

- [ ] **Step 3: Seed test data**

```sql
-- Insert DirtSync company
INSERT INTO forge.companies (name, description, slug, status, issue_prefix, budget_monthly_cents)
VALUES ('DirtSync', 'Trail navigation app', 'dirtsync', 'active', 'DIRA', 0);

-- Insert MCM Forge company
INSERT INTO forge.companies (name, description, slug, status, issue_prefix, budget_monthly_cents)
VALUES ('MCM Forge', 'AI ops platform', 'mcm-forge', 'active', 'FORGE', 0);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260403_forge_schema.sql
git commit -m "feat: forge schema — 14 tables for orchestrator"
```

---

### Task 2: Scaffold forge-orchestrator Project

**Files:**
- Create: `forge-orchestrator/package.json`
- Create: `forge-orchestrator/tsconfig.json`
- Create: `forge-orchestrator/.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "forge-orchestrator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.97.0",
    "mustache": "^4.2.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0"
  },
  "devDependencies": {
    "@types/mustache": "^4.2.5",
    "@types/node": "^22.15.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create .env.example**

```
# Supabase
SUPABASE_URL=https://ncwxeeqvujgyiggkviqq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# Orchestrator
FORGE_MAX_CONCURRENT_RUNS=3
FORGE_RUN_POLL_INTERVAL_MS=5000
FORGE_HEARTBEAT_POLL_INTERVAL_MS=30000
FORGE_ROUTINE_POLL_INTERVAL_MS=60000

# Workspace
FORGE_WORKTREE_PARENT_DIR=/Users/dirtsyncmini/.forge/worktrees
FORGE_AGENT_HOME_DIR=/Users/dirtsyncmini/.forge/agents

# CLI paths
CLAUDE_COMMAND=claude
GEMINI_COMMAND=gemini
CODEX_COMMAND=codex
```

- [ ] **Step 4: Install dependencies**

```bash
cd forge-orchestrator && npm install
```

- [ ] **Step 5: Commit**

```bash
git add forge-orchestrator/package.json forge-orchestrator/tsconfig.json forge-orchestrator/.env.example
git commit -m "feat: scaffold forge-orchestrator project"
```

---

### Task 3: Config + Supabase Client + Logger

**Files:**
- Create: `forge-orchestrator/src/config.ts`
- Create: `forge-orchestrator/src/supabase.ts`
- Create: `forge-orchestrator/src/utils/logger.ts`

- [ ] **Step 1: Create config.ts**

```typescript
// src/config.ts
export interface ForgeConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  maxConcurrentRuns: number;
  runPollIntervalMs: number;
  heartbeatPollIntervalMs: number;
  routinePollIntervalMs: number;
  worktreeParentDir: string;
  agentHomeDir: string;
  claudeCommand: string;
  geminiCommand: string;
  codexCommand: string;
}

export function loadConfig(): ForgeConfig {
  const required = (key: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
  };

  const optional = (key: string, fallback: string): string =>
    process.env[key] || fallback;

  const optionalInt = (key: string, fallback: number): number => {
    const val = process.env[key];
    return val ? parseInt(val, 10) : fallback;
  };

  return {
    supabaseUrl: required('SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    maxConcurrentRuns: optionalInt('FORGE_MAX_CONCURRENT_RUNS', 3),
    runPollIntervalMs: optionalInt('FORGE_RUN_POLL_INTERVAL_MS', 5_000),
    heartbeatPollIntervalMs: optionalInt('FORGE_HEARTBEAT_POLL_INTERVAL_MS', 30_000),
    routinePollIntervalMs: optionalInt('FORGE_ROUTINE_POLL_INTERVAL_MS', 60_000),
    worktreeParentDir: optional('FORGE_WORKTREE_PARENT_DIR', '/tmp/forge-worktrees'),
    agentHomeDir: optional('FORGE_AGENT_HOME_DIR', '/tmp/forge-agents'),
    claudeCommand: optional('CLAUDE_COMMAND', 'claude'),
    geminiCommand: optional('GEMINI_COMMAND', 'gemini'),
    codexCommand: optional('CODEX_COMMAND', 'codex'),
  };
}
```

- [ ] **Step 2: Create supabase.ts**

```typescript
// src/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from './config.js';

export function createSupabaseClient(config: ForgeConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    db: { schema: 'forge' },
    auth: { persistSession: false },
  });
}
```

- [ ] **Step 3: Create logger.ts**

```typescript
// src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
  },
  level: process.env.LOG_LEVEL || 'info',
});
```

- [ ] **Step 4: Commit**

```bash
git add forge-orchestrator/src/config.ts forge-orchestrator/src/supabase.ts forge-orchestrator/src/utils/logger.ts
git commit -m "feat: config, supabase client, pino logger"
```

---

### Task 4: Child Process Spawner + Template Renderer

**Files:**
- Create: `forge-orchestrator/src/utils/child-process.ts`
- Create: `forge-orchestrator/src/utils/template.ts`

- [ ] **Step 1: Create child-process.ts**

The process spawner with timeout, abort signal, and streaming callbacks. Exact code from plan Section 4.7 (lines 1029-1113).

```typescript
// src/utils/child-process.ts
import { spawn } from 'node:child_process';

export interface RunOptions {
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

export interface RunResult {
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

    if (opts.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }

    if (opts.timeoutSec > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 20_000);
      }, opts.timeoutSec * 1000);
    }

    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        child.kill('SIGTERM');
      });
    }

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, signal: signal ?? null, timedOut });
    });
  });
}
```

- [ ] **Step 2: Create template.ts**

```typescript
// src/utils/template.ts
import Mustache from 'mustache';

export function renderTemplate(
  template: string,
  view: Record<string, unknown>,
): string {
  return Mustache.render(template, view);
}
```

- [ ] **Step 3: Commit**

```bash
git add forge-orchestrator/src/utils/child-process.ts forge-orchestrator/src/utils/template.ts
git commit -m "feat: child process spawner + mustache template renderer"
```

---

### Task 5: Adapter Interface + Claude Adapter

**Files:**
- Create: `forge-orchestrator/src/adapters/types.ts`
- Create: `forge-orchestrator/src/adapters/claude.ts`
- Create: `forge-orchestrator/src/adapters/registry.ts`

- [ ] **Step 1: Create types.ts**

Exact code from plan Section 4.4 (lines 835-878).

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

- [ ] **Step 2: Create claude.ts**

Exact code from plan Section 4.5 (lines 884-1007). Builds args for `claude --print - --output-format stream-json --verbose`, writes prompt to stdin, parses stream-json output for session_id, model, usage, cost.

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

    const template = input.promptTemplate ||
      'You are agent {{agent.id}} ({{agent.name}}). Execute your assigned work.';
    const prompt = renderTemplate(template, {
      agent: input.agent,
      context: input.context,
      run: { id: input.runId },
    });

    const args = ['--print', '-', '--output-format', 'stream-json', '--verbose'];
    if (input.sessionId) args.push('--resume', input.sessionId);
    if (dangerouslySkipPermissions) args.push('--dangerously-skip-permissions');
    if (model) args.push('--model', model);
    if (maxTurns > 0) args.push('--max-turns', String(maxTurns));
    if (input.instructionsFile) {
      args.push('--append-system-prompt-file', input.instructionsFile);
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      FORGE_RUN_ID: input.runId,
      FORGE_AGENT_ID: input.agent.id,
      FORGE_AGENT_NAME: input.agent.name,
      FORGE_COMPANY_ID: input.agent.companyId,
    };

    if (input.context.issueId) env.FORGE_ISSUE_ID = input.context.issueId as string;
    if (input.context.wakeReason) env.FORGE_WAKE_REASON = input.context.wakeReason as string;

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

- [ ] **Step 3: Create registry.ts**

```typescript
// src/adapters/registry.ts
import { CLIAdapter } from './types.js';
import { claudeAdapter } from './claude.js';

const adapters: Record<string, CLIAdapter> = {
  claude: claudeAdapter,
};

export function getAdapter(type: string): CLIAdapter {
  const adapter = adapters[type];
  if (!adapter) throw new Error(`Unknown adapter type: ${type}. Available: ${Object.keys(adapters).join(', ')}`);
  return adapter;
}
```

- [ ] **Step 4: Commit**

```bash
git add forge-orchestrator/src/adapters/
git commit -m "feat: CLI adapter interface + Claude adapter + registry"
```

---

### Task 6: Services — Cost Ledger + Issue Lifecycle

**Files:**
- Create: `forge-orchestrator/src/services/cost-ledger.ts`
- Create: `forge-orchestrator/src/services/issue-lifecycle.ts`

- [ ] **Step 1: Create cost-ledger.ts**

```typescript
// src/services/cost-ledger.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

export interface CostEventInput {
  companyId: string;
  agentId: string;
  runId: string;
  issueId?: string;
  projectId?: string;
  provider: string;
  model: string;
  billingType: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costCents: number;
}

export async function recordCost(
  supabase: SupabaseClient,
  input: CostEventInput,
): Promise<void> {
  const { error } = await supabase.from('cost_events').insert({
    company_id: input.companyId,
    agent_id: input.agentId,
    run_id: input.runId,
    issue_id: input.issueId || null,
    project_id: input.projectId || null,
    provider: input.provider,
    model: input.model,
    billing_type: input.billingType,
    input_tokens: input.inputTokens,
    cached_input_tokens: input.cachedInputTokens,
    output_tokens: input.outputTokens,
    cost_cents: input.costCents,
    occurred_at: new Date().toISOString(),
  });

  if (error) {
    logger.error({ error, runId: input.runId }, 'Failed to record cost event');
  }
}
```

- [ ] **Step 2: Create issue-lifecycle.ts**

```typescript
// src/services/issue-lifecycle.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

export async function releaseIssueExecution(
  supabase: SupabaseClient,
  run: { id: string; context_snapshot?: Record<string, unknown> },
): Promise<void> {
  const issueId = run.context_snapshot?.issueId as string | undefined;
  if (!issueId) return;

  const { error } = await supabase
    .from('issues')
    .update({
      execution_run_id: null,
      execution_locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId);

  if (error) {
    logger.error({ error, issueId, runId: run.id }, 'Failed to release issue execution lock');
  }
}

export async function lockIssueExecution(
  supabase: SupabaseClient,
  issueId: string,
  runId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('issues')
    .update({
      execution_run_id: runId,
      execution_locked_at: new Date().toISOString(),
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', issueId)
    .is('execution_run_id', null)
    .select()
    .single();

  if (error || !data) {
    logger.warn({ issueId, runId }, 'Failed to lock issue — already locked');
    return false;
  }
  return true;
}
```

- [ ] **Step 3: Commit**

```bash
git add forge-orchestrator/src/services/
git commit -m "feat: cost ledger + issue lifecycle services"
```

---

### Task 7: Run Executor Loop

**Files:**
- Create: `forge-orchestrator/src/loops/run-executor.ts`

This is the core loop — polls for queued runs, claims atomically, spawns CLI, captures output, updates state. Exact code from plan Section 4.3 (lines 634-830).

- [ ] **Step 1: Create run-executor.ts**

```typescript
// src/loops/run-executor.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { getAdapter } from '../adapters/registry.js';
import { recordCost } from '../services/cost-ledger.js';
import { releaseIssueExecution } from '../services/issue-lifecycle.js';
import { logger } from '../utils/logger.js';

const activeRuns = new Map<string, { pid: number; abortController: AbortController }>();

export function getActiveRunCount(): number {
  return activeRuns.size;
}

export async function startRunExecutor(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info({ interval: config.runPollIntervalMs }, 'Run executor started');

  const tick = async () => {
    if (activeRuns.size >= config.maxConcurrentRuns) return;
    try {
      await claimAndExecuteNextRun(supabase, config);
    } catch (err) {
      logger.error(err, 'Run executor tick failed');
    }
  };

  setInterval(tick, config.runPollIntervalMs);
}

async function claimAndExecuteNextRun(supabase: SupabaseClient, config: ForgeConfig) {
  // 1. Find oldest queued run with its agent
  const { data: queuedRuns } = await supabase
    .from('runs')
    .select('*, agent:agents(*)')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (!queuedRuns?.length) return;
  const run = queuedRuns[0];
  const agent = run.agent;

  // 2. Atomic claim (optimistic lock)
  const { data: claimed, error } = await supabase
    .from('runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id)
    .eq('status', 'queued')
    .select()
    .single();

  if (error || !claimed) return;

  // 3. Check agent is invokable
  if (agent.status === 'paused' || agent.status === 'terminated') {
    await cancelRun(supabase, run.id, `Agent ${agent.name} is ${agent.status}`);
    return;
  }

  // 4. Update agent to running
  await supabase
    .from('agents')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', agent.id);

  // 5. Spawn CLI (non-blocking — runs in background)
  logger.info({ runId: run.id, agent: agent.name }, 'Executing run');
  executeRun(supabase, config, run, agent);
}

async function executeRun(
  supabase: SupabaseClient,
  config: ForgeConfig,
  run: any,
  agent: any,
) {
  const adapter = getAdapter(agent.adapter_type);
  const abortController = new AbortController();

  // Resolve cwd — use agent's project workspace or fallback
  const cwd = agent.adapter_config?.cwd || config.agentHomeDir;

  try {
    const result = await adapter.execute({
      runId: run.id,
      agent: {
        id: agent.id,
        companyId: agent.company_id,
        name: agent.name,
        adapter_config: agent.adapter_config || {},
      },
      config: agent.adapter_config || {},
      promptTemplate: agent.prompt_template,
      bootstrapPrompt: agent.bootstrap_prompt,
      instructionsFile: agent.instructions_file,
      skills: agent.skills || [],
      sessionId: agent.session_id,
      sessionParams: agent.session_params,
      context: run.context_snapshot || {},
      cwd,
      signal: abortController.signal,
      onLog: async (stream, chunk) => {
        await supabase.from('run_events').insert({
          company_id: run.company_id,
          run_id: run.id,
          agent_id: run.agent_id,
          seq: Date.now(),
          event_type: stream,
          stream,
          message: chunk,
        });
      },
      onSpawn: async (pid) => {
        activeRuns.set(run.id, { pid, abortController });
        await supabase
          .from('runs')
          .update({ process_pid: pid, process_started_at: new Date().toISOString() })
          .eq('id', run.id);
      },
    });

    // Finalize run
    const status = result.timedOut ? 'timed_out'
      : (result.exitCode === 0 ? 'succeeded' : 'failed');

    await supabase
      .from('runs')
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

    // Update agent state
    await supabase
      .from('agents')
      .update({
        status: status === 'succeeded' ? 'idle' : 'error',
        session_id: result.clearSession ? null : (result.sessionId ?? agent.session_id),
        session_params: result.clearSession ? null : (result.sessionParams ?? agent.session_params),
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id);

    // Record cost
    if (result.usage && (result.usage.inputTokens > 0 || result.usage.outputTokens > 0)) {
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

    // Release issue execution lock
    await releaseIssueExecution(supabase, run);

    logger.info({ runId: run.id, status, agent: agent.name }, 'Run completed');

  } catch (err) {
    logger.error({ err, runId: run.id }, 'Run execution failed');
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    await supabase
      .from('agents')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', agent.id);
  } finally {
    activeRuns.delete(run.id);
  }
}

async function cancelRun(supabase: SupabaseClient, runId: string, reason: string) {
  await supabase
    .from('runs')
    .update({
      status: 'cancelled',
      error: reason,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
}
```

- [ ] **Step 2: Commit**

```bash
git add forge-orchestrator/src/loops/run-executor.ts
git commit -m "feat: run executor — core poll/claim/spawn/finalize loop"
```

---

### Task 8: Stub Loops + Orphan Reaper

**Files:**
- Create: `forge-orchestrator/src/loops/heartbeat-scheduler.ts`
- Create: `forge-orchestrator/src/loops/routine-scheduler.ts`
- Create: `forge-orchestrator/src/loops/orphan-reaper.ts`

- [ ] **Step 1: Create heartbeat-scheduler.ts (stub)**

```typescript
// src/loops/heartbeat-scheduler.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

export async function startHeartbeatScheduler(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info({ interval: config.heartbeatPollIntervalMs }, 'Heartbeat scheduler started (stub)');

  setInterval(async () => {
    // Phase 3: Check agent timer intervals, create wakeup requests
  }, config.heartbeatPollIntervalMs);
}
```

- [ ] **Step 2: Create routine-scheduler.ts (stub)**

```typescript
// src/loops/routine-scheduler.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

export async function startRoutineScheduler(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info({ interval: config.routinePollIntervalMs }, 'Routine scheduler started (stub)');

  setInterval(async () => {
    // Phase 3: Check cron schedules, create issues and wakeups
  }, config.routinePollIntervalMs);
}
```

- [ ] **Step 3: Create orphan-reaper.ts**

```typescript
// src/loops/orphan-reaper.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const ORPHAN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes with no update = orphaned

export async function startOrphanReaper(
  supabase: SupabaseClient,
  config: ForgeConfig & { runOnce?: boolean },
) {
  const reap = async () => {
    try {
      const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS).toISOString();

      const { data: orphans } = await supabase
        .from('runs')
        .select('id, agent_id, started_at')
        .eq('status', 'running')
        .lt('updated_at', cutoff);

      if (!orphans?.length) return;

      logger.warn({ count: orphans.length }, 'Reaping orphaned runs');

      for (const orphan of orphans) {
        await supabase
          .from('runs')
          .update({
            status: 'failed',
            error: 'Orphaned — no update for 10 minutes',
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', orphan.id);

        await supabase
          .from('agents')
          .update({ status: 'idle', updated_at: new Date().toISOString() })
          .eq('id', orphan.agent_id);
      }
    } catch (err) {
      logger.error(err, 'Orphan reaper failed');
    }
  };

  // Run once on startup to clean up from previous crash
  await reap();

  if (config.runOnce) return;

  logger.info('Orphan reaper started (60s interval)');
  setInterval(reap, 60_000);
}
```

- [ ] **Step 4: Commit**

```bash
git add forge-orchestrator/src/loops/
git commit -m "feat: heartbeat stub, routine stub, orphan reaper"
```

---

### Task 9: Entry Point — Wire All Loops

**Files:**
- Create: `forge-orchestrator/src/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
// src/index.ts
import { loadConfig } from './config.js';
import { createSupabaseClient } from './supabase.js';
import { startRunExecutor } from './loops/run-executor.js';
import { startHeartbeatScheduler } from './loops/heartbeat-scheduler.js';
import { startRoutineScheduler } from './loops/routine-scheduler.js';
import { startOrphanReaper } from './loops/orphan-reaper.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('MCM Forge Orchestrator starting');

  const config = loadConfig();
  const supabase = createSupabaseClient(config);

  // Verify Supabase connection
  const { data, error } = await supabase.from('companies').select('id, name').limit(1);
  if (error) {
    logger.fatal({ error }, 'Failed to connect to Supabase');
    process.exit(1);
  }
  logger.info({ companies: data?.length ?? 0 }, 'Supabase connected');

  // Reap orphans from previous crash
  await startOrphanReaper(supabase, { ...config, runOnce: true });

  // Start concurrent loops
  await Promise.all([
    startRunExecutor(supabase, config),
    startHeartbeatScheduler(supabase, config),
    startRoutineScheduler(supabase, config),
    startOrphanReaper(supabase, config),
  ]);

  logger.info('All loops running');
}

main().catch((err) => {
  logger.fatal(err, 'Orchestrator crashed');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});
```

- [ ] **Step 2: Verify build**

```bash
cd forge-orchestrator && npm run build
```

Expected: Clean compilation, `dist/` directory created with .js files.

- [ ] **Step 3: Commit**

```bash
git add forge-orchestrator/src/index.ts
git commit -m "feat: orchestrator entry point — wires all 4 loops"
```

---

### Task 10: End-to-End Validation

- [ ] **Step 1: Insert a test agent into Supabase**

```sql
-- Get DirtSync company ID
SELECT id FROM forge.companies WHERE slug = 'dirtsync';

-- Insert test agent (use the company ID from above)
INSERT INTO forge.agents (
  company_id, name, role, title, status,
  adapter_type, adapter_config
) VALUES (
  '<dirtsync-company-id>',
  'Test Agent',
  'engineer',
  'Phase 1 Test Agent',
  'idle',
  'claude',
  '{"model": "claude-sonnet-4-20250514", "maxTurnsPerRun": 3, "timeoutSec": 60, "dangerouslySkipPermissions": true}'::jsonb
);
```

- [ ] **Step 2: Insert a queued run**

```sql
-- Get agent ID
SELECT id FROM forge.agents WHERE name = 'Test Agent';

-- Insert queued run
INSERT INTO forge.runs (
  company_id, agent_id, status, invocation_source,
  context_snapshot
) VALUES (
  '<dirtsync-company-id>',
  '<test-agent-id>',
  'queued',
  'on_demand',
  '{"wakeReason": "test", "prompt": "Say hello and confirm you are running inside MCM Forge Orchestrator."}'::jsonb
);
```

- [ ] **Step 3: Start orchestrator and observe**

```bash
cd forge-orchestrator
# Create .env with real credentials first
cp .env.example .env
# Edit .env to add SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Expected log output:
```
MCM Forge Orchestrator starting
Supabase connected { companies: 2 }
Run executor started { interval: 5000 }
Heartbeat scheduler started (stub)
Routine scheduler started (stub)
Orphan reaper started (60s interval)
Executing run { runId: '...', agent: 'Test Agent' }
Run completed { runId: '...', status: 'succeeded', agent: 'Test Agent' }
```

- [ ] **Step 4: Verify state transitions**

```sql
-- Run should be succeeded
SELECT id, status, exit_code, model, input_tokens, output_tokens, summary
FROM forge.runs WHERE status != 'queued' ORDER BY created_at DESC LIMIT 1;

-- Agent should be idle with updated heartbeat
SELECT id, name, status, last_heartbeat_at, session_id
FROM forge.agents WHERE name = 'Test Agent';

-- Cost event should be recorded
SELECT * FROM forge.cost_events ORDER BY created_at DESC LIMIT 1;
```

- [ ] **Step 5: Clean up test data**

```sql
DELETE FROM forge.cost_events WHERE agent_id IN (SELECT id FROM forge.agents WHERE name = 'Test Agent');
DELETE FROM forge.run_events WHERE agent_id IN (SELECT id FROM forge.agents WHERE name = 'Test Agent');
DELETE FROM forge.runs WHERE agent_id IN (SELECT id FROM forge.agents WHERE name = 'Test Agent');
DELETE FROM forge.agents WHERE name = 'Test Agent';
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — forge schema + orchestrator core loop"
```
