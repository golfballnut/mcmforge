import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { runChildProcess } from '../utils/child-process.js';
import { renderTemplate } from '../utils/template.js';
import { logger } from '../utils/logger.js';
export const claudeAdapter = {
    type: 'claude',
    async execute(input) {
        const config = input.config;
        const command = config.command || 'claude';
        const model = config.model || '';
        const maxTurns = config.maxTurnsPerRun || 0;
        const timeoutSec = config.timeoutSec || 0;
        const dangerouslySkipPermissions = config.dangerouslySkipPermissions || false;
        const cliFlags = config.cliFlags || [];
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
        // M0.2: prepend bootstrap_prompt (per-agent identity) above onboarding files.
        // Final order: bootstrap → AGENTS.md/HEARTBEAT.md/SOUL.md/TOOLS.md → --- TASK --- → rendered template.
        const bootstrap = input.bootstrapPrompt ? `${input.bootstrapPrompt}\n\n` : '';
        const taskBody = systemContext ? `${systemContext}\n\n--- TASK ---\n${prompt}` : prompt;
        const fullPrompt = `${bootstrap}${taskBody}`;
        const args = ['--print', '-', '--output-format', 'stream-json', '--verbose'];
        if (input.sessionId) {
            logger.info({ sessionId: input.sessionId, agentId: input.agent.id, agentName: input.agent.name }, 'Resuming Claude session');
            args.push('--resume', input.sessionId);
        }
        else {
            logger.info({ agentId: input.agent.id, agentName: input.agent.name }, 'Starting new Claude session');
        }
        if (dangerouslySkipPermissions)
            args.push('--dangerously-skip-permissions');
        if (model)
            args.push('--model', model);
        if (maxTurns > 0)
            args.push('--max-turns', String(maxTurns));
        if (cliFlags.length)
            args.push(...cliFlags);
        // Determine agent role for isolation enforcement
        const agentRole = config.role || 'engineer';
        // Ensure CLAUDE_CODE_OAUTH_TOKEN propagates to child process
        const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
        if (!oauthToken) {
            logger.warn('CLAUDE_CODE_OAUTH_TOKEN not set — Claude may fail to authenticate');
        }
        const env = {
            ...process.env,
            ...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {}),
            FORGE_RUN_ID: input.runId,
            CLAUDE_TASK_ID: input.runId, // Skip DirtSync interactive hooks
            FORGE_AGENT_ID: input.agent.id,
            FORGE_AGENT_NAME: input.agent.name,
            FORGE_COMPANY_ID: input.agent.companyId,
            FORGE_AGENT_HOME: input.agentHome,
            FORGE_AGENT_ROLE: agentRole,
            FORGE_API_URL: process.env.FORGE_AGENT_API_URL || 'http://127.0.0.1:3200',
        };
        if (input.context.issueId)
            env.FORGE_ISSUE_ID = input.context.issueId;
        if (input.context.wakeReason)
            env.FORGE_WAKE_REASON = input.context.wakeReason;
        if (input.context.FORGE_ALLOWED_ISSUE_ID)
            env.FORGE_ALLOWED_ISSUE_ID = input.context.FORGE_ALLOWED_ISSUE_ID;
        if (input.context.FORGE_ALLOWED_IDENTIFIER)
            env.FORGE_ALLOWED_IDENTIFIER = input.context.FORGE_ALLOWED_IDENTIFIER;
        logger.info({ command, args: args.join(' '), cwd: input.cwd, hasToken: !!env.CLAUDE_CODE_OAUTH_TOKEN, promptLength: fullPrompt.length }, 'Spawning Claude CLI');
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
        logger.info({
            exitCode: result.exitCode,
            stdoutLen: result.stdout?.length,
            stderrLen: result.stderr?.length,
            stdoutTail: result.stdout?.slice(-500),
        }, 'Claude process raw output');
        return parseClaudeResult(result);
    },
};
function parseClaudeResult(proc) {
    let sessionId = null;
    let model = null;
    let summary = null;
    let costUsd = null;
    let inputTokens = 0;
    let cachedInputTokens = 0;
    let outputTokens = 0;
    let resultJson = null;
    let lastAssistantMessage = null;
    for (const line of proc.stdout.split('\n')) {
        if (!line.trim())
            continue;
        try {
            const event = JSON.parse(line);
            if (event.type === 'system' && event.session_id) {
                sessionId = event.session_id;
            }
            if (event.type === 'system' && event.model) {
                model = event.model;
            }
            // Capture assistant text messages as fallback summary
            if (event.type === 'assistant' && event.message?.content) {
                const textParts = event.message.content
                    .filter((c) => c.type === 'text')
                    .map((c) => c.text);
                if (textParts.length > 0) {
                    lastAssistantMessage = textParts.join('\n').slice(0, 2000);
                }
            }
            if (event.type === 'result') {
                resultJson = event;
                summary = event.result || event.summary || null;
                costUsd = event.total_cost_usd ?? event.costUSD ?? null;
                inputTokens = event.usage?.input_tokens ?? 0;
                cachedInputTokens = event.usage?.cache_read_input_tokens ?? 0;
                outputTokens = event.usage?.output_tokens ?? 0;
                sessionId = event.session_id ?? sessionId;
                // Also check modelUsage for cost (newer Claude format)
                if (!costUsd && event.modelUsage) {
                    const models = Object.values(event.modelUsage);
                    costUsd = models.reduce((sum, m) => sum + (m.costUSD ?? 0), 0) || null;
                }
            }
        }
        catch {
            // Not JSON, skip
        }
    }
    // Fallback: use last assistant message if result field was empty (e.g., max_turns)
    if (!summary && lastAssistantMessage) {
        summary = lastAssistantMessage;
    }
    return {
        // max_turns exit (code 1 but terminal_reason=max_turns/completed) = agent did work, treat as success
        exitCode: resultJson?.terminal_reason === 'max_turns' || resultJson?.terminal_reason === 'completed' ? 0 : proc.exitCode,
        signal: proc.signal,
        timedOut: proc.timedOut,
        errorMessage: proc.exitCode === 0
            ? null
            : resultJson?.terminal_reason === 'max_turns' || resultJson?.terminal_reason === 'completed'
                ? null
                : `Claude exited ${proc.exitCode}`,
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
        stdoutExcerpt: proc.stdout?.slice(0, 2000) || null,
        stderrExcerpt: proc.stderr?.slice(0, 2000) || null,
    };
}
//# sourceMappingURL=claude.js.map