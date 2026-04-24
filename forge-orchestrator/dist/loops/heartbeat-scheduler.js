import { createWakeup } from '../services/wakeup.js';
import { logger } from '../utils/logger.js';
export async function startHeartbeatScheduler(supabase, config) {
    logger.info({ interval: config.heartbeatPollIntervalMs }, 'Heartbeat scheduler started');
    const tick = async () => {
        try {
            await checkAgentHeartbeats(supabase);
        }
        catch (err) {
            logger.error(err, 'Heartbeat scheduler tick failed');
        }
    };
    setInterval(tick, config.heartbeatPollIntervalMs);
}
async function checkAgentHeartbeats(supabase) {
    // Query idle agents that have a timer interval configured
    const { data: agents, error } = await supabase
        .from('agents')
        .select('id, company_id, name, status, adapter_config, last_heartbeat_at')
        .eq('status', 'idle')
        .not('adapter_config->intervalSec', 'is', null);
    if (error) {
        logger.error({ error }, 'Failed to query agents for heartbeat');
        return;
    }
    if (!agents?.length)
        return;
    const now = Date.now();
    // Minute bucket for idempotency — prevents double-fire within the same minute
    const minuteBucket = Math.floor(now / 60_000);
    for (const agent of agents) {
        const intervalSec = agent.adapter_config?.intervalSec;
        if (!intervalSec || intervalSec <= 0)
            continue;
        const lastHeartbeat = agent.last_heartbeat_at
            ? new Date(agent.last_heartbeat_at).getTime()
            : 0;
        const dueAt = lastHeartbeat + intervalSec * 1000;
        if (now < dueAt)
            continue;
        const idempotencyKey = `heartbeat-${agent.id}-${minuteBucket}`;
        logger.debug({ agentId: agent.id, agentName: agent.name }, 'Scheduling heartbeat wakeup');
        await createWakeup(supabase, {
            companyId: agent.company_id,
            agentId: agent.id,
            source: 'timer',
            reason: `Scheduled heartbeat (every ${intervalSec}s)`,
            idempotencyKey,
        });
    }
}
//# sourceMappingURL=heartbeat-scheduler.js.map