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
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Agent Roster</h1>
          <span className="px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-full">
            {activeCount} / {agents.length} active
          </span>
        </div>
        <p className="text-gray-500 mt-1">All registered AI agents and their current status</p>
      </div>

      {agents.length === 0 ? (
        <div className="text-gray-600 text-sm p-12 border border-gray-800 rounded-xl text-center">
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
      dot: "bg-green-400",
      label: "Active",
      border: "border-green-500/20",
    },
    idle: {
      dot: "bg-amber-400",
      label: "Idle",
      border: "border-amber-500/20",
    },
    offline: {
      dot: "bg-red-400",
      label: "Offline",
      border: "border-red-500/20",
    },
  };

  const statusStyle = statusConfig[status] ?? statusConfig.offline;

  return (
    <div
      className={`bg-gray-900/50 border rounded-xl p-5 flex flex-col gap-4 ${statusStyle.border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-bold leading-tight">{agent.name as string}</p>
          <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs rounded">
            {agent.agent_type as string}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusStyle.dot} animate-pulse`} />
          <span className="text-xs text-gray-400">{statusStyle.label}</span>
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-1.5 text-xs text-gray-400">
        <div className="flex justify-between">
          <span className="text-gray-600">CLI</span>
          <span className="font-mono">{agent.cli_target as string}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Machine</span>
          <span>{agent.machine as string}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Last heartbeat</span>
          <span>{formatRelativeTime(lastHeartbeat)}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-800">
        <div className="text-center">
          <p className="text-lg font-bold text-white">{tasksCompleted ?? 0}</p>
          <p className="text-xs text-gray-600">Tasks done</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-white">
            {successRate != null ? `${Number(successRate).toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-gray-600">Success rate</p>
        </div>
      </div>

      {/* Working indicator */}
      {currentTaskId && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs text-blue-400">Working on task...</span>
        </div>
      )}
    </div>
  );
}
