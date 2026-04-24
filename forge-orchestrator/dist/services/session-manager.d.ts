import { SupabaseClient } from '@supabase/supabase-js';
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
export declare function shouldRotateSession(supabase: SupabaseClient, agent: AgentSessionConfig, config: RotationConfig): Promise<boolean>;
/**
 * Clear the session on an agent, forcing the next run to start fresh.
 */
export declare function rotateSession(supabase: SupabaseClient, agentId: string): Promise<void>;
export {};
//# sourceMappingURL=session-manager.d.ts.map