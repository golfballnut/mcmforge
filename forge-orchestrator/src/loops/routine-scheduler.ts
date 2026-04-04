import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

export async function startRoutineScheduler(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info({ interval: config.routinePollIntervalMs }, 'Routine scheduler started (stub)');

  setInterval(async () => {
    // Phase 3: Check cron schedules, create issues and wakeups
  }, config.routinePollIntervalMs);
}
