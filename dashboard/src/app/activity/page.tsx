import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

type Run = {
  id: string;
  agent_id: string;
  status: string;
  invocation_source: string;
  trigger_detail: string | null;
  summary: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  model: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type Agent = {
  id: string;
  name: string;
  role: string | null;
  icon: string | null;
};

const ACTION_TYPES = [
  { key: "all", label: "All types" },
  { key: "succeeded", label: "Succeeded" },
  { key: "failed", label: "Failed" },
  { key: "running", label: "Running" },
  { key: "queued", label: "Queued" },
  { key: "routine", label: "Routine" },
];

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getActionDescription(run: Run): string {
  const source = run.invocation_source;
  const status = run.status;

  if (status === "running") return "Run in progress";
  if (status === "queued") return "Run queued";
  if (status === "cancelled") return "Run cancelled";
  if (status === "timed_out") return "Run timed out";

  if (source === "routine") {
    if (status === "succeeded") return "Routine triggered — completed";
    if (status === "failed") return "Routine triggered — failed";
    return "Routine triggered";
  }

  if (status === "succeeded") {
    return run.summary
      ? `Run completed — ${run.summary.slice(0, 80)}${run.summary.length > 80 ? "…" : ""}`
      : "Run completed successfully";
  }
  if (status === "failed") {
    return "Run completed — failed";
  }

  return `Run ${status}`;
}

function getStatusDotColor(status: string): string {
  const map: Record<string, string> = {
    succeeded: "bg-[#3fb950]",
    failed: "bg-[#f85149]",
    running: "bg-[#58a6ff] animate-pulse",
    queued: "bg-[#d29922]",
    cancelled: "bg-[#8b949e]",
    timed_out: "bg-[#f85149]",
  };
  return map[status] ?? "bg-[#8b949e]";
}

function getStatusTextColor(status: string): string {
  const map: Record<string, string> = {
    succeeded: "text-[#3fb950]",
    failed: "text-[#f85149]",
    running: "text-[#58a6ff]",
    queued: "text-[#d29922]",
    cancelled: "text-[#8b949e]",
    timed_out: "text-[#f85149]",
  };
  return map[status] ?? "text-[#8b949e]";
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    routine: "Routine",
    on_demand: "On demand",
    timer: "Timer",
    assignment: "Assignment",
    mention: "Mention",
  };
  return map[source] ?? source;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

async function getActivity(filter: string, companyId: string) {
  const supabase = await createForgeClient();

  // Get agent IDs for this company
  const { data: companyAgents } = await supabase
    .from("agents")
    .select("id, name, role, icon")
    .eq("company_id", companyId);
  const agents = (companyAgents as Agent[]) || [];
  const agentIds = agents.map((a) => a.id);

  if (agentIds.length === 0) {
    return { runs: [] as Run[], agents };
  }

  let query = supabase
    .from("runs")
    .select("*")
    .in("agent_id", agentIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter === "routine") {
    query = query.eq("invocation_source", "routine");
  } else if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data: runs } = await query;

  return {
    runs: (runs as Run[]) || [],
    agents,
  };
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const activeFilter = params?.filter ?? "all";

  const company = await getActiveCompany();
  const { runs, agents } = await getActivity(activeFilter, company?.id ?? "");
  const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Activity
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            Chronological feed of agent runs and routine triggers.
          </p>
        </div>

        {/* Filter dropdown (rendered as pill tabs) */}
        <div className="flex gap-1 flex-wrap">
          {ACTION_TYPES.map((tab) => {
            const href =
              tab.key === "all" ? "/activity" : `/activity?filter=${tab.key}`;
            const isActive = activeFilter === tab.key;
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

      {/* Activity feed */}
      {runs.length === 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-12 text-center text-[#8b949e] text-sm">
          No activity in this filter.
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-4 bottom-4 w-px bg-[#30363d]" />

          <div className="space-y-0">
            {runs.map((run, i) => {
              const agent = agentById[run.agent_id];
              const description = getActionDescription(run);
              const dotColor = getStatusDotColor(run.status);
              const statusTextColor = getStatusTextColor(run.status);
              const timestamp = run.created_at;
              const isLast = i === runs.length - 1;

              return (
                <div
                  key={run.id}
                  className={`flex gap-4 py-3 px-0 ${
                    !isLast ? "border-b border-[#21262d]" : ""
                  }`}
                >
                  {/* Timeline dot */}
                  <div className="relative z-10 flex items-start pt-1 shrink-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full border-2 border-[#0d1117] ${dotColor}`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {/* Agent name + source */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            {agent?.icon && (
                              <span className="text-sm">{agent.icon}</span>
                            )}
                            {!agent?.icon && agent && (
                              <span className="w-5 h-5 rounded-full bg-[#1c2333] border border-[#30363d] flex items-center justify-center text-[10px] font-mono text-[#8b949e] shrink-0">
                                {initials(agent.name)}
                              </span>
                            )}
                            <span className="text-sm font-medium text-[#e6edf3]">
                              {agent?.name ?? "Unknown Agent"}
                            </span>
                          </div>
                          <span className="text-xs text-[#8b949e]">
                            {sourceLabel(run.invocation_source)}
                          </span>
                          <span
                            className={`text-xs font-medium ${statusTextColor}`}
                          >
                            {run.status}
                          </span>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-[#8b949e] mt-0.5 leading-snug">
                          {description}
                        </p>

                        {/* Token info if present */}
                        {(run.input_tokens > 0 || run.output_tokens > 0) && (
                          <p className="text-xs text-[#8b949e] mt-1 font-mono">
                            in {run.input_tokens.toLocaleString()} · out{" "}
                            {run.output_tokens.toLocaleString()}
                            {run.model && (
                              <span className="ml-2 text-[#8b949e]">
                                {run.model}
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-xs text-[#8b949e] shrink-0 mt-0.5">
                        {formatRelativeTime(timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
