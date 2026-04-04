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
