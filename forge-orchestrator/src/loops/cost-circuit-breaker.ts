import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Cost Circuit Breaker — halts runaway agents before they burn too much.
 *
 * Every minute: for each agent, sum cost_events over the last 60 minutes.
 * If total >= DEFAULT_HOURLY_CAP_USD, auto-pause the agent and post an audit
 * comment on any in-flight issue. Would have caught the 2026-04-21 Map Rendering
 * Expert idle-loop ($4.02 in 60min) at the 30-minute mark.
 *
 * Per-agent override: set `agents.budget_hourly_cents` to customize the cap.
 */

const DEFAULT_HOURLY_CAP_USD = 2.0;
const TICK_INTERVAL_MS = 60_000;
const FAIL_CLOSED_AFTER_CONSECUTIVE_ERRORS = 2;

interface HourlySpend {
  agentId: string;
  agentName: string;
  companyId: string;
  totalCents: number;
  hourlyCapCents: number;
}

/** Track consecutive cost_events query failures across ticks. */
let consecutiveQueryErrors = 0;

/**
 * Fail-closed pause: when the breaker can't measure spend (e.g. Supabase
 * ECONNRESET), we assume the worst and pause all agents that had a run
 * finish in the last hour. This prevents runaway burn during network
 * flakes where the query-error path would otherwise silently skip every
 * agent.
 */
async function failClosedPauseRecentlyActiveAgents(supabase: SupabaseClient): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data: recentRuns, error: runsErr } = await supabase
    .from('runs')
    .select('agent_id')
    .gte('finished_at', oneHourAgo);

  if (runsErr || !recentRuns?.length) return 0;

  const recentAgentIds = Array.from(
    new Set((recentRuns as Array<{ agent_id: string }>).map((r) => r.agent_id)),
  );
  if (!recentAgentIds.length) return 0;

  const { data: paused, error: pauseErr } = await supabase
    .from('agents')
    .update({
      status: 'paused',
      pause_reason:
        'Circuit breaker fail-closed: cost_events query unreachable. Manual review required before unpause.',
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', recentAgentIds)
    .in('status', ['idle', 'running', 'active'])
    .select('id, name');

  if (pauseErr) {
    logger.error({ err: pauseErr }, 'circuit-breaker fail-closed pause itself failed');
    return 0;
  }

  const count = paused?.length ?? 0;
  if (count > 0) {
    logger.error(
      { count, names: (paused ?? []).map((p: { name: string }) => p.name) },
      'CIRCUIT BREAKER FAIL-CLOSED — paused recently-active agents due to cost_events unreachable',
    );
  }
  return count;
}

async function computeHourlySpend(supabase: SupabaseClient): Promise<HourlySpend[] | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  // Group cost_events by agent over last hour.
  const { data: events, error } = await supabase
    .from('cost_events')
    .select('agent_id, cost_cents')
    .gte('occurred_at', oneHourAgo);

  if (error) {
    // Return null to signal "could not measure" — the caller decides fail-closed.
    logger.warn({ err: error }, 'circuit-breaker: cost_events query failed');
    return null;
  }
  if (!events?.length) return [];

  const byAgent = new Map<string, number>();
  for (const ev of events as Array<{ agent_id: string; cost_cents: number }>) {
    byAgent.set(ev.agent_id, (byAgent.get(ev.agent_id) ?? 0) + (ev.cost_cents ?? 0));
  }

  const agentIds = Array.from(byAgent.keys());
  if (!agentIds.length) return [];

  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, company_id, status, budget_hourly_cents')
    .in('id', agentIds);

  const spend: HourlySpend[] = [];
  for (const a of agents ?? []) {
    const cents = byAgent.get(a.id) ?? 0;
    const cap = (a as { budget_hourly_cents?: number }).budget_hourly_cents
      ?? Math.round(DEFAULT_HOURLY_CAP_USD * 100);
    spend.push({
      agentId: a.id,
      agentName: a.name,
      companyId: a.company_id,
      totalCents: cents,
      hourlyCapCents: cap,
    });
  }
  return spend;
}

async function haltAgent(supabase: SupabaseClient, spend: HourlySpend): Promise<void> {
  const spentUsd = (spend.totalCents / 100).toFixed(2);
  const capUsd = (spend.hourlyCapCents / 100).toFixed(2);

  logger.error(
    { agent: spend.agentName, spentUsd, capUsd },
    'CIRCUIT BREAKER TRIPPED — auto-pausing agent',
  );

  await supabase
    .from('agents')
    .update({
      status: 'paused',
      pause_reason: `Circuit breaker: $${spentUsd} in last hour exceeds $${capUsd} cap`,
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', spend.agentId);

  // Find any in-flight issues the agent is assigned to + post audit comment.
  const { data: issues } = await supabase
    .from('issues')
    .select('id')
    .eq('assignee_agent_id', spend.agentId)
    .in('status', ['todo', 'in_progress']);

  const body =
    `**[COO / CIRCUIT-BREAKER]** Agent **${spend.agentName}** auto-paused — ` +
    `spent $${spentUsd} in the last 60 minutes, exceeds cap of $${capUsd}. ` +
    `Status flipped to \`paused\`. Review runs + pattern before unpausing.`;

  for (const issue of issues ?? []) {
    const { error: commentErr } = await supabase.from('issue_comments').insert({
      company_id: spend.companyId,
      issue_id: issue.id,
      author_user_id: 'circuit-breaker',
      body,
    });
    if (commentErr) {
      logger.warn({ err: commentErr, issueId: issue.id }, 'circuit-breaker: audit comment failed');
    }
  }

  // Cancel any in-flight runs the agent still has.
  await supabase
    .from('runs')
    .update({
      status: 'cancelled',
      error: `Circuit breaker tripped — $${spentUsd}/$${capUsd} in last hour`,
      finished_at: new Date().toISOString(),
    })
    .eq('agent_id', spend.agentId)
    .in('status', ['queued', 'running']);
}

export async function tick(
  supabase: SupabaseClient,
): Promise<{ checked: number; tripped: number; failClosed?: number }> {
  const spends = await computeHourlySpend(supabase);

  // Fail-closed path: query errored, can't measure spend.
  if (spends === null) {
    consecutiveQueryErrors++;
    if (consecutiveQueryErrors >= FAIL_CLOSED_AFTER_CONSECUTIVE_ERRORS) {
      const failClosed = await failClosedPauseRecentlyActiveAgents(supabase);
      return { checked: 0, tripped: 0, failClosed };
    }
    // First error: log, return; next tick may recover.
    return { checked: 0, tripped: 0 };
  }

  // Success: reset the error counter
  consecutiveQueryErrors = 0;

  let tripped = 0;
  for (const s of spends) {
    if (s.totalCents >= s.hourlyCapCents) {
      // Skip if already paused — avoid re-flipping + re-commenting each tick
      const { data: agent } = await supabase
        .from('agents')
        .select('status')
        .eq('id', s.agentId)
        .single();
      if (agent?.status === 'paused') continue;

      await haltAgent(supabase, s);
      tripped++;
    }
  }
  return { checked: spends.length, tripped };
}

export async function startCostCircuitBreaker(
  supabase: SupabaseClient,
  _config: ForgeConfig,
): Promise<void> {
  logger.info({ capUsd: DEFAULT_HOURLY_CAP_USD, tickMs: TICK_INTERVAL_MS }, 'Cost circuit breaker started');
  setInterval(async () => {
    try {
      const result = await tick(supabase);
      if (result.tripped > 0 || (result.failClosed ?? 0) > 0) {
        logger.warn(result, 'Circuit breaker activity');
      }
    } catch (err) {
      logger.error({ err }, 'circuit-breaker tick threw');
    }
  }, TICK_INTERVAL_MS);
}
