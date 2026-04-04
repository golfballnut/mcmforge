import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

export async function startHeartbeatScheduler(supabase: SupabaseClient, config: ForgeConfig) {
  logger.info({ interval: config.heartbeatPollIntervalMs }, 'Heartbeat scheduler started (stub)');

  setInterval(async () => {
    // Phase 3: Check agent timer intervals, create wakeup requests
  }, config.heartbeatPollIntervalMs);
}
