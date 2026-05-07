"use client";

import Link from "next/link";
import { useRealtimeAgents } from "@/lib/hooks/use-realtime";

// ─── Types ────────────────────────────────────────────────────────────────────

type Agent = {
  id: string;
  name: string;
  status: string;
  adapter_config: Record<string, unknown> | null;
  last_heartbeat_at: string | null;
};

type RunSummary = {
  status: string;
  summary: string | null;
};

type Props = {
  initialAgents: Agent[];
  latestRunMap: Record<string, RunSummary>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  running:    "#00d4aa",
  idle:       "#3fb950",
  paused:     "#d29922",
  error:      "#f85149",
  terminated: "#30363d",
};

function statusDotColor(status: string): string {
  return STATUS_DOT[status] ?? "#8b949e";
}

function runResultText(run: RunSummary | undefined, status: string): string {
  if (status === "running") return "Running now...";
  if (!run) return "No recent run";
  if (run.status === "succeeded") {
    return run.summary ? run.summary.slice(-80).trimStart() : "Succeeded";
  }
  if (run.status === "failed" || run.status === "timed_out") {
    return run.summary ? `Failed: ${run.summary.slice(-60).trimStart()}` : "Failed";
  }
  return run.status;
}

// ─── Compact Agent Card ───────────────────────────────────────────────────────

function AgentCard({ agent, latestRun }: { agent: Agent; latestRun?: RunSummary }) {
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";
  const dotColor = statusDotColor(agent.status);
  const resultText = runResultText(latestRun, agent.status);

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="rounded-md border p-3 flex flex-col gap-1.5 transition-all hover:border-[#58a6ff]/40"
      style={{
        backgroundColor: "#161b22",
        borderColor: isRunning ? "#00d4aa40" : isError ? "#f8514933" : "#30363d",
      }}
    >
      {/* Name + status dot */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: dotColor }}
        />
        <span
          className="text-sm font-medium truncate flex-1"
          style={{ color: "#e6edf3" }}
        >
          {agent.name}
        </span>
        <span
          className="text-[10px] shrink-0"
          style={{ color: dotColor }}
        >
          {agent.status}
        </span>
      </div>

      {/* Last run result */}
      <p
        className="text-xs line-clamp-2 leading-relaxed"
        style={{ color: isError ? "#f85149cc" : "#8b949e" }}
      >
        {resultText}
      </p>
    </Link>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveAgentsGrid({ initialAgents, latestRunMap }: Props) {
  const agents = useRealtimeAgents(initialAgents as any);

  // Filter: non-archived, has adapter_config.cwd set
  const activeAgents = (agents as Agent[])
    .filter((a) => a.status !== "archived" && a.status !== "terminated")
    .filter((a) => a.adapter_config?.cwd != null)
    .sort((a, b) => {
      const order: Record<string, number> = { running: 0, error: 1, paused: 2, idle: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

  return (
    <div data-testid="live-agents-grid">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#8b949e" }}>
          Live Agents
        </h2>
        <Link
          href="/agents"
          className="text-xs transition-colors"
          style={{ color: "#58a6ff" }}
        >
          View all
        </Link>
      </div>

      {activeAgents.length === 0 ? (
        <p
          className="text-sm text-center py-8"
          style={{ color: "#484f58" }}
        >
          No active agents. Deploy agents to see them here.
        </p>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {activeAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              latestRun={latestRunMap[agent.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
