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
  if (ms == null) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cents: number | null): string {
  if (cents == null) return "\u2014";
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
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-medium text-[#202124]">Skill Metrics</h1>
        <p className="text-[#5f6368] mt-1 text-sm md:text-base">Agent skill execution performance and cost tracking</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <SummaryCard
          label="Total Executions"
          value={totalExecutions.toLocaleString()}
          color="#1a73e8"
        />
        <SummaryCard
          label="Success Rate"
          value={`${successRate}%`}
          color={Number(successRate) >= 80 ? "#34a853" : "#fbbc04"}
        />
        <SummaryCard
          label="Avg Execution Time"
          value={formatMs(avgExecutionMs)}
          color="#a142f4"
        />
        <SummaryCard
          label="Total Cost"
          value={`$${(totalCostCents / 100).toFixed(2)}`}
          color="#fa7b17"
        />
      </div>

      {/* Recent Executions */}
      <div>
        <h2 className="text-lg font-medium mb-4 text-[#202124]">Recent Executions</h2>
        {rows.length === 0 ? (
          <div className="text-[#5f6368] text-sm p-12 border border-[#dadce0] bg-white rounded-xl text-center">
            No metrics recorded yet
          </div>
        ) : (
          <>
            {/* Mobile: Card layout */}
            <div className="md:hidden space-y-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="bg-white border border-[#dadce0] rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium text-[#202124] text-sm">{row.skill_name}</p>
                      {row.company_registry?.name && (
                        <p className="text-xs text-[#5f6368]">{row.company_registry.name}</p>
                      )}
                    </div>
                    {row.success ? (
                      <span className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 text-xs rounded shrink-0">
                        success
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded shrink-0">
                        failed
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-[#5f6368]">Time</p>
                      <p className="text-[#202124]">{formatMs(row.execution_time_ms)}</p>
                    </div>
                    <div>
                      <p className="text-[#5f6368]">Tokens</p>
                      <p className="text-[#202124]">{row.token_count != null ? row.token_count.toLocaleString() : "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-[#5f6368]">Cost</p>
                      <p className="text-[#202124]">{formatCost(row.estimated_cost_cents)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-[#5f6368]">
                    <span className="font-mono">{row.model_used ?? "\u2014"}</span>
                    <span>&middot;</span>
                    <span>{formatDate(row.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden md:block border border-[#dadce0] bg-white rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#dadce0] bg-[#f8f9fa]">
                    <th className="text-left px-4 py-3 text-[#5f6368] font-medium">Skill</th>
                    <th className="text-left px-4 py-3 text-[#5f6368] font-medium">Model</th>
                    <th className="text-right px-4 py-3 text-[#5f6368] font-medium">Time</th>
                    <th className="text-right px-4 py-3 text-[#5f6368] font-medium">Tokens</th>
                    <th className="text-right px-4 py-3 text-[#5f6368] font-medium">Cost</th>
                    <th className="text-center px-4 py-3 text-[#5f6368] font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-[#5f6368] font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-[#dadce0] ${
                        i % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"
                      } hover:bg-[#f1f3f4] transition-colors`}
                    >
                      <td className="px-4 py-3 font-medium text-[#202124]">
                        {row.skill_name}
                        {row.company_registry?.name && (
                          <span className="ml-2 text-xs text-[#5f6368]">
                            {row.company_registry.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#5f6368] font-mono text-xs">
                        {row.model_used ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right text-[#202124]">
                        {formatMs(row.execution_time_ms)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#202124]">
                        {row.token_count != null ? row.token_count.toLocaleString() : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right text-[#202124]">
                        {formatCost(row.estimated_cost_cents)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.success ? (
                          <span className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 text-xs rounded">
                            success
                          </span>
                        ) : (
                          <span
                            className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded"
                            title={row.error_message ?? undefined}
                          >
                            failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[#5f6368] text-xs whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
  return (
    <div className="rounded-xl border border-[#dadce0] bg-white p-4 md:p-6">
      <p className="text-2xl md:text-3xl font-semibold" style={{ color }}>{value}</p>
      <p className="text-xs md:text-sm text-[#5f6368] mt-1">{label}</p>
    </div>
  );
}
