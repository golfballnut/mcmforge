import 'dotenv/config';
import { loadConfig } from './config.js';
import { createSupabaseClient } from './supabase.js';
import { startRunExecutor, getActiveRuns, setShuttingDown } from './loops/run-executor.js';
import { startHeartbeatScheduler } from './loops/heartbeat-scheduler.js';
import { startRoutineScheduler } from './loops/routine-scheduler.js';
import { startOrphanReaper } from './loops/orphan-reaper.js';
import { startMentionWatcher } from './loops/mention-watcher.js';
import { startGoalWatcher } from './loops/goal-watcher.js';
import { startAgentApi } from './agent-api.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('MCM Forge Orchestrator starting');

  const config = loadConfig();
  const supabase = createSupabaseClient(config);

  const { data, error } = await supabase.from('companies').select('id, name').limit(1);
  if (error) {
    logger.fatal({ error }, 'Failed to connect to Supabase');
    process.exit(1);
  }
  logger.info({ companies: data?.length ?? 0 }, 'Supabase connected');

  // Start the local agent API (localhost only, no network exposure)
  const agentApiPort = config.agentApiPort;
  startAgentApi(supabase, agentApiPort);

  await startOrphanReaper(supabase, { ...config, runOnce: true });

  await Promise.all([
    startRunExecutor(supabase, config),
    startHeartbeatScheduler(supabase, config),
    startRoutineScheduler(supabase, config),
    startOrphanReaper(supabase, config),
    startMentionWatcher(supabase, config),
    startGoalWatcher(supabase, config),
  ]);

  logger.info('All loops running');
}

main().catch((err) => {
  logger.fatal(err, 'Orchestrator crashed');
  process.exit(1);
});

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received — stopping new runs');
  setShuttingDown();

  const active = getActiveRuns();
  if (active.size === 0) {
    logger.info('No active runs, exiting immediately');
    process.exit(0);
  }

  logger.info({ count: active.size }, 'Waiting for active runs to finish (30s timeout)');

  // Send SIGTERM to all child CLI processes
  for (const [runId, { pid, abortController }] of active) {
    try {
      logger.info({ runId, pid }, 'Sending SIGTERM to child process');
      abortController.abort();
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may have already exited
    }
  }

  // Wait up to 30s for active runs to drain
  const deadline = Date.now() + 30_000;
  while (active.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (active.size > 0) {
    logger.warn({ remaining: active.size }, 'Timeout — force killing remaining processes');
    for (const [, { pid }] of active) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
    }
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
