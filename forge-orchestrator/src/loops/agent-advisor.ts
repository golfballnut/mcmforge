import { SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Agent Advisor — continuously monitors agent performance and auto-diagnoses gaps.
 *
 * Runs every 5 minutes. For each agent:
 * 1. Reviews recent runs (last 24h)
 * 2. Detects failure patterns (blocked, max_turns, no results, wrong tool)
 * 3. Auto-fixes known issues (turn limits, adapter config)
 * 4. Posts diagnosis as issue comment so CEO/Steve can see
 * 5. Updates agent's performance grade
 */

interface AgentDiagnosis {
  agentId: string;
  agentName: string;
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  autoFix?: { field: string; oldValue: any; newValue: any };
}

const KNOWN_FAILURE_PATTERNS: Array<{
  pattern: RegExp;
  diagnosis: string;
  severity: 'critical' | 'warning';
  autoFix?: (agent: any) => { field: string; oldValue: any; newValue: any } | null;
}> = [
  {
    pattern: /max_turns|Reached maximum number of turns/i,
    diagnosis: 'Agent ran out of turns before completing work. Needs more turns or smaller scope per run.',
    severity: 'warning',
    autoFix: (agent) => {
      const current = agent.adapter_config?.maxTurnsPerRun ?? 10;
      if (current < 30) {
        return { field: 'maxTurnsPerRun', oldValue: current, newValue: Math.min(current + 5, 30) };
      }
      return null;
    },
  },
  {
    pattern: /google_web_search.*no results|web_search.*blocked|Research Blocked/i,
    diagnosis: 'Agent cannot perform web searches. Web search tool is broken or unavailable for this CLI adapter.',
    severity: 'critical',
  },
  {
    pattern: /permission_denied|Tool execution denied by policy/i,
    diagnosis: 'Agent was denied tool access. Needs --dangerously-skip-permissions or tool allowlisting.',
    severity: 'critical',
  },
  {
    pattern: /ECONNREFUSED.*3200|Forge API.*failed|fetch failed/i,
    diagnosis: 'Agent cannot reach the Forge API. The agent-api server may not be running.',
    severity: 'critical',
  },
  {
    pattern: /Not logged in|CLAUDE_CODE_OAUTH_TOKEN/i,
    diagnosis: 'Claude CLI not authenticated. Check CLAUDE_CODE_OAUTH_TOKEN env var.',
    severity: 'critical',
  },
  {
    pattern: /xcodebuild.*error|build.*failed.*error/i,
    diagnosis: 'Xcode build failed. Check scheme, target, and code errors.',
    severity: 'warning',
  },
  {
    pattern: /No (QA Rider|Ship Engineer|iOS Builder|Design Scout|Code Scout) agent found/i,
    diagnosis: 'Auto-handoff failed because the target agent does not exist or has wrong name.',
    severity: 'critical',
  },
];

export async function startAgentAdvisor(
  supabase: SupabaseClient,
  config: ForgeConfig & { runOnce?: boolean },
) {
  const advise = async () => {
    try {
      const diagnoses = await analyzeRecentRuns(supabase);

      for (const diagnosis of diagnoses) {
        // Auto-fix if possible
        if (diagnosis.autoFix) {
          await applyAutoFix(supabase, diagnosis);
        }

        // Post diagnosis as a run_event for visibility
        logger.info(
          { agent: diagnosis.agentName, issue: diagnosis.issue, severity: diagnosis.severity },
          'Agent Advisor diagnosis',
        );
      }

      // Update agent performance grades
      await updatePerformanceGrades(supabase);
    } catch (err) {
      logger.error(err, 'Agent Advisor failed');
    }
  };

  await advise();

  if (config.runOnce) return;

  logger.info('Agent Advisor started (5min interval)');
  setInterval(advise, 5 * 60_000);
}

async function analyzeRecentRuns(supabase: SupabaseClient): Promise<AgentDiagnosis[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: runs } = await supabase
    .from('runs')
    .select('id, agent_id, status, error, summary, stdout_excerpt, stderr_excerpt, result_json')
    .in('status', ['failed', 'timed_out', 'succeeded'])
    .gte('finished_at', cutoff)
    .order('finished_at', { ascending: false })
    .limit(100);

  if (!runs?.length) return [];

  // Get agent info
  const agentIds = [...new Set(runs.map((r) => r.agent_id))];
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, adapter_config, adapter_type')
    .in('id', agentIds);

  const agentMap = new Map((agents || []).map((a) => [a.id, a]));
  const diagnoses: AgentDiagnosis[] = [];
  const diagnosedAgents = new Set<string>(); // One diagnosis per agent per cycle

  for (const run of runs) {
    const agent = agentMap.get(run.agent_id);
    if (!agent || diagnosedAgents.has(agent.id)) continue;

    // Combine all text for pattern matching
    const allText = [
      run.error,
      run.summary,
      run.stdout_excerpt,
      run.stderr_excerpt,
      (run.result_json as any)?.terminal_reason,
      JSON.stringify((run.result_json as any)?.errors),
    ].filter(Boolean).join(' ');

    for (const pattern of KNOWN_FAILURE_PATTERNS) {
      if (pattern.pattern.test(allText)) {
        const autoFix = pattern.autoFix?.(agent) ?? undefined;
        diagnoses.push({
          agentId: agent.id,
          agentName: agent.name,
          issue: pattern.diagnosis,
          severity: pattern.severity,
          autoFix,
        });
        diagnosedAgents.add(agent.id);
        break; // One diagnosis per agent
      }
    }

    // Check for succeeded but no summary (agent didn't report results)
    if (run.status === 'succeeded' && !run.summary && !diagnosedAgents.has(agent.id)) {
      diagnoses.push({
        agentId: agent.id,
        agentName: agent.name,
        issue: 'Agent completed a run but produced no summary. Results may be lost. Check if HEARTBEAT enforces result posting.',
        severity: 'warning',
      });
      diagnosedAgents.add(agent.id);
    }
  }

  return diagnoses;
}

async function applyAutoFix(supabase: SupabaseClient, diagnosis: AgentDiagnosis) {
  if (!diagnosis.autoFix) return;

  const { field, oldValue, newValue } = diagnosis.autoFix;

  // Get current adapter_config
  const { data: agent } = await supabase
    .from('agents')
    .select('adapter_config')
    .eq('id', diagnosis.agentId)
    .single();

  if (!agent) return;

  const config = agent.adapter_config || {};
  config[field] = newValue;

  await supabase
    .from('agents')
    .update({ adapter_config: config, updated_at: new Date().toISOString() })
    .eq('id', diagnosis.agentId);

  logger.info(
    { agent: diagnosis.agentName, field, oldValue, newValue },
    'Agent Advisor auto-fixed agent config',
  );
}

async function updatePerformanceGrades(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get all agents
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name')
    .not('status', 'eq', 'terminated');

  if (!agents?.length) return;

  for (const agent of agents) {
    const { data: runs } = await supabase
      .from('runs')
      .select('status')
      .eq('agent_id', agent.id)
      .gte('finished_at', cutoff)
      .not('status', 'eq', 'cancelled');

    if (!runs?.length) continue;

    const total = runs.length;
    const succeeded = runs.filter((r) => r.status === 'succeeded').length;
    const rate = Math.round((succeeded / total) * 100);

    // Grade: A (90%+), B (70%+), C (50%+), D (<50%)
    const grade = rate >= 90 ? 'A' : rate >= 70 ? 'B' : rate >= 50 ? 'C' : 'D';

    // Store grade in adapter_config for dashboard visibility
    const { data: current } = await supabase
      .from('agents')
      .select('adapter_config')
      .eq('id', agent.id)
      .single();

    const config = current?.adapter_config || {};
    config.performanceGrade = grade;
    config.successRate = rate;
    config.totalRuns7d = total;

    await supabase
      .from('agents')
      .update({ adapter_config: config, updated_at: new Date().toISOString() })
      .eq('id', agent.id);
  }
}
