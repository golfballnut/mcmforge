import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { createSupabaseClient } from './supabase.js';
import { startRunExecutor, getActiveRuns, setShuttingDown } from './loops/run-executor.js';
import { startHeartbeatScheduler } from './loops/heartbeat-scheduler.js';
import { startRoutineScheduler } from './loops/routine-scheduler.js';
import { startOrphanReaper } from './loops/orphan-reaper.js';
import { startMentionWatcher } from './loops/mention-watcher.js';
import { startGoalWatcher } from './loops/goal-watcher.js';
import { startAgentAdvisor } from './loops/agent-advisor.js';
import { startCOORouter } from './loops/coo-router.js';
import { startCostCircuitBreaker } from './loops/cost-circuit-breaker.js';
import { startAgentApi } from './agent-api.js';
import { logger } from './utils/logger.js';
import { runAutoAttachScan } from './services/auto-attach-proof.js';
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
    // FORGE-253: Auto-attach any committed proof artifacts on startup
    try {
        const cwdResearch = path.resolve(process.cwd(), 'docs/research');
        const attachDir = existsSync(cwdResearch)
            ? cwdResearch
            : path.resolve(config.agentHomeDir, '../../docs/research');
        const attachResult = await runAutoAttachScan(supabase, attachDir);
        logger.info(attachResult, 'Startup auto-attach scan complete');
    }
    catch (err) {
        logger.warn({ err }, 'Auto-attach startup scan failed — continuing');
    }
    const loops = [
        startRunExecutor(supabase, config),
        startHeartbeatScheduler(supabase, config),
        startRoutineScheduler(supabase, config),
        startOrphanReaper(supabase, config),
        startMentionWatcher(supabase, config),
        startGoalWatcher(supabase, config),
        startAgentAdvisor(supabase, config),
    ];
    // COO router is opt-in via env flag until certified (G2+). Off by default.
    if (process.env.COO_ROUTER_ENABLED === 'true') {
        loops.push(startCOORouter(supabase, config));
        logger.info('COO router: ENABLED (env COO_ROUTER_ENABLED=true)');
    }
    else {
        logger.info('COO router: disabled (set COO_ROUTER_ENABLED=true to activate)');
    }
    // Cost circuit breaker — ON by default (always-on safety). Disable only via env.
    if (process.env.COST_CIRCUIT_BREAKER_DISABLED !== 'true') {
        loops.push(startCostCircuitBreaker(supabase, config));
        logger.info('Cost circuit breaker: ENABLED (default-on safety)');
    }
    else {
        logger.warn('Cost circuit breaker: DISABLED (env COST_CIRCUIT_BREAKER_DISABLED=true) — runaway risk');
    }
    await Promise.all(loops);
    logger.info('All loops running');
}
main().catch((err) => {
    logger.fatal(err, 'Orchestrator crashed');
    process.exit(1);
});
async function gracefulShutdown(signal) {
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
        }
        catch {
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
            try {
                process.kill(pid, 'SIGKILL');
            }
            catch { /* already dead */ }
        }
    }
    logger.info('Graceful shutdown complete');
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
//# sourceMappingURL=index.js.map