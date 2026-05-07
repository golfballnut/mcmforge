import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import AgentPerformanceTable from "@/components/AgentPerformanceTable";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

type Agent = {
  id: string;
  company_id: string | null;
  name: string;
  role: string | null;
  title: string | null;
  icon: string | null;
  status: "idle" | "running" | "paused" | "error" | "terminated" | string;
  adapter_type: string | null;
  adapter_config: Record<string, unknown> | null;
  last_heartbeat_at: string | null;
  reports_to: string | null;
  skills: string[] | null;
  created_at: string;
};

async function getAgents(companyId: string): Promise<Agent[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  return (data as Agent[]) || [];
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  idle:       { dot: "bg-[#3fb950]", label: "Idle" },
  running:    { dot: "bg-[#58a6ff]", label: "Running" },
  paused:     { dot: "bg-[#d29922]", label: "Paused" },
  error:      { dot: "bg-[#f85149]", label: "Error" },
  terminated: { dot: "bg-[#8b949e]", label: "Terminated" },
};

const FILTER_TABS = [
  { key: "all",        label: "All" },
  { key: "active",     label: "Active" },
  { key: "paused",     label: "Paused" },
  { key: "error",      label: "Error" },
];

function adapterLabel(adapterType: string | null): string {
  if (!adapterType) return "--";
  const map: Record<string, string> = {
    claude_local: "Claude",
    claude:       "Claude",
    gemini:       "Gemini",
    codex:        "Codex",
    openai:       "OpenAI",
  };
  return map[adapterType.toLowerCase()] ?? adapterType;
}

function adapterColor(adapterType: string | null): string {
  if (!adapterType) return "text-[#8b949e]";
  const t = adapterType.toLowerCase();
  if (t.includes("claude")) return "text-[#d4a27f]";
  if (t.includes("gemini")) return "text-[#58a6ff]";
  if (t.includes("codex") || t.includes("openai")) return "text-[#3fb950]";
  return "text-[#8b949e]";
}

function modelFromConfig(config: Record<string, unknown> | null): string {
  if (!config) return "--";
  const model = config.model as string | undefined;
  if (!model) return "--";
  // Shorten model names for table display
  return model.replace("claude-", "").replace("sonnet", "sonnet").replace("opus", "opus");
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const activeFilter = params?.filter ?? "all";

  const company = await getActiveCompany();
  const agents = await getAgents(company?.id ?? "");

  // Derive "active" as idle+running for the Active tab
  const filtered = agents.filter((a) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "active") return a.status === "idle" || a.status === "running";
    if (activeFilter === "paused") return a.status === "paused";
    if (activeFilter === "error") return a.status === "error";
    return true;
  });

  const counts = {
    all:        agents.length,
    active:     agents.filter((a) => a.status === "idle" || a.status === "running").length,
    paused:     agents.filter((a) => a.status === "paused").length,
    error:      agents.filter((a) => a.status === "error").length,
  };

  // Build a lookup for reports_to name resolution
  const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Agents
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-[#161b22] border border-[#30363d] text-[#8b949e]">
            {agents.length}
          </span>
        </div>
        <Link
          href="/agents/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#00d4aa] text-[#0d1117] text-sm font-medium hover:bg-[#00bfaa] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Agent
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#30363d]">
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.key === "all" ? "/agents" : `/agents?filter=${tab.key}`}
              className={`px-3 py-2 text-sm rounded-t-md transition-colors ${
                isActive
                  ? "bg-[#1c2333] text-[#e6edf3] border border-b-0 border-[#30363d]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs font-mono ${isActive ? "text-[#8b949e]" : "text-[#8b949e]"}`}>
                {counts[tab.key as keyof typeof counts]}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-[#8b949e] text-sm p-12 border border-[#30363d] bg-[#161b22] rounded-lg text-center">
          No agents match this filter
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[20px_1fr_120px_90px_160px_110px_60px] gap-x-4 px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] text-xs font-medium text-[#8b949e] uppercase tracking-wide">
            <div />
            <div>Name</div>
            <div>Role</div>
            <div>Adapter</div>
            <div>Model</div>
            <div>Heartbeat</div>
            <div className="text-right">Skills</div>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-[#30363d]">
            {filtered.map((agent) => {
              const statusCfg = STATUS_CONFIG[agent.status] ?? {
                dot: "bg-[#8b949e]",
                label: agent.status,
              };
              const model = modelFromConfig(agent.adapter_config);
              const skillCount = agent.skills?.length ?? 0;
              const reportsTo = agent.reports_to ? agentById[agent.reports_to]?.name : null;

              return (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="grid grid-cols-[20px_1fr_120px_90px_160px_110px_60px] gap-x-4 px-4 py-3 bg-[#161b22] hover:bg-[#1c2333] transition-colors items-center cursor-pointer"
                >
                  {/* Status dot */}
                  <div className="flex items-center">
                    <span
                      className={`w-2 h-2 rounded-full ${statusCfg.dot} ${
                        agent.status === "running" ? "animate-pulse" : ""
                      }`}
                      title={statusCfg.label}
                    />
                  </div>

                  {/* Name + title */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {agent.icon && (
                        <span className="text-base leading-none">{agent.icon}</span>
                      )}
                      <span className="text-sm font-medium text-[#e6edf3] truncate">
                        {agent.name}
                      </span>
                    </div>
                    {agent.title && (
                      <p className="text-xs text-[#8b949e] mt-0.5 truncate">{agent.title}</p>
                    )}
                    {reportsTo && (
                      <p className="text-xs text-[#8b949e] mt-0.5 truncate">
                        ↳ {reportsTo}
                      </p>
                    )}
                  </div>

                  {/* Role badge */}
                  <div>
                    {agent.role ? (
                      <span className="inline-block px-2 py-0.5 text-xs rounded bg-[#0d1117] border border-[#30363d] text-[#8b949e] truncate max-w-full">
                        {agent.role}
                      </span>
                    ) : (
                      <span className="text-[#8b949e] text-xs">--</span>
                    )}
                  </div>

                  {/* Adapter type */}
                  <div>
                    <span className={`text-xs font-mono ${adapterColor(agent.adapter_type)}`}>
                      {adapterLabel(agent.adapter_type)}
                    </span>
                  </div>

                  {/* Model */}
                  <div>
                    <span className="text-xs font-mono text-[#8b949e] truncate">
                      {model}
                    </span>
                  </div>

                  {/* Last heartbeat */}
                  <div>
                    <span className="text-xs text-[#8b949e]">
                      {formatRelativeTime(agent.last_heartbeat_at)}
                    </span>
                  </div>

                  {/* Skills count */}
                  <div className="text-right">
                    {skillCount > 0 ? (
                      <span className="text-xs font-mono text-[#00d4aa]">{skillCount}</span>
                    ) : (
                      <span className="text-xs text-[#8b949e]">—</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent Performance — relocated from home page (FORGE-363) */}
      <div className="mt-8">
        <AgentPerformanceTable companyId={company?.id ?? ""} />
      </div>
    </div>
  );
}
