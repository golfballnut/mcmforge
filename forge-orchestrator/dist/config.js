export function loadConfig() {
    const required = (key) => {
        const val = process.env[key];
        if (!val)
            throw new Error(`Missing required env var: ${key}`);
        return val;
    };
    const optional = (key, fallback) => process.env[key] || fallback;
    const optionalInt = (key, fallback) => {
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
        agentApiPort: optionalInt('FORGE_AGENT_API_PORT', 3200),
        agentApiUrl: optional('FORGE_AGENT_API_URL', 'http://127.0.0.1:3200'),
        dryRun: process.env.FORGE_DRY_RUN === 'true',
    };
}
//# sourceMappingURL=config.js.map