import { createClient } from "@/lib/supabase/server";

export const revalidate = 30;

function formatCents(cents: number | null): string {
  if (cents == null) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

async function getAgentCount() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("forge_agents")
    .select("*", { count: "exact", head: true });
  return count || 0;
}

async function getActiveMissions() {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("missions")
    .select("*", { count: "exact" })
    .in("status", ["active", "in_progress"]);
  return { missions: data || [], count: count || 0 };
}

async function getMonthlySpend() {
  const supabase = await createClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data } = await supabase
    .from("agent_heartbeats")
    .select("cost_cents")
    .gte("started_at", startOfMonth);

  const total = (data || []).reduce(
    (sum, row) => sum + ((row.cost_cents as number) || 0),
    0
  );
  return total;
}

async function getSuccessRate() {
  const supabase = await createClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data } = await supabase
    .from("agent_heartbeats")
    .select("status")
    .gte("started_at", startOfMonth);

  const rows = data || [];
  if (rows.length === 0) return null;
  const successes = rows.filter((r) => r.status === "success").length;
  return ((successes / rows.length) * 100).toFixed(1);
}

interface CostRow {
  agent_id: string;
  agent_name: string;
  total_cost: number;
  total_tokens: number;
  task_count: number;
}

async function getCostByAgent(): Promise<CostRow[]> {
  const supabase = await createClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: heartbeats } = await supabase
    .from("agent_heartbeats")
    .select("agent_id, cost_cents, tokens_input, tokens_output")
    .gte("started_at", startOfMonth);

  const { data: agents } = await supabase
    .from("forge_agents")
    .select("id, name");

  const agentMap = new Map((agents || []).map((a) => [a.id, a.name as string]));
  const costMap = new Map<string, CostRow>();

  for (const hb of heartbeats || []) {
    const agentId = hb.agent_id as string;
    if (!costMap.has(agentId)) {
      costMap.set(agentId, {
        agent_id: agentId,
        agent_name: agentMap.get(agentId) || agentId,
        total_cost: 0,
        total_tokens: 0,
        task_count: 0,
      });
    }
    const row = costMap.get(agentId)!;
    row.total_cost += (hb.cost_cents as number) || 0;
    row.total_tokens +=
      ((hb.tokens_input as number) || 0) + ((hb.tokens_output as number) || 0);
    row.task_count += 1;
  }

  return Array.from(costMap.values()).sort((a, b) => b.total_cost - a.total_cost);
}

export default async function VitalsPage() {
  const [agentCount, { missions, count: missionCount }, monthlySpend, successRate, costByAgent] =
    await Promise.all([
      getAgentCount(),
      getActiveMissions(),
      getMonthlySpend(),
      getSuccessRate(),
      getCostByAgent(),
    ]);

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-medium text-[#202124]">Vitals</h1>
        <p className="text-[#5f6368] mt-1">System health and cost overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="Total Agents" value={String(agentCount)} />
        <KPICard label="Active Missions" value={String(missionCount)} />
        <KPICard label="Spend This Month" value={formatCents(monthlySpend)} />
        <KPICard
          label="Success Rate"
          value={successRate != null ? `${successRate}%` : "--"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Cost by Agent */}
        <div className="bg-white border border-[#dadce0] rounded-xl p-5">
          <h2 className="text-base font-medium text-[#202124] mb-4">Cost by Agent</h2>
          {costByAgent.length === 0 ? (
            <p className="text-sm text-[#5f6368]">No activity this month</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#5f6368] border-b border-[#dadce0]">
                    <th className="pb-2 pr-3 font-medium">Agent</th>
                    <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                    <th className="pb-2 pr-3 font-medium text-right">Tokens</th>
                    <th className="pb-2 font-medium text-right">Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {costByAgent.map((row) => (
                    <tr
                      key={row.agent_id}
                      className="border-b border-[#f1f3f4] last:border-0"
                    >
                      <td className="py-2 pr-3 text-[#202124]">{row.agent_name}</td>
                      <td className="py-2 pr-3 text-right font-mono text-xs">
                        {formatCents(row.total_cost)}
                      </td>
                      <td className="py-2 pr-3 text-right text-xs text-[#5f6368]">
                        {row.total_tokens.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-xs text-[#5f6368]">
                        {row.task_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Missions */}
        <div className="bg-white border border-[#dadce0] rounded-xl p-5">
          <h2 className="text-base font-medium text-[#202124] mb-4">Active Missions</h2>
          {missions.length === 0 ? (
            <p className="text-sm text-[#5f6368]">No active missions</p>
          ) : (
            <div className="space-y-4">
              {missions.map((mission) => {
                const progress = (mission.progress_pct as number) || 0;
                const dueDate = mission.due_date as string | null;
                return (
                  <div key={mission.id} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#202124] truncate">
                          {mission.title as string}
                        </p>
                        {mission.description && (
                          <p className="text-xs text-[#5f6368] truncate">
                            {mission.description as string}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-[#5f6368] shrink-0">
                        {progress}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[#f1f3f4] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#1a73e8] transition-all"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#5f6368]">
                      {mission.quarter && <span>Q{mission.quarter as string}</span>}
                      {dueDate && (
                        <span>
                          Due {new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#dadce0] rounded-xl p-5">
      <p className="text-xs text-[#5f6368] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-[#202124]">{value}</p>
    </div>
  );
}
