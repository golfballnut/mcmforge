import { createClient } from "@/lib/supabase/server";

export const revalidate = 30;

async function getAgents() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_roster")
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
  const lastHeartbeat = agent.last_heartbeat as string | null;
  const successRate = agent.success_rate as number | null;
  const tasksCompleted = agent.tasks_completed as number;
  const currentTaskId = agent.current_task_id as string | null;

  const statusConfig: Record<string, { dot: string; label: string; border: string }> = {
    active: {
      dot: "bg-[#34a853]",
      label: "Active",
      border: "border-green-200",
    },
    idle: {
      dot: "bg-amber-400",
      label: "Idle",
      border: "border-amber-200",
    },
    offline: {
      dot: "bg-[#ea4335]",
      label: "Offline",
      border: "border-red-200",
    },
  };

  const statusStyle = statusConfig[status] ?? statusConfig.offline;

  return (
    <div
      className={`bg-white border rounded-xl p-5 flex flex-col gap-4 ${statusStyle.border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-medium leading-tight text-[#202124]">{agent.name as string}</p>
          <span className="inline-block mt-1 px-2 py-0.5 bg-[#e8f0fe] border border-[#d3e3fd] text-[#1a73e8] text-xs rounded">
            {agent.agent_type as string}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusStyle.dot} animate-pulse`} />
          <span className="text-xs text-[#5f6368]">{statusStyle.label}</span>
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-1.5 text-xs text-[#5f6368]">
        <div className="flex justify-between">
          <span className="text-[#5f6368]">CLI</span>
          <span className="font-mono text-[#202124]">{agent.cli_target as string}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#5f6368]">Machine</span>
          <span className="text-[#202124]">{agent.machine as string}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#5f6368]">Last heartbeat</span>
          <span className="text-[#202124]">{formatRelativeTime(lastHeartbeat)}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#dadce0]">
        <div className="text-center">
          <p className="text-lg font-semibold text-[#202124]">{tasksCompleted ?? 0}</p>
          <p className="text-xs text-[#5f6368]">Tasks done</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-[#202124]">
            {successRate != null ? `${Number(successRate).toFixed(1)}%` : "\u2014"}
          </p>
          <p className="text-xs text-[#5f6368]">Success rate</p>
        </div>
      </div>

      {/* Working indicator */}
      {currentTaskId && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#e8f0fe] border border-[#d3e3fd] rounded-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8] animate-pulse" />
          <span className="text-xs text-[#1a73e8]">Working on task...</span>
        </div>
      )}
    </div>
  );
}
