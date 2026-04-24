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
    agentApiPort: number;
    agentApiUrl: string;
    dryRun: boolean;
}
export declare function loadConfig(): ForgeConfig;
//# sourceMappingURL=config.d.ts.map