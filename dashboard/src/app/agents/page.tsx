import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const revalidate = 30;

async function getAgents() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forge_agents")
    .select("*")
    .order("status", { ascending: true })
    .order("name", { ascending: true });
  return data || [];
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

function formatCents(cents: number | null): string {
  if (cents == null) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AgentsPage() {
  const agents = await getAgents();
  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <h1 className="text-2xl md:text-3xl font-medium text-[#202124]">Agent Roster</h1>
          <span className="px-3 py-1 bg-green-50 border border-green-200 text-green-700 text-sm rounded-full">
            {activeCount} / {agents.length} active
          </span>
        </div>
        <p className="text-[#5f6368] mt-1">All registered AI agents and their current status</p>
      </div>

      {agents.length === 0 ? (
        <div className="text-[#5f6368] text-sm p-12 border border-[#dadce0] bg-white rounded-xl text-center">
          No agents registered
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: Record<string, unknown> }) {
  const status = agent.status as string;
  const lastHeartbeat = agent.last_heartbeat_at as string | null;
  const tasksCompleted = (agent.tasks_completed as number) || 0;
  const tasksFailed = (agent.tasks_failed as number) || 0;
  const total = tasksCompleted + tasksFailed;
  const successRate = total > 0 ? ((tasksCompleted / total) * 100).toFixed(1) : null;
  const currentOrderId = agent.current_order_id as string | null;

  const spent = (agent.spent_monthly_cents as number) || 0;
  const budget = (agent.budget_monthly_cents as number) || 0;
  const budgetPct = budget > 0 ? (spent / budget) * 100 : 0;
  const budgetColor =
    budgetPct > 100 ? "bg-[#ea4335]" : budgetPct >= 80 ? "bg-amber-400" : "bg-[#34a853]";

  const statusConfig: Record<string, { dot: string; label: string; border: string }> = {
    active: {
      dot: "bg-[#34a853]",
      label: "Active",
      border: "border-green-200",
    },
    paused: {
      dot: "bg-amber-400",
      label: "Paused",
      border: "border-amber-200",
    },
    budget_exceeded: {
      dot: "bg-[#ea4335]",
      label: "Over Budget",
      border: "border-red-200",
    },
    terminated: {
      dot: "bg-[#ea4335]",
      label: "Terminated",
      border: "border-red-200",
    },
  };

  const statusStyle = statusConfig[status] ?? {
    dot: "bg-[#5f6368]",
    label: status,
    border: "border-[#dadce0]",
  };

  return (
    <Link href={`/agents/${agent.id}`}>
      <div
        className={`bg-white border rounded-xl p-5 flex flex-col gap-4 ${statusStyle.border} hover:shadow-md hover:border-[#1a73e8] transition-all cursor-pointer`}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-base font-medium leading-tight text-[#202124]">{agent.name as string}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-block px-2 py-0.5 bg-[#e8f0fe] border border-[#d3e3fd] text-[#1a73e8] text-xs rounded">
                {agent.role as string}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusStyle.dot} animate-pulse`} />
            <span className="text-xs text-[#5f6368]">{statusStyle.label}</span>
          </div>
        </div>

        {/* Meta */}
        <div className="space-y-1.5 text-xs text-[#5f6368]">
          {agent.title ? (
            <div className="flex justify-between">
              <span className="text-[#5f6368]">Title</span>
              <span className="text-[#202124]">{agent.title as string}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-[#5f6368]">Model</span>
            <span className="font-mono text-[#202124]">{(agent.model as string) || "--"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#5f6368]">Last heartbeat</span>
            <span className="text-[#202124]">{formatRelativeTime(lastHeartbeat)}</span>
          </div>
        </div>

        {/* Budget bar */}
        {budget > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#5f6368]">Budget</span>
              <span className="text-[#202124]">
                {formatCents(spent)} / {formatCents(budget)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#f1f3f4] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${budgetColor}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#dadce0]">
          <div className="text-center">
            <p className="text-lg font-semibold text-[#202124]">{tasksCompleted}</p>
            <p className="text-xs text-[#5f6368]">Tasks done</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-[#202124]">
              {successRate != null ? `${successRate}%` : "\u2014"}
            </p>
            <p className="text-xs text-[#5f6368]">Success rate</p>
          </div>
        </div>

        {/* Working indicator */}
        {currentOrderId && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#e8f0fe] border border-[#d3e3fd] rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8] animate-pulse" />
            <span className="text-xs text-[#1a73e8]">Working on task...</span>
          </div>
        )}
      </div>
    </Link>
  );
}
