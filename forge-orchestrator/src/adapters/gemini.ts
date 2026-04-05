import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CLIAdapter, AdapterExecuteInput, AdapterExecuteResult } from './types.js';
import { runChildProcess } from '../utils/child-process.js';
import { renderTemplate } from '../utils/template.js';

export const geminiAdapter: CLIAdapter = {
  type: 'gemini',

  async execute(input: AdapterExecuteInput): Promise<AdapterExecuteResult> {
    const config = input.config;
    const command = (config.command as string) || 'gemini';
    const model = (config.model as string) || 'gemini-2.5-pro';
    const maxTurns = (config.maxTurnsPerRun as number) || 0;
    const timeoutSec = (config.timeoutSec as number) || 0;

    const template = input.promptTemplate ||
      'You are agent {{agent.id}} ({{agent.name}}). Execute your assigned work.';
    const prompt = renderTemplate(template, {
      agent: input.agent,
      context: input.context,
      run: { id: input.runId },
    });

    // Read all onboarding files from the agent's directory and prepend to the prompt
    let systemContext = '';
    if (input.instructionsFile) {
      const agentDir = path.dirname(input.instructionsFile);
      const onboardingFiles = ['AGENTS.md', 'HEARTBEAT.md', 'SOUL.md', 'TOOLS.md'];
      for (const file of onboardingFiles) {
        const filePath = path.join(agentDir, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          systemContext += `\n\n--- ${file} ---\n${content}`;
        }
      }
    }
    const fullPrompt = systemContext ? `${systemContext}\n\n--- TASK ---\n${prompt}` : prompt;

    const args = ['--output-format', 'jsonl'];
    if (model) args.push('--model', model);
    if (maxTurns > 0) args.push('--max-turns', String(maxTurns));

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      FORGE_RUN_ID: input.runId,
      FORGE_AGENT_ID: input.agent.id,
      FORGE_AGENT_NAME: input.agent.name,
      FORGE_COMPANY_ID: input.agent.companyId,
      FORGE_AGENT_HOME: input.agentHome,
      FORGE_API_URL: process.env.FORGE_AGENT_API_URL || 'http://127.0.0.1:3200',
    };

    if (input.context.issueId) env.FORGE_ISSUE_ID = input.context.issueId as string;
    if (input.context.wakeReason) env.FORGE_WAKE_REASON = input.context.wakeReason as string;

    // Determine billing type: api key present = 'api', otherwise 'subscription'
    const billingType = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) ? 'api' : 'subscription';

    const result = await runChildProcess({
      command,
      args,
      cwd: input.cwd,
      env,
      stdin: fullPrompt,
      timeoutSec,
      signal: input.signal,
      onLog: input.onLog,
      onSpawn: (pid) => input.onSpawn(pid),
    });

    return parseGeminiResult(result, model, billingType);
  },
};

function parseGeminiResult(
  proc: {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
  },
  defaultModel: string,
  billingType: string,
): AdapterExecuteResult {
  let sessionId: string | null = null;
  let model: string | null = defaultModel;
  let summary: string | null = null;
  let costUsd: number | null = null;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let resultJson: Record<string, unknown> | null = null;

  for (const line of proc.stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;

      if (event.session_id) {
        sessionId = event.session_id as string;
      }
      if (event.model) {
        model = event.model as string;
      }
      if (event.type === 'result' || event.type === 'final') {
        resultJson = event;
        summary = (event.result ?? event.summary ?? null) as string | null;
        costUsd = (event.total_cost_usd ?? null) as number | null;
        const usage = event.usage as Record<string, unknown> | undefined;
        inputTokens = (usage?.input_tokens ?? 0) as number;
        cachedInputTokens = (usage?.cached_input_tokens ?? 0) as number;
        outputTokens = (usage?.output_tokens ?? 0) as number;
        if (event.session_id) sessionId = event.session_id as string;
      }
    } catch {
      // Not JSON, skip
    }
  }

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: proc.timedOut,
    errorMessage: proc.exitCode === 0 ? null : `Gemini exited ${proc.exitCode}`,
    usage: { inputTokens, cachedInputTokens, outputTokens },
    sessionId,
    sessionParams: sessionId ? { sessionId, cwd: '' } : null,
    provider: 'google',
    model,
    billingType,
    costUsd,
    resultJson,
    summary,
    clearSession: false,
  };
}
