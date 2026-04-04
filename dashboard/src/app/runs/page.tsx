import { createForgeClient } from "@/lib/supabase/forge-server";
import Link from "next/link";

export const revalidate = 15;

type Run = {
  id: string;
  agent_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cost_usd: number | null;
  agent: { name: string; icon: string | null } | null;
};

async function getRuns(): Promise<Run[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("runs")
    .select("id, agent_id, status, started_at, finished_at, created_at, model, input_tokens, output_tokens, cached_input_tokens, cost_usd, agent:agents(name, icon)")
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data as unknown) as Run[]) || [];
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "--";
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(started: string | null, finished: string | null): string {
  if (!started) return "--";
  const end = finished ? new Date(finished).getTime() : Date.now();
  const ms = end - new Date(started).getTime();
  if (ms < 0) return "--";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatCost(cost: number | null): string {
  if (cost == null) return "--";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function truncateId(id: string): string {
  return id.slice(0, 8) + "…";
}

function shortenModel(model: string | null): string {
  if (!model) return "--";
  return model
    .replace("claude-", "")
    .replace("-20250219", "")
    .replace("-20241022", "")
    .replace("-20240620", "")
    .replace("-latest", "");
}

const STATUS_CONFIG: Record<string, {
  label: string;
  dot: string;
  badge: string;
  text: string;
  pulse?: boolean;
}> = {
  queued:    { label: "Queued",    dot: "bg-[#8b949e]", badge: "bg-[#8b949e]/10 border border-[#8b949e]/30", text: "text-[#8b949e]" },
  running:   { label: "Running",   dot: "bg-[#58a6ff]", badge: "bg-[#58a6ff]/10 border border-[#58a6ff]/30", text: "text-[#58a6ff]", pulse: true },
  succeeded: { label: "Succeeded", dot: "bg-[#3fb950]", badge: "bg-[#3fb950]/10 border border-[#3fb950]/30", text: "text-[#3fb950]" },
  failed:    { label: "Failed",    dot: "bg-[#f85149]", badge: "bg-[#f85149]/10 border border-[#f85149]/30", text: "text-[#f85149]" },
  timed_out: { label: "Timed Out", dot: "bg-[#d29922]", badge: "bg-[#d29922]/10 border border-[#d29922]/30", text: "text-[#d29922]" },
  cancelled: { label: "Cancelled", dot: "bg-[#8b949e]", badge: "bg-[#8b949e]/10 border border-[#8b949e]/30", text: "text-[#8b949e]" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    dot: "bg-[#8b949e]",
    badge: "bg-[#8b949e]/10 border border-[#8b949e]/30",
    text: "text-[#8b949e]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? "animate-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}

export default async function RunsPage() {
  const runs = await getRuns();

  // Summary counts
  const counts = {
    total:     runs.length,
    running:   runs.filter((r) => r.status === "running").length,
    succeeded: runs.filter((r) => r.status === "succeeded").length,
    failed:    runs.filter((r) => r.status === "failed").length,
  };

  const totalCost = runs.reduce((acc, r) => acc + (r.cost_usd ?? 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Runs
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-[#161b22] border border-[#30363d] text-[#8b949e]">
            {counts.total}
          </span>
        </div>
        <div className="text-xs text-[#8b949e] font-mono">
          Total cost: <span className="text-[#00d4aa]">{formatCost(totalCost)}</span>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {counts.running > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse" />
            {counts.running} running
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#3fb950]/10 border border-[#3fb950]/30 text-[#3fb950] text-xs font-medium">
          {counts.succeeded} succeeded
        </span>
        {counts.failed > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-xs font-medium">
            {counts.failed} failed
          </span>
        )}
      </div>

      {/* Table */}
      {runs.length === 0 ? (
        <div className="text-[#8b949e] text-sm p-12 border border-[#30363d] bg-[#161b22] rounded-lg text-center">
          No runs yet
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[140px_1fr_100px_110px_90px_120px_100px_80px] gap-x-3 px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] text-xs font-medium text-[#8b949e] uppercase tracking-wide">
            <div>Status</div>
            <div>Agent</div>
            <div>Run ID</div>
            <div>Started</div>
            <div>Duration</div>
            <div>Model</div>
            <div className="text-right">Tokens</div>
            <div className="text-right">Cost</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-[#21262d]">
            {runs.map((run) => {
              const agentName = run.agent?.name ?? "Unknown";
              const agentIcon = run.agent?.icon;
              const totalTokens = run.input_tokens + run.output_tokens;

              return (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="grid grid-cols-[140px_1fr_100px_110px_90px_120px_100px_80px] gap-x-3 px-4 py-3 bg-[#161b22] hover:bg-[#1c2333] transition-colors items-center cursor-pointer"
                >
                  {/* Status */}
                  <div>
                    <StatusBadge status={run.status} />
                  </div>

                  {/* Agent */}
                  <div className="min-w-0 flex items-center gap-1.5">
                    {agentIcon && (
                      <span className="text-sm leading-none flex-shrink-0">{agentIcon}</span>
                    )}
                    <span className="text-sm text-[#e6edf3] truncate">{agentName}</span>
                  </div>

                  {/* Run ID */}
                  <div>
                    <span className="text-xs font-mono text-[#8b949e]">{truncateId(run.id)}</span>
                  </div>

                  {/* Started */}
                  <div>
                    <span className="text-xs text-[#8b949e]">{formatRelativeTime(run.started_at ?? run.created_at)}</span>
                  </div>

                  {/* Duration */}
                  <div>
                    <span className="text-xs font-mono text-[#8b949e]">
                      {formatDuration(run.started_at, run.finished_at)}
                    </span>
                  </div>

                  {/* Model */}
                  <div>
                    <span className="text-xs font-mono text-[#8b949e] truncate block" title={run.model ?? ""}>
                      {shortenModel(run.model)}
                    </span>
                  </div>

                  {/* Tokens */}
                  <div className="text-right">
                    <span className="text-xs font-mono text-[#8b949e]">
                      {totalTokens > 0 ? totalTokens.toLocaleString() : "--"}
                    </span>
                  </div>

                  {/* Cost */}
                  <div className="text-right">
                    <span className={`text-xs font-mono ${run.cost_usd != null && run.cost_usd > 0 ? "text-[#00d4aa]" : "text-[#8b949e]"}`}>
                      {formatCost(run.cost_usd)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
