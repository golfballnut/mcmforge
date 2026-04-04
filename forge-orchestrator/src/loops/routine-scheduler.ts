import { SupabaseClient } from '@supabase/supabase-js';
import { CronExpressionParser } from 'cron-parser';
import { ForgeConfig } from '../config.js';
import { createWakeup } from '../services/wakeup.js';
import { logger } from '../utils/logger.js';

export async function startRoutineScheduler(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info({ interval: config.routinePollIntervalMs }, 'Routine scheduler started');

  const tick = async () => {
    try {
      await processDueRoutines(supabase);
    } catch (err) {
      logger.error(err, 'Routine scheduler tick failed');
    }
  };

  setInterval(tick, config.routinePollIntervalMs);
}

async function processDueRoutines(supabase: SupabaseClient) {
  const now = new Date().toISOString();

  // Fetch active routines where next_run_at is null or overdue
  const { data: routines, error } = await supabase
    .from('routines')
    .select('*')
    .eq('status', 'active')
    .or(`next_run_at.is.null,next_run_at.lte.${now}`);

  if (error) {
    logger.error({ error }, 'Failed to query routines');
    return;
  }

  if (!routines?.length) return;

  logger.debug({ count: routines.length }, 'Processing due routines');

  for (const routine of routines) {
    try {
      await fireRoutine(supabase, routine);
    } catch (err) {
      logger.error({ err, routineId: routine.id, routineName: routine.name }, 'Failed to fire routine');
    }
  }
}

async function fireRoutine(supabase: SupabaseClient, routine: any) {
  const agentId: string = routine.assignee_agent_id;
  if (!agentId) {
    logger.warn({ routineId: routine.id }, 'Routine has no assignee_agent_id — skipping');
    return;
  }

  // Concurrency check: if policy is 'skip_if_active', bail if agent is already running
  if (routine.concurrency_policy === 'skip_if_active') {
    const { data: agent } = await supabase
      .from('agents')
      .select('id, status')
      .eq('id', agentId)
      .single();

    if (agent?.status === 'running') {
      logger.debug(
        { routineId: routine.id, agentId },
        'Skipping routine — agent is already running (skip_if_active)',
      );
      await advanceNextRunAt(supabase, routine);
      return;
    }
  }

  // Create an issue for this routine run
  const { data: issue, error: issueError } = await supabase
    .from('issues')
    .insert({
      company_id: routine.company_id,
      title: routine.title,
      description: routine.description ?? null,
      assignee_agent_id: agentId,
      project_id: routine.project_id ?? null,
      priority: routine.priority ?? 'medium',
      status: 'todo',
      origin_kind: 'routine',
      origin_id: routine.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (issueError || !issue) {
    logger.error({ error: issueError, routineId: routine.id }, 'Failed to create issue for routine');
    return;
  }

  // Create the wakeup + run
  const runId = await createWakeup(supabase, {
    companyId: routine.company_id,
    agentId,
    source: 'routine',
    triggerDetail: routine.name,
    reason: `Routine: ${routine.name}`,
    payload: {
      routineId: routine.id,
      issueId: issue.id,
      projectId: routine.project_id ?? null,
    },
  });

  if (!runId) {
    logger.error({ routineId: routine.id }, 'Failed to create run for routine — rolling back issue');
    await supabase.from('issues').delete().eq('id', issue.id);
    return;
  }

  // Lock the issue to the new run
  await supabase
    .from('issues')
    .update({
      execution_run_id: runId,
      execution_locked_at: new Date().toISOString(),
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', issue.id);

  // Record the routine_run linking routine → issue → run
  const { error: routineRunError } = await supabase.from('routine_runs').insert({
    company_id: routine.company_id,
    routine_id: routine.id,
    issue_id: issue.id,
    run_id: runId,
    triggered_at: new Date().toISOString(),
    status: 'running',
  });

  if (routineRunError) {
    logger.warn({ error: routineRunError, routineId: routine.id }, 'Failed to insert routine_run record');
  }

  logger.info(
    { routineId: routine.id, routineName: routine.name, issueId: issue.id, runId },
    'Routine fired',
  );

  // Advance the schedule
  await advanceNextRunAt(supabase, routine);
}

async function advanceNextRunAt(supabase: SupabaseClient, routine: any) {
  const now = new Date().toISOString();
  let nextRun: string | null = null;

  if (routine.cron_expression) {
    try {
      const tz = routine.timezone || 'UTC';
      const interval = CronExpressionParser.parse(routine.cron_expression, { tz });
      nextRun = interval.next().toDate().toISOString();
    } catch (err) {
      logger.error(
        { err, routineId: routine.id, cron: routine.cron_expression },
        'Failed to parse cron expression',
      );
    }
  }

  await supabase
    .from('routines')
    .update({
      last_triggered_at: now,
      next_run_at: nextRun,
      updated_at: now,
    })
    .eq('id', routine.id);
}
