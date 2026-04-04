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
  finished_at: string | null;
  context_snapshot: Record<string, unknown> | null;
};

type Props = {
  initialAgents: Agent[];
  recentRuns: Run[];
  latestRunMap: Record<string, Run>;
};

const STATUS_CONFIG = {
  idle: { label: "Idle", dot: "#8b949e", glow: false },
  running: { label: "Running", dot: "#00d4aa", glow: true },
  paused: { label: "Paused", dot: "#d29922", glow: false },
  error: { label: "Error", dot: "#f85149", glow: false },
  terminated: { label: "Terminated", dot: "#30363d", glow: false },
} as const;

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "";
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function AgentCard({ agent, latestRun }: { agent: Agent; latestRun?: Run }) {
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  const issueId = latestRun?.context_snapshot?.issueId as string | undefined;
  const summary = latestRun?.summary ?? null;
  const truncatedSummary = summary ? summary.slice(-150).trimStart() : null;
  const runTimestamp = latestRun?.finished_at ?? latestRun?.started_at ?? null;

  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-2 transition-all duration-300"
      style={{
        backgroundColor: "#161b22",
        borderColor: isRunning ? "#00d4aa" : isError ? "#f8514933" : "#30363d",
        borderTopWidth: isRunning ? "2px" : "1px",
        borderTopColor: isRunning ? "#00d4aa" : isError ? "#f85149" : undefined,
        boxShadow: isRunning
          ? "0 0 12px 0 #00d4aa22, 0 0 4px 0 #00d4aa44"
          : isError
          ? "0 0 8px 0 #f8514922"
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

      {/* Issue identifier + run output */}
      <div className="flex flex-col gap-1 min-h-[2.5rem]">
        {issueId && (
          <span
            className="text-xs font-mono truncate"
            style={{ color: "#58a6ff" }}
          >
            {issueId}
          </span>
        )}
        {truncatedSummary ? (
          <p
            className="text-xs line-clamp-3 leading-relaxed"
            style={{ color: isError ? "#f85149cc" : "#8b949e" }}
          >
            {truncatedSummary}
          </p>
        ) : isRunning ? (
          <span className="text-xs" style={{ color: "#00d4aa" }}>
            Live now...
          </span>
        ) : (
          <span className="text-xs" style={{ color: "#484f58" }}>
            Waiting for subject...
          </span>
        )}
      </div>

      {/* Timestamp */}
      {runTimestamp && (
        <p className="text-xs mt-auto" style={{ color: "#484f58" }}>
          {formatRelativeTime(runTimestamp)}
        </p>
      )}
    </div>
  );
}

export default function DashboardClient({ initialAgents, recentRuns, latestRunMap }: Props) {
  const agents = useRealtimeAgents(initialAgents);

  // Split: active (non-terminated) first, then sort running to top
  const activeAgents = agents
    .filter((a) => a.status !== "terminated")
    .sort((a, b) => {
      const order: Record<string, number> = { running: 0, error: 1, paused: 2, idle: 3, terminated: 4 };
      return (order[a.status as string] ?? 9) - (order[b.status as string] ?? 9);
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
          latestRun={latestRunMap[agent.id]}
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
