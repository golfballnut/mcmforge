import { createForgeClient } from "@/lib/supabase/forge-server";
import Link from "next/link";

export const revalidate = 30;

type Agent = {
  id: string;
  company_id: string | null;
  name: string;
  role: string | null;
  title: string | null;
  icon: string | null;
  status: string;
  adapter_type: string | null;
  adapter_config: Record<string, unknown> | null;
  last_heartbeat_at: string | null;
  reports_to: string | null;
  skills: string[] | null;
  created_at: string;
};

async function getAgent(id: string): Promise<Agent | null> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();
  return data as Agent | null;
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

function formatDateTime(timestamp: string | null): string {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; bg: string; text: string }> = {
  idle:       { dot: "bg-[#3fb950]", label: "Idle",       bg: "bg-[#0d1117] border border-[#3fb950]/30", text: "text-[#3fb950]" },
  running:    { dot: "bg-[#58a6ff]", label: "Running",    bg: "bg-[#0d1117] border border-[#58a6ff]/30", text: "text-[#58a6ff]" },
  paused:     { dot: "bg-[#d29922]", label: "Paused",     bg: "bg-[#0d1117] border border-[#d29922]/30", text: "text-[#d29922]" },
  error:      { dot: "bg-[#f85149]", label: "Error",      bg: "bg-[#0d1117] border border-[#f85149]/30", text: "text-[#f85149]" },
  terminated: { dot: "bg-[#8b949e]", label: "Terminated", bg: "bg-[#0d1117] border border-[#8b949e]/30", text: "text-[#8b949e]" },
};

function adapterLabel(adapterType: string | null): string {
  if (!adapterType) return "--";
  const map: Record<string, string> = {
    claude_local: "Claude (Local)",
    claude:       "Claude",
    gemini:       "Gemini",
    codex:        "Codex",
    openai:       "OpenAI",
  };
  return map[adapterType.toLowerCase()] ?? adapterType;
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  if (!agent) {
    return (
      <div>
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-[#00d4aa] text-sm hover:text-[#00bfaa] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Agents
        </Link>
        <div className="mt-8 text-center text-[#8b949e] p-12 border border-[#30363d] bg-[#161b22] rounded-lg">
          Agent not found
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[agent.status] ?? {
    dot: "bg-[#8b949e]",
    label: agent.status,
    bg: "bg-[#0d1117] border border-[#30363d]",
    text: "text-[#8b949e]",
  };

  const config = agent.adapter_config ?? {};
  const model = (config.model as string) || "--";
  const maxTurns = (config.maxTurns as number) ?? null;
  const timeoutSec = (config.timeoutSec as number) ?? null;
  const skills = agent.skills ?? [];

  return (
    <div>
      {/* Back link */}
      <Link
        href="/agents"
        className="inline-flex items-center gap-1 text-[#00d4aa] text-sm hover:text-[#00bfaa] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Agents
      </Link>

      {/* Header */}
      <div className="mt-5 mb-6 flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {agent.icon && <span className="text-2xl leading-none">{agent.icon}</span>}
            <h1 className="text-2xl font-semibold text-[#e6edf3]">{agent.name}</h1>
          </div>
          {agent.title && (
            <p className="text-sm text-[#8b949e] mt-1">{agent.title}</p>
          )}
        </div>

        {/* Status badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${statusCfg.bg} ${statusCfg.text}`}>
          <span
            className={`w-2 h-2 rounded-full ${statusCfg.dot} ${
              agent.status === "running" ? "animate-pulse" : ""
            }`}
          />
          {statusCfg.label}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Config card */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
              Configuration
            </h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Adapter</span>
                <span className="font-mono text-[#e6edf3] text-right">
                  {adapterLabel(agent.adapter_type)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Model</span>
                <span className="font-mono text-[#e6edf3] text-right truncate max-w-[180px]" title={model}>
                  {model}
                </span>
              </div>
              {maxTurns !== null && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b949e]">Max Turns</span>
                  <span className="font-mono text-[#e6edf3]">{maxTurns}</span>
                </div>
              )}
              {timeoutSec !== null && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b949e]">Timeout</span>
                  <span className="font-mono text-[#e6edf3]">{timeoutSec}s</span>
                </div>
              )}
              {agent.role && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b949e]">Role</span>
                  <span className="text-[#e6edf3]">{agent.role}</span>
                </div>
              )}
            </div>
          </div>

          {/* Heartbeat card */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
              Heartbeat
            </h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Last seen</span>
                <span className="text-[#e6edf3]">
                  {formatRelativeTime(agent.last_heartbeat_at)}
                </span>
              </div>
              {agent.last_heartbeat_at && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#8b949e]">Timestamp</span>
                  <span className="text-xs text-[#8b949e]">
                    {formatDateTime(agent.last_heartbeat_at)}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Registered</span>
                <span className="text-xs text-[#8b949e]">
                  {formatDateTime(agent.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Skills card */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3 flex items-center gap-2">
              Skills
              {skills.length > 0 && (
                <span className="font-mono text-[#00d4aa]">{skills.length}</span>
              )}
            </h2>
            {skills.length === 0 ? (
              <p className="text-sm text-[#8b949e]">No skills assigned</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-1 bg-[#0d1117] border border-[#30363d] text-[#8b949e] text-xs rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recent Runs */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-4">
              Recent Runs
            </h2>
            <div className="flex items-center justify-center py-10 text-[#8b949e] text-sm border border-dashed border-[#30363d] rounded-md">
              Run history coming soon
            </div>
          </div>

          {/* Raw config (collapsible) */}
          {Object.keys(config).length > 0 && (
            <details className="bg-[#161b22] border border-[#30363d] rounded-lg group">
              <summary className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#8b949e] cursor-pointer hover:text-[#e6edf3] transition-colors select-none list-none flex items-center gap-2">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Adapter Config (raw)
              </summary>
              <div className="px-4 pb-4">
                <pre className="text-xs font-mono text-[#8b949e] bg-[#0d1117] border border-[#30363d] rounded p-3 overflow-x-auto max-h-64">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
