import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const ORPHAN_THRESHOLD_MS = 10 * 60 * 1000;

export async function startOrphanReaper(
  supabase: SupabaseClient,
  config: ForgeConfig & { runOnce?: boolean },
) {
  const reap = async () => {
    try {
      const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS).toISOString();

      const { data: orphans } = await supabase
        .from('runs')
        .select('id, agent_id, started_at')
        .eq('status', 'running')
        .lt('updated_at', cutoff);

      if (!orphans?.length) return;

      logger.warn({ count: orphans.length }, 'Reaping orphaned runs');

      for (const orphan of orphans) {
        await supabase
          .from('runs')
          .update({
            status: 'failed',
            error: 'Orphaned — no update for 10 minutes',
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', orphan.id);

        await supabase
          .from('agents')
          .update({ status: 'idle', updated_at: new Date().toISOString() })
          .eq('id', orphan.agent_id);
      }
    } catch (err) {
      logger.error(err, 'Orphan reaper failed');
    }
  };

  await reap();

  if (config.runOnce) return;

  logger.info('Orphan reaper started (60s interval)');
  setInterval(reap, 60_000);
}
