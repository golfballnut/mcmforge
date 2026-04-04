import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { getAdapter } from '../adapters/registry.js';
import { recordCost } from '../services/cost-ledger.js';
import { releaseIssueExecution } from '../services/issue-lifecycle.js';
import { logger } from '../utils/logger.js';

const activeRuns = new Map<string, { pid: number; abortController: AbortController }>();

export function getActiveRunCount(): number {
  return activeRuns.size;
}

export async function startRunExecutor(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info({ interval: config.runPollIntervalMs }, 'Run executor started');

  const tick = async () => {
    if (activeRuns.size >= config.maxConcurrentRuns) return;
    try {
      await claimAndExecuteNextRun(supabase, config);
    } catch (err) {
      logger.error(err, 'Run executor tick failed');
    }
  };

  setInterval(tick, config.runPollIntervalMs);
}

async function claimAndExecuteNextRun(supabase: SupabaseClient, config: ForgeConfig) {
  const { data: queuedRuns } = await supabase
    .from('runs')
    .select('*, agent:agents(*)')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (!queuedRuns?.length) return;
  const run = queuedRuns[0];
  const agent = run.agent;

  const { data: claimed, error } = await supabase
    .from('runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id)
    .eq('status', 'queued')
    .select()
    .single();

  if (error || !claimed) return;

  if (agent.status === 'paused' || agent.status === 'terminated') {
    await cancelRun(supabase, run.id, `Agent ${agent.name} is ${agent.status}`);
    return;
  }

  await supabase
    .from('agents')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', agent.id);

  logger.info({ runId: run.id, agent: agent.name }, 'Executing run');
  executeRun(supabase, config, run, agent);
}

async function executeRun(
  supabase: SupabaseClient,
  config: ForgeConfig,
  run: any,
  agent: any,
) {
  const adapter = getAdapter(agent.adapter_type);
  const abortController = new AbortController();
  const cwd = agent.adapter_config?.cwd || config.agentHomeDir;

  try {
    const result = await adapter.execute({
      runId: run.id,
      agent: {
        id: agent.id,
        companyId: agent.company_id,
        name: agent.name,
        adapter_config: agent.adapter_config || {},
      },
      config: agent.adapter_config || {},
      promptTemplate: agent.prompt_template,
      bootstrapPrompt: agent.bootstrap_prompt,
      instructionsFile: agent.instructions_file,
      skills: agent.skills || [],
      sessionId: agent.session_id,
      sessionParams: agent.session_params,
      context: run.context_snapshot || {},
      cwd,
      signal: abortController.signal,
      onLog: async (stream, chunk) => {
        await supabase.from('run_events').insert({
          company_id: run.company_id,
          run_id: run.id,
          agent_id: run.agent_id,
          seq: Date.now(),
          event_type: stream,
          stream,
          message: chunk,
        });
      },
      onSpawn: async (pid) => {
        activeRuns.set(run.id, { pid, abortController });
        await supabase
          .from('runs')
          .update({ process_pid: pid, process_started_at: new Date().toISOString() })
          .eq('id', run.id);
      },
    });

    const status = result.timedOut ? 'timed_out'
      : (result.exitCode === 0 ? 'succeeded' : 'failed');

    await supabase
      .from('runs')
      .update({
        status,
        exit_code: result.exitCode,
        signal: result.signal,
        timed_out: result.timedOut,
        error: result.errorMessage,
        session_id_after: result.sessionId,
        session_params: result.sessionParams,
        result_json: result.resultJson,
        summary: result.summary,
        input_tokens: result.usage?.inputTokens ?? 0,
        cached_input_tokens: result.usage?.cachedInputTokens ?? 0,
        output_tokens: result.usage?.outputTokens ?? 0,
        cost_usd: result.costUsd,
        model: result.model,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    await supabase
      .from('agents')
      .update({
        status: status === 'succeeded' ? 'idle' : 'error',
        session_id: result.clearSession ? null : (result.sessionId ?? agent.session_id),
        session_params: result.clearSession ? null : (result.sessionParams ?? agent.session_params),
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id);

    if (result.usage && (result.usage.inputTokens > 0 || result.usage.outputTokens > 0)) {
      await recordCost(supabase, {
        companyId: run.company_id,
        agentId: run.agent_id,
        runId: run.id,
        issueId: run.context_snapshot?.issueId,
        projectId: run.context_snapshot?.projectId,
        provider: result.provider ?? 'unknown',
        model: result.model ?? 'unknown',
        billingType: result.billingType ?? 'subscription',
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.cachedInputTokens ?? 0,
        outputTokens: result.usage.outputTokens,
        costCents: Math.round((result.costUsd ?? 0) * 100),
      });
    }

    await releaseIssueExecution(supabase, run);

    logger.info({ runId: run.id, status, agent: agent.name }, 'Run completed');

  } catch (err) {
    logger.error({ err, runId: run.id }, 'Run execution failed');
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    await supabase
      .from('agents')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', agent.id);
  } finally {
    activeRuns.delete(run.id);
  }
}

async function cancelRun(supabase: SupabaseClient, runId: string, reason: string) {
  await supabase
    .from('runs')
    .update({
      status: 'cancelled',
      error: reason,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
}
