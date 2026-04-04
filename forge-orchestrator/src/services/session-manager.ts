import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

interface AgentSessionConfig {
  id: string;
  session_id: string | null;
  session_params: Record<string, unknown> | null;
  last_run_at: string | null;
  adapter_config: Record<string, unknown>;
  /** Optional: count of runs in the current session (may not be present on all agents). */
  session_run_count?: number | null;
}

interface RotationConfig {
  /** Max number of runs before forcing a new session. 0 = unlimited. */
  maxSessionRuns?: number;
  /** Max age in hours before forcing a new session. 0 = unlimited. */
  maxSessionAgeHours?: number;
}

/**
 * Determine whether an agent's session should be rotated.
 *
 * Rotation is triggered when:
 *   1. maxSessionRuns is set and the agent has reached that count, OR
 *   2. maxSessionAgeHours is set and the session is older than that threshold.
 */
export async function shouldRotateSession(
  supabase: SupabaseClient,
  agent: AgentSessionConfig,
  config: RotationConfig,
): Promise<boolean> {
  // No active session — nothing to rotate
  if (!agent.session_id) return false;

  const { maxSessionRuns = 0, maxSessionAgeHours = 0 } = config;

  // Check run count
  if (maxSessionRuns > 0) {
    const runCount = agent.session_run_count ?? (await fetchSessionRunCount(supabase, agent.id, agent.session_id));
    if (runCount >= maxSessionRuns) {
      logger.info({ agentId: agent.id, runCount, maxSessionRuns }, 'Session rotation: max runs reached');
      return true;
    }
  }

  // Check session age
  if (maxSessionAgeHours > 0 && agent.last_run_at) {
    const ageMs = Date.now() - new Date(agent.last_run_at).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours >= maxSessionAgeHours) {
      logger.info({ agentId: agent.id, ageHours, maxSessionAgeHours }, 'Session rotation: max age reached');
      return true;
    }
  }

  return false;
}

/**
 * Clear the session on an agent, forcing the next run to start fresh.
 */
export async function rotateSession(
  supabase: SupabaseClient,
  agentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('agents')
    .update({
      session_id: null,
      session_params: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  if (error) {
    logger.error({ error, agentId }, 'Failed to rotate session');
    throw new Error(`Session rotation failed for agent ${agentId}: ${error.message}`);
  }

  logger.info({ agentId }, 'Session rotated — agent will start a new session on next run');
}

/** Count how many runs exist for the given agent + session by matching session_id_before or session_id_after. */
async function fetchSessionRunCount(
  supabase: SupabaseClient,
  agentId: string,
  sessionId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .or(`session_id_before.eq.${sessionId},session_id_after.eq.${sessionId}`);

  if (error) {
    logger.warn({ error, agentId, sessionId }, 'Failed to fetch session run count, defaulting to 0');
    return 0;
  }

  return count ?? 0;
}
