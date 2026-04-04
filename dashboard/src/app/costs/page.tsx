import { createForgeClient } from "@/lib/supabase/forge-server";

export const revalidate = 60;

type CostEvent = {
  id: string;
  agent_id: string;
  run_id: string | null;
  provider: string;
  model: string;
  billing_type: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  occurred_at: string;
  created_at: string;
};

type Agent = {
  id: string;
  name: string;
  role: string | null;
  icon: string | null;
};

type AggregatedAgent = {
  agent: Agent;
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  apiRuns: number;
  subscriptionRuns: number;
  events: CostEvent[];
};

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const DATE_RANGE_TABS = [
  { key: "mtd", label: "Month to Date" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "all", label: "All Time" },
];

function getRangeStart(range: string): Date | null {
  const now = new Date();
  if (range === "mtd") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  return null; // all time
}

async function getCostData(range: string) {
  const supabase = await createForgeClient();

  const rangeStart = getRangeStart(range);

  let query = supabase
    .from("cost_events")
    .select("*")
    .order("occurred_at", { ascending: false });

  if (rangeStart) {
    query = query.gte("occurred_at", rangeStart.toISOString());
  }

  const { data: events } = await query.limit(500);
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, role, icon");

  return {
    events: (events as CostEvent[]) || [],
    agents: (agents as Agent[]) || [],
  };
}

export default async function CostsPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const activeRange = params?.range ?? "mtd";

  const { events, agents } = await getCostData(activeRange);

  const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));

  // Summary stats
  const totalCostCents = events.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  const apiEvents = events.filter((e) => e.billing_type === "api");
  const subEvents = events.filter((e) => e.billing_type === "subscription");
  const apiCostCents = apiEvents.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  const subCostCents = subEvents.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  const totalRuns = new Set(events.map((e) => e.run_id).filter(Boolean)).size;

  // Aggregate by agent
  const byAgent = new Map<string, AggregatedAgent>();
  for (const event of events) {
    if (!byAgent.has(event.agent_id)) {
      byAgent.set(event.agent_id, {
        agent: agentById[event.agent_id] ?? {
          id: event.agent_id,
          name: "Unknown Agent",
          role: null,
          icon: null,
        },
        totalCostCents: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        apiRuns: 0,
        subscriptionRuns: 0,
        events: [],
      });
    }
    const agg = byAgent.get(event.agent_id)!;
    agg.totalCostCents += event.cost_cents ?? 0;
    agg.totalInputTokens += event.input_tokens ?? 0;
    agg.totalOutputTokens += event.output_tokens ?? 0;
    if (event.billing_type === "api") agg.apiRuns++;
    else agg.subscriptionRuns++;
    agg.events.push(event);
  }

  const agentRows = Array.from(byAgent.values()).sort(
    (a, b) => b.totalInputTokens - a.totalInputTokens
  );

  const SUMMARY_CARDS = [
    {
      label: "Total Spend",
      value: formatCost(totalCostCents),
      sub: `${events.length} cost events`,
    },
    {
      label: "API Spend",
      value: formatCost(apiCostCents),
      sub: `${apiEvents.length} api events`,
    },
    {
      label: "Subscription Spend",
      value: formatCost(subCostCents),
      sub: `${subEvents.length} subscription events`,
    },
    {
      label: "Total Runs",
      value: totalRuns.toString(),
      sub: "unique run IDs",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Costs
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            Inference spend, platform fees, credits, and live quota windows.
          </p>
        </div>

        {/* Date range tabs */}
        <div className="flex gap-1 flex-wrap">
          {DATE_RANGE_TABS.map((tab) => {
            const isActive = activeRange === tab.key;
            const href =
              tab.key === "mtd" ? "/costs" : `/costs?range=${tab.key}`;
            return (
              <a
                key={tab.key}
                href={href}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isActive
                    ? "bg-[#1c2333] text-[#e6edf3] border border-[#30363d]"
                    : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]"
                }`}
              >
                {tab.label}
              </a>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {SUMMARY_CARDS.map((card) => (
          <div
            key={card.label}
            className="bg-[#161b22] border border-[#30363d] rounded-lg p-4"
          >
            <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">
              {card.label}
            </p>
            <p className="text-2xl font-mono font-semibold text-[#e6edf3]">
              {card.value}
            </p>
            <p className="text-xs text-[#8b949e] mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* By agent section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-medium text-[#e6edf3]">By agent</h2>
            <p className="text-xs text-[#8b949e]">
              What each agent consumed in the selected period.
            </p>
          </div>
        </div>

        {agentRows.length === 0 ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center text-[#8b949e] text-sm">
            No cost events in this period.
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
            {agentRows.map((row, i) => (
              <div
                key={row.agent.id}
                className={`flex items-center justify-between px-4 py-3 hover:bg-[#1c2333] transition-colors ${
                  i < agentRows.length - 1 ? "border-b border-[#21262d]" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-[#0d1117] border border-[#30363d] flex items-center justify-center shrink-0">
                    {row.agent.icon ? (
                      <span className="text-sm">{row.agent.icon}</span>
                    ) : (
                      <span className="text-xs font-mono text-[#8b949e]">
                        {initials(row.agent.name)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#e6edf3] truncate">
                      {row.agent.name}
                    </p>
                    {row.agent.role && (
                      <p className="text-xs text-[#8b949e]">{row.agent.role}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-mono font-medium text-[#e6edf3]">
                    {formatCost(row.totalCostCents)}
                  </p>
                  <p className="text-xs text-[#8b949e]">
                    in {formatTokens(row.totalInputTokens)} · out{" "}
                    {formatTokens(row.totalOutputTokens)}
                  </p>
                  <p className="text-xs text-[#8b949e]">
                    {row.apiRuns} api · {row.subscriptionRuns} subscription
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inference ledger table */}
      <div>
        <div className="mb-3">
          <h2 className="text-sm font-medium text-[#e6edf3]">
            Inference ledger
          </h2>
          <p className="text-xs text-[#8b949e]">
            Request-scoped inference spend for the selected period.
          </p>
        </div>

        {events.length === 0 ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center text-[#8b949e] text-sm">
            No cost events in this period.
          </div>
        ) : (
          <div className="border border-[#30363d] rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_140px_80px_80px_80px_90px_130px] gap-x-3 px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] text-xs font-medium text-[#8b949e] uppercase tracking-wide">
              <div>Agent</div>
              <div>Model</div>
              <div className="text-right">Input</div>
              <div className="text-right">Output</div>
              <div className="text-right">Cost</div>
              <div>Type</div>
              <div>Date</div>
            </div>

            <div className="divide-y divide-[#21262d]">
              {events.map((event) => {
                const agent = agentById[event.agent_id];
                return (
                  <div
                    key={event.id}
                    className="grid grid-cols-[1fr_140px_80px_80px_80px_90px_130px] gap-x-3 px-4 py-2.5 bg-[#161b22] hover:bg-[#1c2333] transition-colors items-center"
                  >
                    {/* Agent */}
                    <div className="min-w-0">
                      <p className="text-sm text-[#e6edf3] truncate">
                        {agent?.name ?? "Unknown"}
                      </p>
                      {agent?.role && (
                        <p className="text-xs text-[#8b949e] truncate">
                          {agent.role}
                        </p>
                      )}
                    </div>

                    {/* Model */}
                    <div>
                      <span className="text-xs font-mono text-[#8b949e] truncate block">
                        {event.model || "--"}
                      </span>
                    </div>

                    {/* Input tokens */}
                    <div className="text-right">
                      <span className="text-xs font-mono text-[#e6edf3]">
                        {formatTokens(event.input_tokens)}
                      </span>
                    </div>

                    {/* Output tokens */}
                    <div className="text-right">
                      <span className="text-xs font-mono text-[#e6edf3]">
                        {formatTokens(event.output_tokens)}
                      </span>
                    </div>

                    {/* Cost */}
                    <div className="text-right">
                      <span className="text-xs font-mono text-[#00d4aa]">
                        {formatCost(event.cost_cents ?? 0)}
                      </span>
                    </div>

                    {/* Billing type */}
                    <div>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          event.billing_type === "api"
                            ? "bg-[#0d1117] border border-[#58a6ff]/40 text-[#58a6ff]"
                            : "bg-[#0d1117] border border-[#30363d] text-[#8b949e]"
                        }`}
                      >
                        {event.billing_type || "sub"}
                      </span>
                    </div>

                    {/* Date */}
                    <div>
                      <span className="text-xs text-[#8b949e]">
                        {formatDate(event.occurred_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
