import type { StandupData } from './data-layer.js';
import { runChildProcess } from '../utils/child-process.js';
import { logger } from '../utils/logger.js';

const MODEL = 'claude-sonnet-4-6';

export async function composeStandup(data: StandupData): Promise<string> {
  const issuesSummary = data.openIssues.length > 0
    ? data.openIssues.map((i) => `- [${i.status}] ${i.title}`).join('\n')
    : '(none)';

  const commitsSummary = data.recentCommits.length > 0
    ? data.recentCommits.map((c) => `- ${c.subject} (${c.author})`).join('\n')
    : '(none)';

  const prompt = `You are writing a daily standup summary for the MCM Forge engineering OS.

DATA (last 24h):

Active issues:
${issuesSummary}

Runs: ${data.runStats.total} total, ${data.runStats.succeeded} succeeded, ${data.runStats.failed} failed, $${data.runStats.totalCostUsd.toFixed(2)} total cost

Git commits:
${commitsSummary}

Write a 1-paragraph executive standup for Steve covering: yesterday's shipped work, what's in flight, what needs his attention. Tone: terse, direct, no preamble. Format: plain markdown paragraph, ~150 words.`;

  const command = process.env.CLAUDE_COMMAND || 'claude';
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!oauthToken) {
    logger.warn('[standup] CLAUDE_CODE_OAUTH_TOKEN not set — composer will fail to authenticate');
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...(oauthToken ? { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } : {}),
  };

  logger.debug({ model: MODEL, promptLen: prompt.length }, '[standup] spawning claude CLI to compose standup');

  const result = await runChildProcess({
    command,
    args: ['--print', '-', '--model', MODEL, '--output-format', 'text'],
    cwd: process.cwd(),
    env,
    stdin: prompt,
    timeoutSec: 60,
    onLog: async () => {},
    onSpawn: () => {},
  });

  if (result.exitCode !== 0) {
    const stderrTail = result.stderr.slice(-500);
    throw new Error(`claude CLI exited ${result.exitCode}: ${stderrTail}`);
  }

  const text = result.stdout.trim();
  logger.info({ outputLen: text.length, model: MODEL }, '[standup] claude response received');
  return text;
}
