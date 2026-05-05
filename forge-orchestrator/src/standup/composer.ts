import Anthropic from '@anthropic-ai/sdk';
import type { StandupData } from './data-layer.js';
import { logger } from '../utils/logger.js';

const MODEL = 'claude-sonnet-4-5';

/**
 * Compose a ~150-word executive standup paragraph using Claude.
 * Prompt: terse, direct, no preamble. Plain markdown paragraph.
 */
export async function composeStandup(data: StandupData): Promise<string> {
  const client = new Anthropic();

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

  logger.debug({ model: MODEL, promptLen: prompt.length }, '[standup] calling Claude to compose standup');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('\n')
    .trim();

  logger.info({ tokens: response.usage, outputLen: text.length }, '[standup] Claude response received');

  return text;
}
