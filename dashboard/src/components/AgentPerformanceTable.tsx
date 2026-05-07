// AgentPerformanceTable — relocated from home page (FORGE-363)
// Moved to /agents page. Don't redesign — preserve exact layout.

import { createForgeClient } from "@/lib/supabase/forge-server";

type PerfRow = {
  name: string;
  status: string;
  totalRuns: number;
  succeeded: number;
  failed: number;
  totalCost: number;
  avgCost: number;
  totalTokens: number;
};

async function getAgentPerformance(companyId: string): Promise<PerfRow[]> {
  const supabase = await createForgeClient();

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, status")
    .eq("company_id", companyId);

  if (!agents?.length) return [];

  const agentIds = agents.map((a) => a.id);

  const { data: runs } = await supabase
    .from("runs")
    .select("agent_id, status, cost_usd, input_tokens, output_tokens, started_at, finished_at")
    .in("agent_id", agentIds)
    .not("status", "eq", "cancelled")
    .order("created_at", { ascending: false })
    .limit(500);

  const statsMap: Record<string, PerfRow> = {};

  for (const agent of agents) {
    const agentRuns = (runs ?? []).filter((r) => r.agent_id === agent.id);
    const succeeded = agentRuns.filter((r) => r.status === "succeeded").length;
    const failed = agentRuns.filter((r) => r.status === "failed" || r.status === "timed_out").length;
    const totalCost = agentRuns.reduce((sum, r) => sum + (parseFloat(r.cost_usd) || 0), 0);
    const totalTokens = agentRuns.reduce((sum, r) => sum + (r.input_tokens || 0) + (r.output_tokens || 0), 0);

    statsMap[agent.id] = {
      name: agent.name,
      status: agent.status,
      totalRuns: agentRuns.length,
      succeeded,
      failed,
      totalCost,
      avgCost: agentRuns.length > 0 ? totalCost / agentRuns.length : 0,
      totalTokens,
    };
  }

  return Object.values(statsMap).sort((a, b) => b.totalRuns - a.totalRuns);
}

export default async function AgentPerformanceTable({ companyId }: { companyId: string }) {
  const agentPerf = await getAgentPerformance(companyId);

  if (agentPerf.length === 0) return null;

  return (
    <div>
      <h2
        className="text-sm font-semibold uppercase tracking-wider mb-3"
        style={{ color: "#8b949e" }}
      >
        Agent Performance
      </h2>
      <div
        className="rounded-lg border overflow-hidden"
        style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #30363d" }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: "#8b949e" }}>Agent</th>
              <th className="text-center px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Status</th>
              <th className="text-center px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Runs</th>
              <th className="text-center px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Success</th>
              <th className="text-center px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Failed</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Total Cost</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Avg/Run</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: "#8b949e" }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {agentPerf.map((a) => {
              const rate = a.totalRuns > 0 ? Math.round((a.succeeded / a.totalRuns) * 100) : 0;
              const rateColor = rate >= 80 ? "#3fb950" : rate >= 50 ? "#d29922" : rate > 0 ? "#f85149" : "#8b949e";
              const statusColor = a.status === "running" ? "#3fb950" : a.status === "error" ? "#f85149" : "#8b949e";
              return (
                <tr key={a.name} style={{ borderBottom: "1px solid #21262d" }}>
                  <td className="px-4 py-2 font-medium" style={{ color: "#e6edf3" }}>{a.name}</td>
                  <td className="text-center px-3 py-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ color: statusColor, backgroundColor: `${statusColor}20` }}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="text-center px-3 py-2 tabular-nums" style={{ color: "#e6edf3" }}>{a.totalRuns}</td>
                  <td className="text-center px-3 py-2 tabular-nums" style={{ color: "#3fb950" }}>{a.succeeded}</td>
                  <td className="text-center px-3 py-2 tabular-nums" style={{ color: a.failed > 0 ? "#f85149" : "#8b949e" }}>{a.failed}</td>
                  <td className="text-right px-3 py-2 tabular-nums" style={{ color: "#e6edf3" }}>${a.totalCost.toFixed(2)}</td>
                  <td className="text-right px-3 py-2 tabular-nums" style={{ color: "#8b949e" }}>${a.avgCost.toFixed(2)}</td>
                  <td className="text-right px-4 py-2 tabular-nums font-medium" style={{ color: rateColor }}>
                    {a.totalRuns > 0 ? `${rate}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
