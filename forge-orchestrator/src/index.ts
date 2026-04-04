import 'dotenv/config';
import { loadConfig } from './config.js';
import { createSupabaseClient } from './supabase.js';
import { startRunExecutor } from './loops/run-executor.js';
import { startHeartbeatScheduler } from './loops/heartbeat-scheduler.js';
import { startRoutineScheduler } from './loops/routine-scheduler.js';
import { startOrphanReaper } from './loops/orphan-reaper.js';
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

  await startOrphanReaper(supabase, { ...config, runOnce: true });

  await Promise.all([
    startRunExecutor(supabase, config),
    startHeartbeatScheduler(supabase, config),
    startRoutineScheduler(supabase, config),
    startOrphanReaper(supabase, config),
  ]);

  logger.info('All loops running');
}

main().catch((err) => {
  logger.fatal(err, 'Orchestrator crashed');
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});
