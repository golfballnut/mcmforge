import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { getAdapter } from '../adapters/registry.js';
import { recordCost } from '../services/cost-ledger.js';
import { releaseIssueExecution, lockIssueExecution } from '../services/issue-lifecycle.js';
import { createWakeup } from '../services/wakeup.js';
import { indexRunResult, searchAgentHistory } from '../services/session-search.js';
import { logger } from '../utils/logger.js';

const activeRuns = new Map<string, { pid: number; abortController: AbortController }>();

let shuttingDown = false;

export function getActiveRunCount(): number {
  return activeRuns.size;
}

export function getActiveRuns(): Map<string, { pid: number; abortController: AbortController }> {
  return activeRuns;
}

export function setShuttingDown(): void {
  shuttingDown = true;
}

export async function startRunExecutor(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info({ interval: config.runPollIntervalMs }, 'Run executor started');

  const tick = async () => {
    // Check for newly assigned issues and create wakeups before claiming runs
    try {
      await checkAssignedIssues(supabase);
    } catch (err) {
      logger.error(err, 'Issue assignment check failed');
    }

    if (shuttingDown || activeRuns.size >= config.maxConcurrentRuns) return;
    try {
      await claimAndExecuteNextRun(supabase, config);
    } catch (err) {
      logger.error(err, 'Run executor tick failed');
    }
  };

  setInterval(tick, config.runPollIntervalMs);
}

async function claimAndExecuteNextRun(supabase: SupabaseClient, config: ForgeConfig) {
  // Claim next queued run: respect priority, skip runs with future not_before
  const now = new Date().toISOString();
  const { data: queuedRuns } = await supabase
    .from('runs')
    .select('*, agent:agents(*)')
    .eq('status', 'queued')
    .or(`not_before.is.null,not_before.lte.${now}`)
    .order('priority', { ascending: false })
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

  // Budget enforcement: auto-pause agent if monthly spend exceeds limit
  if (agent.budget_monthly_cents > 0) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: spend } = await supabase
      .from('cost_events')
      .select('cost_cents')
      .eq('agent_id', agent.id)
      .gte('occurred_at', startOfMonth.toISOString());

    const totalSpent = (spend || []).reduce((sum: number, e: { cost_cents: number }) => sum + (e.cost_cents || 0), 0);

    if (totalSpent >= agent.budget_monthly_cents) {
      logger.warn({ agent: agent.name, spent: totalSpent, budget: agent.budget_monthly_cents }, 'Agent over budget, auto-pausing');
      await supabase.from('agents').update({
        status: 'paused',
        pause_reason: `Budget exceeded: $${(totalSpent / 100).toFixed(2)} of $${(agent.budget_monthly_cents / 100).toFixed(2)}`,
        paused_at: new Date().toISOString(),
      }).eq('id', agent.id);
      await cancelRun(supabase, run.id, 'Agent over budget');
      return;
    }
  }

  // Approval gate: if agent requires approval, hold the run until approved
  if (agent.approval_required) {
    // Check if an approval already exists and is approved
    const { data: existingApproval } = await supabase
      .from('approvals')
      .select('id, status')
      .eq('run_id', run.id)
      .limit(1);

    if (existingApproval?.length) {
      if (existingApproval[0].status === 'approved') {
        // Good — approval granted, proceed
        logger.info({ runId: run.id, agent: agent.name }, 'Approval granted — executing');
      } else if (existingApproval[0].status === 'rejected') {
        await cancelRun(supabase, run.id, 'Approval rejected');
        return;
      } else {
        // Still pending — put run back to queued
        await supabase.from('runs').update({
          status: 'queued',
          updated_at: new Date().toISOString(),
        }).eq('id', run.id);
        return;
      }
    } else {
      // No approval exists yet — create one and hold the run
      await supabase.from('approvals').insert({
        company_id: run.company_id,
        type: 'run_execution',
        requested_by_agent_id: agent.id,
        run_id: run.id,
        status: 'pending',
        payload: {
          agentName: agent.name,
          triggerDetail: run.trigger_detail,
          context: run.context_snapshot,
        },
      });

      // Put run back to queued — it'll be picked up again after approval
      await supabase.from('runs').update({
        status: 'queued',
        updated_at: new Date().toISOString(),
      }).eq('id', run.id);

      logger.info({ runId: run.id, agent: agent.name }, 'Approval required — holding run');
      return;
    }
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

  // Create agent home directory with persistent subdirs
  const agentHome = path.join(config.agentHomeDir, agent.name.toLowerCase().replace(/\s+/g, '-'));
  mkdirSync(path.join(agentHome, 'memory'), { recursive: true });
  mkdirSync(path.join(agentHome, 'life'), { recursive: true });

  // Dry-run mode: skip CLI spawn, mark run as succeeded immediately
  if (config.dryRun) {
    logger.info({ runId: run.id, agent: agent.name, adapterType: agent.adapter_type }, 'DRY RUN: Would spawn CLI');
    await supabase.from('runs').update({
      status: 'succeeded',
      summary: `Dry run — would spawn ${agent.adapter_type} for "${run.context_snapshot?.wakeReason || 'unknown'}"`,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', run.id);
    await supabase.from('agents').update({
      status: 'idle',
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', agent.id);
    activeRuns.delete(run.id);
    return;
  }

  try {
    // Inject recent history from Supabase runs table — agent memory
    const recentHistory = await searchAgentHistory(supabase, {
      agentId: agent.id,
      limit: 3,
    });
    const historyContext = recentHistory.length > 0
      ? recentHistory.map((h, i) =>
          `--- Previous Run ${i + 1} (${h.createdAt}) ---\n${h.resultText.slice(0, 500)}`
        ).join('\n\n')
      : '';

    // Inject goal context — agents should know the north star
    let goalContext = '';
    try {
      const { data: goals } = await supabase
        .from('goals')
        .select('title, description, status')
        .eq('company_id', run.company_id)
        .in('status', ['active', 'in_progress'])
        .order('created_at', { ascending: true })
        .limit(5);

      if (goals?.length) {
        goalContext = '## Company Goals\n' + goals.map((g) =>
          `- **${g.title}** (${g.status}): ${g.description || ''}`
        ).join('\n');
      }
    } catch (err) {
      logger.debug({ err }, 'Failed to fetch goals — continuing without');
    }

    const contextWithHistory = {
      ...(run.context_snapshot || {}),
      recentHistory: historyContext || undefined,
      goalContext: goalContext || undefined,
    };

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
      context: contextWithHistory,
      cwd,
      agentHome,
      signal: abortController.signal,
      onLog: async (stream, chunk) => {
        // Keep run alive — update updated_at so orphan reaper doesn't kill us
        await supabase.from('runs').update({ updated_at: new Date().toISOString() }).eq('id', run.id);
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

    // Detect [SILENT] marker — agent had nothing to report
    const resultText = result.summary || (result.resultJson as any)?.result || '';
    const isSilent = resultText.includes('[SILENT]');

    if (isSilent) {
      logger.info({ runId: run.id, agent: agent.name }, 'Silent run — agent had nothing to report');
    }

    await supabase
      .from('runs')
      .update({
        status,
        exit_code: result.exitCode,
        signal: result.signal,
        timed_out: result.timedOut,
        error: result.errorMessage,
        stdout_excerpt: result.stdoutExcerpt,
        stderr_excerpt: result.stderrExcerpt,
        session_id_after: result.sessionId,
        session_params: result.sessionParams,
        result_json: result.resultJson,
        summary: isSilent ? '[SILENT] ' + (result.summary || 'No work to do') : result.summary,
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

    // Auto-handoffs on successful runs
    if (status === 'succeeded') {
      try {
        await checkForQAHandoff(supabase, run);
      } catch (err) {
        logger.error({ err, runId: run.id }, 'QA handoff check failed');
      }
      try {
        await checkForShipHandoff(supabase, run);
      } catch (err) {
        logger.error({ err, runId: run.id }, 'Ship handoff check failed');
      }
    }

    // Index the run result for FTS5 cross-session search
    const indexableText = result.summary || (result.resultJson as any)?.result || '';
    if (indexableText && !isSilent) {
      indexRunResult(config.agentHomeDir, {
        runId: run.id,
        agentId: agent.id,
        agentName: agent.name,
        companyId: run.company_id,
        resultText: indexableText,
        costUsd: result.costUsd ?? null,
        turnsUsed: (result.resultJson as any)?.num_turns ?? null,
        status,
        issueId: run.context_snapshot?.issueId ?? null,
      });
    }

    // Retry failed runs automatically
    if (status === 'failed' || status === 'timed_out') {
      await maybeRetryRun(supabase, run, agent, result.errorMessage || 'Non-zero exit code');
    }

    logger.info({ runId: run.id, status, agent: agent.name }, 'Run completed');

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId: run.id }, 'Run execution failed');
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        error: errorMsg,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    await supabase
      .from('agents')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', agent.id);

    // Retry on crash/exception too
    await maybeRetryRun(supabase, run, agent, errorMsg);
  } finally {
    activeRuns.delete(run.id);
  }
}

/**
 * Detect issues that have been assigned to an agent (assignee_agent_id set, status='todo',
 * no active execution lock) and create wakeup requests so the agent picks them up.
 */
async function checkAssignedIssues(supabase: SupabaseClient) {
  const { data: issues, error } = await supabase
    .from('issues')
    .select('id, company_id, assignee_agent_id, title, project_id, priority')
    .eq('status', 'todo')
    .not('assignee_agent_id', 'is', null)
    .is('execution_run_id', null)
    .limit(10);

  if (error) {
    logger.error({ error }, 'Failed to query assigned issues');
    return;
  }

  if (!issues?.length) return;

  for (const issue of issues) {
    const agentId = issue.assignee_agent_id as string;

    logger.debug({ issueId: issue.id, agentId }, 'Creating wakeup for assigned issue');

    // Map issue priority to run priority: critical=3, high=2, medium=1, low=0
    const priorityMap: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
    const runPriority = priorityMap[issue.priority] ?? 0;

    const runId = await createWakeup(supabase, {
      companyId: issue.company_id,
      agentId,
      source: 'assignment',
      triggerDetail: issue.title,
      reason: `Assigned issue: ${issue.title}`,
      payload: {
        issueId: issue.id,
        projectId: issue.project_id ?? null,
      },
      idempotencyKey: `assignment-${issue.id}`,
      priority: runPriority,
    });

    if (runId) {
      await lockIssueExecution(supabase, issue.id, runId);
    }
  }
}

/**
 * After a successful run, check if the issue was moved to 'in_review'.
 * If so, auto-create a QA subtask assigned to the company's 'QA Rider' agent.
 */
async function checkForQAHandoff(supabase: SupabaseClient, run: any) {
  const issueId = run.context_snapshot?.issueId;
  if (!issueId) return;

  // 1. Confirm the issue is now in_review
  const { data: issue } = await supabase
    .from('issues')
    .select('id, title, status, description, company_id, project_id')
    .eq('id', issueId)
    .single();

  if (!issue || issue.status !== 'in_review') return;

  // 2. Find the QA agent for this company
  const { data: qaAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('company_id', issue.company_id)
    .eq('name', 'QA Rider')
    .single();

  if (!qaAgent) {
    logger.warn({ companyId: issue.company_id }, 'No QA Rider agent found — skipping QA handoff');
    return;
  }

  // 3. Check if a QA subtask already exists for this issue (idempotency)
  const { data: existing } = await supabase
    .from('issues')
    .select('id')
    .eq('parent_id', issue.id)
    .eq('assignee_agent_id', qaAgent.id)
    .limit(1);

  if (existing && existing.length > 0) {
    logger.debug({ issueId: issue.id }, 'QA subtask already exists — skipping');
    return;
  }

  // 4. Increment issue counter for identifier
  const { data: company } = await supabase
    .from('companies')
    .select('issue_prefix, issue_counter')
    .eq('id', issue.company_id)
    .single();

  const { data: updated } = await supabase
    .from('companies')
    .update({ issue_counter: (company?.issue_counter || 0) + 1 })
    .eq('id', issue.company_id)
    .select('issue_counter')
    .single();

  const issueNumber = updated?.issue_counter || 1;
  const identifier = `${company?.issue_prefix}-${issueNumber}`;

  // 5. Build QA description with acceptance criteria and branch info
  const branch = run.context_snapshot?.branch || run.context_snapshot?.branchName || 'unknown';
  const description = [
    `## QA Verification for: ${issue.title}`,
    '',
    `**Branch:** \`${branch}\``,
    `**Parent issue:** ${issue.id}`,
    '',
    '### Acceptance Criteria',
    issue.description || '_No acceptance criteria provided — verify the feature works as described in the title._',
  ].join('\n');

  // 6. Create the QA subtask
  const { data: qaIssue, error } = await supabase.from('issues').insert({
    company_id: issue.company_id,
    project_id: issue.project_id,
    title: `QA: Verify ${issue.title}`,
    description,
    status: 'todo',
    priority: 'high',
    assignee_agent_id: qaAgent.id,
    parent_id: issue.id,
    issue_number: issueNumber,
    identifier,
    origin_kind: 'qa_handoff',
    origin_id: run.agent_id,
  }).select('id, identifier').single();

  if (error) {
    logger.error({ error, issueId: issue.id }, 'Failed to create QA subtask');
    return;
  }

  logger.info(
    { qaIssueId: qaIssue?.id, identifier: qaIssue?.identifier, parentIssue: issue.id },
    'QA subtask created — assignment detector will wake QA Rider',
  );
}

/**
 * After QA marks an issue as 'approved', auto-create a ship subtask
 * assigned to the company's Ship Engineer agent.
 */
async function checkForShipHandoff(supabase: SupabaseClient, run: any) {
  const issueId = run.context_snapshot?.issueId;
  if (!issueId) return;

  const { data: issue } = await supabase
    .from('issues')
    .select('id, title, status, description, company_id, project_id')
    .eq('id', issueId)
    .single();

  if (!issue || issue.status !== 'approved') return;

  // Find the Ship Engineer for this company
  const { data: shipAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('company_id', issue.company_id)
    .eq('name', 'Ship Engineer')
    .single();

  if (!shipAgent) {
    logger.warn({ companyId: issue.company_id }, 'No Ship Engineer agent found — skipping ship handoff');
    return;
  }

  // Idempotency: check if ship subtask already exists
  const { data: existing } = await supabase
    .from('issues')
    .select('id')
    .eq('parent_id', issue.id)
    .eq('assignee_agent_id', shipAgent.id)
    .limit(1);

  if (existing && existing.length > 0) return;

  // Increment issue counter
  const { data: company } = await supabase
    .from('companies')
    .select('issue_prefix, issue_counter')
    .eq('id', issue.company_id)
    .single();

  const { data: updated } = await supabase
    .from('companies')
    .update({ issue_counter: (company?.issue_counter || 0) + 1 })
    .eq('id', issue.company_id)
    .select('issue_counter')
    .single();

  const issueNumber = updated?.issue_counter || 1;
  const identifier = `${company?.issue_prefix}-${issueNumber}`;

  const branch = run.context_snapshot?.branch || run.context_snapshot?.branchName || 'unknown';
  const description = [
    `## Ship: ${issue.title}`,
    '',
    `**Branch:** \`${branch}\``,
    `**Parent issue:** ${issue.id}`,
    `**QA Status:** Approved`,
    '',
    '### Instructions',
    '1. Rebase branch on master',
    '2. Verify build passes',
    '3. Create PR via `gh pr create` targeting `master`',
    '4. Post PR URL as comment on the parent issue',
  ].join('\n');

  const { data: shipIssue, error } = await supabase.from('issues').insert({
    company_id: issue.company_id,
    project_id: issue.project_id,
    title: `Ship: ${issue.title}`,
    description,
    status: 'todo',
    priority: 'high',
    assignee_agent_id: shipAgent.id,
    parent_id: issue.id,
    issue_number: issueNumber,
    identifier,
    origin_kind: 'ship_handoff',
    origin_id: run.agent_id,
  }).select('id, identifier').single();

  if (error) {
    logger.error({ error, issueId: issue.id }, 'Failed to create ship subtask');
    return;
  }

  logger.info(
    { shipIssueId: shipIssue?.id, identifier: shipIssue?.identifier, parentIssue: issue.id },
    'Ship subtask created — assignment detector will wake Ship Engineer',
  );
}

/**
 * Retry a failed run with exponential backoff.
 * Creates a new queued run linked to the original via parent_run_id.
 * Backoff: retry 1 = 30s, retry 2 = 120s (2min). Max 2 retries by default.
 */
async function maybeRetryRun(supabase: SupabaseClient, run: any, agent: any, error: string) {
  const retryCount = run.retry_count ?? 0;
  const maxRetries = run.max_retries ?? 2;

  if (retryCount >= maxRetries) {
    logger.info({ runId: run.id, retryCount, maxRetries }, 'Max retries reached — not retrying');
    return;
  }

  // Don't retry budget overruns or cancellations
  if (error.includes('over budget') || error.includes('Approval rejected')) return;

  const nextRetry = retryCount + 1;
  const backoffMs = 30_000 * Math.pow(2, retryCount); // 30s, 60s, 120s
  const notBefore = new Date(Date.now() + backoffMs).toISOString();

  const { data: retryRun, error: insertErr } = await supabase
    .from('runs')
    .insert({
      company_id: run.company_id,
      agent_id: run.agent_id,
      invocation_source: run.invocation_source,
      trigger_detail: `retry #${nextRetry}: ${run.trigger_detail || 'unknown'}`,
      status: 'queued',
      context_snapshot: run.context_snapshot,
      priority: run.priority ?? 0,
      retry_count: nextRetry,
      max_retries: maxRetries,
      parent_run_id: run.parent_run_id || run.id,
      not_before: notBefore,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr) {
    logger.error({ insertErr, runId: run.id }, 'Failed to create retry run');
    return;
  }

  // Reset agent to idle so it can pick up the retry
  await supabase.from('agents')
    .update({ status: 'idle', updated_at: new Date().toISOString() })
    .eq('id', agent.id);

  logger.info(
    { runId: run.id, retryRunId: retryRun?.id, retryCount: nextRetry, backoffMs, notBefore },
    'Retry run queued with backoff',
  );
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
