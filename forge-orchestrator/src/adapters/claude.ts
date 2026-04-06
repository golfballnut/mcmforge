import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CLIAdapter, AdapterExecuteInput, AdapterExecuteResult } from './types.js';
import { runChildProcess } from '../utils/child-process.js';
import { renderTemplate } from '../utils/template.js';
import { logger } from '../utils/logger.js';

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

    const args = ['--print', '-', '--output-format', 'stream-json', '--verbose'];
    if (input.sessionId) {
      logger.info({ sessionId: input.sessionId, agentId: input.agent.id, agentName: input.agent.name }, 'Resuming Claude session');
      args.push('--resume', input.sessionId);
    } else {
      logger.info({ agentId: input.agent.id, agentName: input.agent.name }, 'Starting new Claude session');
    }
    if (dangerouslySkipPermissions) args.push('--dangerously-skip-permissions');
    if (model) args.push('--model', model);
    if (maxTurns > 0) args.push('--max-turns', String(maxTurns));

    // Determine agent role for isolation enforcement
    const agentRole = (config.role as string) || 'engineer';

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      FORGE_RUN_ID: input.runId,
      FORGE_AGENT_ID: input.agent.id,
      FORGE_AGENT_NAME: input.agent.name,
      FORGE_COMPANY_ID: input.agent.companyId,
      FORGE_AGENT_HOME: input.agentHome,
      FORGE_AGENT_ROLE: agentRole,
      FORGE_API_URL: process.env.FORGE_AGENT_API_URL || 'http://127.0.0.1:3200',
    };

    if (input.context.issueId) env.FORGE_ISSUE_ID = input.context.issueId as string;
    if (input.context.wakeReason) env.FORGE_WAKE_REASON = input.context.wakeReason as string;

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
