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
  agentHome: string;
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
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
}

export interface CLIAdapter {
  type: string;
  execute(input: AdapterExecuteInput): Promise<AdapterExecuteResult>;
}
