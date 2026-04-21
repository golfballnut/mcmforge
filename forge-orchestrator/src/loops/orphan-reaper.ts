import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const ORPHAN_THRESHOLD_MS = 30 * 60 * 1000; // 30 min — Opus runs can take 15+ min

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

      if (orphans?.length) {
        logger.warn({ count: orphans.length }, 'Reaping orphaned runs');

        for (const orphan of orphans) {
          await supabase
            .from('runs')
            .update({
              status: 'failed',
              error: 'Orphaned — no update for 30 minutes',
              finished_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', orphan.id);

          // Preserve paused/terminated — only flip running → idle on reap.
          await supabase
            .from('agents')
            .update({ status: 'idle', updated_at: new Date().toISOString() })
            .eq('id', orphan.agent_id)
            .eq('status', 'running');
        }
      }

      // Stale wakeup cleanup — drop wakeup_requests that point at:
      //   (a) deleted issues, (b) done/cancelled issues, (c) paused/terminated agents.
      // Prevents the "Woke with assigned issue ... does not exist" silent-loop pattern.
      await cleanupStaleWakeups(supabase);
    } catch (err) {
      logger.error(err, 'Orphan reaper failed');
    }
  };

  await reap();

  if (config.runOnce) return;

  logger.info('Orphan reaper started (60s interval)');
  setInterval(reap, 60_000);
}

/**
 * Stale wakeup cleanup. Runs every reap cycle.
 * Schema note: forge.wakeup_requests has agent_id + payload (jsonb with issueId).
 * Safe deletes only — no cascading effects on other tables.
 */
async function cleanupStaleWakeups(supabase: SupabaseClient): Promise<void> {
  // (a) Wakeups for paused/terminated agents — no point waking them
  const { data: pausedAgents } = await supabase
    .from('agents')
    .select('id')
    .in('status', ['paused', 'terminated']);

  if (pausedAgents?.length) {
    const pausedIds = pausedAgents.map((a: { id: string }) => a.id);
    const { error: pausedErr, count: pausedCount } = await supabase
      .from('wakeup_requests')
      .delete({ count: 'exact' })
      .in('agent_id', pausedIds)
      .eq('status', 'pending');
    if (pausedErr) {
      logger.warn({ err: pausedErr }, 'cleanupStaleWakeups: paused-agent cleanup failed');
    } else if ((pausedCount ?? 0) > 0) {
      logger.info({ count: pausedCount }, 'Cleaned stale wakeups for paused/terminated agents');
    }
  }

  // (b) Wakeups pointing at done/cancelled issues via payload.issueId
  // Supabase jsonb ->> syntax: query the payload->>'issueId' text value.
  // We select pending wakeups, cross-check their issueId against forge.issues.status.
  const { data: pending } = await supabase
    .from('wakeup_requests')
    .select('id, payload')
    .eq('status', 'pending')
    .limit(200); // cap per tick

  if (!pending?.length) return;

  const issueIds = Array.from(
    new Set(
      (pending as Array<{ id: string; payload: { issueId?: string } | null }>)
        .map((w) => w.payload?.issueId)
        .filter((x): x is string => typeof x === 'string' && x.length > 0),
    ),
  );

  if (!issueIds.length) return;

  const { data: issues } = await supabase
    .from('issues')
    .select('id, status')
    .in('id', issueIds);

  const issuesById = new Map<string, string>(
    (issues ?? []).map((i: { id: string; status: string }) => [i.id, i.status]),
  );

  const wakesToDrop: string[] = [];
  for (const w of pending as Array<{ id: string; payload: { issueId?: string } | null }>) {
    const iid = w.payload?.issueId;
    if (!iid) continue;
    const status = issuesById.get(iid);
    if (!status) {
      // Issue doesn't exist (deleted)
      wakesToDrop.push(w.id);
    } else if (status === 'done' || status === 'cancelled') {
      wakesToDrop.push(w.id);
    }
  }

  if (!wakesToDrop.length) return;

  const { error: dropErr, count: dropCount } = await supabase
    .from('wakeup_requests')
    .delete({ count: 'exact' })
    .in('id', wakesToDrop);

  if (dropErr) {
    logger.warn({ err: dropErr, count: wakesToDrop.length }, 'cleanupStaleWakeups: stale-issue cleanup failed');
  } else {
    logger.info({ count: dropCount }, 'Cleaned stale wakeups for deleted/done/cancelled issues');
  }
}
