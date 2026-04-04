"use client";

import { useRealtimeAgents } from "@/lib/hooks/use-realtime";

type Agent = {
  id: string;
  name: string;
  title: string;
  status: "idle" | "running" | "paused" | "error" | "terminated";
  adapter_type: string;
  last_heartbeat_at: string | null;
  company_id: string | null;
};

type Run = {
  id: string;
  agent_id: string;
  status: string;
  summary: string | null;
  started_at: string | null;
};

type Props = {
  initialAgents: Agent[];
  recentRuns: Run[];
};

const STATUS_CONFIG = {
  idle: { label: "Idle", dot: "#8b949e", glow: false },
  running: { label: "Running", dot: "#00d4aa", glow: true },
  paused: { label: "Paused", dot: "#d29922", glow: false },
  error: { label: "Error", dot: "#f85149", glow: false },
  terminated: { label: "Terminated", dot: "#30363d", glow: false },
} as const;

function AgentCard({ agent, currentRun }: { agent: Agent; currentRun?: Run }) {
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;
  const isRunning = agent.status === "running";

  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-2 transition-all duration-300"
      style={{
        backgroundColor: "#161b22",
        borderColor: isRunning ? "#00d4aa" : "#30363d",
        borderTopWidth: isRunning ? "2px" : "1px",
        boxShadow: isRunning
          ? "0 0 12px 0 #00d4aa22, 0 0 4px 0 #00d4aa44"
          : undefined,
      }}
    >
      {/* Agent name + status dot */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className="font-semibold text-sm truncate"
            style={{ color: "#e6edf3" }}
          >
            {agent.name}
          </p>
          <p className="text-xs truncate" style={{ color: "#8b949e" }}>
            {agent.title}
          </p>
        </div>
        <span className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <span
            className={`w-2 h-2 rounded-full ${isRunning ? "animate-pulse" : ""}`}
            style={{ backgroundColor: cfg.dot }}
          />
          <span className="text-xs" style={{ color: "#8b949e" }}>
            {cfg.label}
          </span>
        </span>
      </div>

      {/* Current run info */}
      <div className="text-xs" style={{ color: "#8b949e" }}>
        {currentRun?.summary ? (
          <span className="line-clamp-2" style={{ color: "#e6edf3" }}>
            {currentRun.summary}
          </span>
        ) : isRunning ? (
          <span style={{ color: "#00d4aa" }}>Working...</span>
        ) : (
          <span>Waiting for subject...</span>
        )}
      </div>

      {/* Last heartbeat */}
      {agent.last_heartbeat_at && (
        <p className="text-xs mt-auto" style={{ color: "#30363d" }}>
          {new Date(agent.last_heartbeat_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

export default function DashboardClient({ initialAgents, recentRuns }: Props) {
  const agents = useRealtimeAgents(initialAgents);

  // Build a map of agent_id -> most recent running run
  const runsByAgent = recentRuns.reduce<Record<string, Run>>((acc, run) => {
    if (!acc[run.agent_id] || run.status === "running") {
      acc[run.agent_id] = run;
    }
    return acc;
  }, {});

  // Split: active (non-terminated) first, then sort running to top
  const activeAgents = agents
    .filter((a) => a.status !== "terminated")
    .sort((a, b) => {
      const order = { running: 0, error: 1, paused: 2, idle: 3, terminated: 4 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
      }}
    >
      {activeAgents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          currentRun={runsByAgent[agent.id]}
        />
      ))}
      {activeAgents.length === 0 && (
        <p
          className="col-span-full text-sm text-center py-12"
          style={{ color: "#8b949e" }}
        >
          No active agents. Deploy agents to see them here.
        </p>
      )}
    </div>
  );
}
