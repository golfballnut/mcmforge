import { createClient } from "@/lib/supabase/server";

export const revalidate = 30;

async function getMetrics() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("skill_metrics")
    .select("*, company_registry(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  return data || [];
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(4)}`;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MetricsPage() {
  const rows = await getMetrics();

  const totalExecutions = rows.length;
  const successCount = rows.filter((r) => r.success).length;
  const successRate =
    totalExecutions > 0 ? ((successCount / totalExecutions) * 100).toFixed(1) : "0.0";
  const avgExecutionMs =
    totalExecutions > 0
      ? Math.round(
          rows.reduce((sum, r) => sum + (r.execution_time_ms ?? 0), 0) / totalExecutions
        )
      : 0;
  const totalCostCents = rows.reduce((sum, r) => sum + (Number(r.estimated_cost_cents) || 0), 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Skill Metrics</h1>
        <p className="text-gray-500 mt-1">Agent skill execution performance and cost tracking</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="Total Executions"
          value={totalExecutions.toLocaleString()}
          color="blue"
        />
        <SummaryCard
          label="Success Rate"
          value={`${successRate}%`}
          color={Number(successRate) >= 80 ? "green" : "amber"}
        />
        <SummaryCard
          label="Avg Execution Time"
          value={formatMs(avgExecutionMs)}
          color="purple"
        />
        <SummaryCard
          label="Total Cost"
          value={`$${(totalCostCents / 100).toFixed(2)}`}
          color="amber"
        />
      </div>

      {/* Recent Executions Table */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Executions</h2>
        {rows.length === 0 ? (
          <div className="text-gray-600 text-sm p-12 border border-gray-800 rounded-xl text-center">
            No metrics recorded yet
          </div>
        ) : (
          <div className="border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/80">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Skill</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Model</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Time</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Tokens</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Cost</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-800/50 ${
                      i % 2 === 0 ? "bg-gray-900/30" : "bg-gray-900/10"
                    } hover:bg-gray-900/60 transition-colors`}
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {row.skill_name}
                      {row.company_registry?.name && (
                        <span className="ml-2 text-xs text-gray-600">
                          {row.company_registry.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      {row.model_used ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {formatMs(row.execution_time_ms)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {row.token_count != null ? row.token_count.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {formatCost(row.estimated_cost_cents)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.success ? (
                        <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-xs rounded">
                          success
                        </span>
                      ) : (
                        <span
                          className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded"
                          title={row.error_message ?? undefined}
                        >
                          failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    green: "bg-green-500/10 border-green-500/20 text-green-400",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  };

  return (
    <div className={`rounded-xl border p-6 ${colors[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm opacity-70 mt-1">{label}</p>
    </div>
  );
}
