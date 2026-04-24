import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { runChildProcess } from '../utils/child-process.js';
import { renderTemplate } from '../utils/template.js';
export const geminiAdapter = {
    type: 'gemini',
    async execute(input) {
        const config = input.config;
        const command = config.command || 'gemini';
        const model = config.model || 'gemini-2.5-pro';
        const maxTurns = config.maxTurnsPerRun || 0;
        const timeoutSec = config.timeoutSec || 0;
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
        const args = ['-p', fullPrompt, '--yolo'];
        if (model)
            args.push('--model', model);
        const env = {
            ...process.env,
            FORGE_RUN_ID: input.runId,
            FORGE_AGENT_ID: input.agent.id,
            FORGE_AGENT_NAME: input.agent.name,
            FORGE_COMPANY_ID: input.agent.companyId,
            FORGE_AGENT_HOME: input.agentHome,
            FORGE_API_URL: process.env.FORGE_AGENT_API_URL || 'http://127.0.0.1:3200',
        };
        if (input.context.issueId)
            env.FORGE_ISSUE_ID = input.context.issueId;
        if (input.context.wakeReason)
            env.FORGE_WAKE_REASON = input.context.wakeReason;
        // Determine billing type: api key present = 'api', otherwise 'subscription'
        const billingType = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) ? 'api' : 'subscription';
        const result = await runChildProcess({
            command,
            args,
            cwd: input.cwd,
            env,
            stdin: undefined,
            timeoutSec,
            signal: input.signal,
            onLog: input.onLog,
            onSpawn: (pid) => input.onSpawn(pid),
        });
        return parseGeminiResult(result, model, billingType);
    },
};
function parseGeminiResult(proc, defaultModel, billingType) {
    let sessionId = null;
    let model = defaultModel;
    let summary = null;
    let costUsd = null;
    let inputTokens = 0;
    let cachedInputTokens = 0;
    let outputTokens = 0;
    let resultJson = null;
    for (const line of proc.stdout.split('\n')) {
        if (!line.trim())
            continue;
        try {
            const event = JSON.parse(line);
            if (event.session_id) {
                sessionId = event.session_id;
            }
            if (event.model) {
                model = event.model;
            }
            if (event.type === 'result' || event.type === 'final') {
                resultJson = event;
                summary = (event.result ?? event.summary ?? null);
                costUsd = (event.total_cost_usd ?? null);
                const usage = event.usage;
                inputTokens = (usage?.input_tokens ?? 0);
                cachedInputTokens = (usage?.cached_input_tokens ?? 0);
                outputTokens = (usage?.output_tokens ?? 0);
                if (event.session_id)
                    sessionId = event.session_id;
            }
        }
        catch {
            // Not JSON, skip
        }
    }
    // O-3: Calculate cost from tokens when not provided by CLI output
    // Gemini Flash pricing: $0.075/1M input, $0.30/1M output
    if (costUsd === null && (inputTokens > 0 || outputTokens > 0)) {
        costUsd = (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.30;
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
        stdoutExcerpt: proc.stdout?.slice(0, 2000) || null,
        stderrExcerpt: proc.stderr?.slice(0, 2000) || null,
    };
}
//# sourceMappingURL=gemini.js.map