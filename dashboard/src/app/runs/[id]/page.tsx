import { createForgeClient } from "@/lib/supabase/forge-server";
import Link from "next/link";

export const revalidate = 15;

type Run = {
  id: string;
  agent_id: string;
  status: string;
  invocation_source: string;
  trigger_detail: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cost_usd: number | null;
  exit_code: number | null;
  error: string | null;
  error_code: string | null;
  summary: string | null;
  stdout_excerpt: string | null;
  stderr_excerpt: string | null;
  timed_out: boolean;
  retry_of_run_id: string | null;
  agent: { name: string; icon: string | null; title: string | null } | null;
};

type RunEvent = {
  id: string;
  seq: number;
  event_type: string;
  stream: string | null;
  level: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

async function getRun(id: string): Promise<Run | null> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("runs")
    .select("*, agent:agents(name, icon, title)")
    .eq("id", id)
    .single();
  return data as Run | null;
}

async function getRunEvents(runId: string): Promise<RunEvent[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("run_events")
    .select("id, seq, event_type, stream, level, message, payload, created_at")
    .eq("run_id", runId)
    .order("seq", { ascending: true })
    .limit(500);
  return (data as RunEvent[]) || [];
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

function formatDateTime(timestamp: string | null): string {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

const STATUS_CONFIG: Record<string, {
  label: string;
  dot: string;
  bg: string;
  text: string;
  pulse?: boolean;
}> = {
  queued:    { label: "Queued",    dot: "bg-[#8b949e]", bg: "bg-[#8b949e]/10 border border-[#8b949e]/30", text: "text-[#8b949e]" },
  running:   { label: "Running",   dot: "bg-[#58a6ff]", bg: "bg-[#58a6ff]/10 border border-[#58a6ff]/30", text: "text-[#58a6ff]", pulse: true },
  succeeded: { label: "Succeeded", dot: "bg-[#3fb950]", bg: "bg-[#3fb950]/10 border border-[#3fb950]/30", text: "text-[#3fb950]" },
  failed:    { label: "Failed",    dot: "bg-[#f85149]", bg: "bg-[#f85149]/10 border border-[#f85149]/30", text: "text-[#f85149]" },
  timed_out: { label: "Timed Out", dot: "bg-[#d29922]", bg: "bg-[#d29922]/10 border border-[#d29922]/30", text: "text-[#d29922]" },
  cancelled: { label: "Cancelled", dot: "bg-[#8b949e]", bg: "bg-[#8b949e]/10 border border-[#8b949e]/30", text: "text-[#8b949e]" },
};

function eventLineColor(stream: string | null, level: string | null, eventType: string): string {
  if (eventType === "error" || level === "error") return "text-[#f85149]";
  if (eventType === "warning" || level === "warn") return "text-[#d29922]";
  if (stream === "stderr") return "text-[#8b949e]";
  if (eventType === "start") return "text-[#00d4aa]";
  if (eventType === "finish") return "text-[#3fb950]";
  return "text-[#e6edf3]";
}

function eventPrefix(stream: string | null, level: string | null, eventType: string): string {
  if (eventType === "start") return "▶";
  if (eventType === "finish") return "■";
  if (eventType === "error" || level === "error") return "✕";
  if (eventType === "warning" || level === "warn") return "⚠";
  if (stream === "stderr") return "»";
  return " ";
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [run, events] = await Promise.all([getRun(id), getRunEvents(id)]);

  if (!run) {
    return (
      <div>
        <Link
          href="/runs"
          className="inline-flex items-center gap-1 text-[#00d4aa] text-sm hover:text-[#00bfaa] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Runs
        </Link>
        <div className="mt-8 text-center text-[#8b949e] p-12 border border-[#30363d] bg-[#161b22] rounded-lg">
          Run not found
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[run.status] ?? {
    label: run.status,
    dot: "bg-[#8b949e]",
    bg: "bg-[#8b949e]/10 border border-[#8b949e]/30",
    text: "text-[#8b949e]",
  };

  const agentName = run.agent?.name ?? "Unknown Agent";
  const agentIcon = run.agent?.icon;
  const agentTitle = run.agent?.title;

  return (
    <div>
      {/* Back */}
      <Link
        href="/runs"
        className="inline-flex items-center gap-1 text-[#00d4aa] text-sm hover:text-[#00bfaa] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Runs
      </Link>

      {/* Header */}
      <div className="mt-5 mb-6 flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {agentIcon && <span className="text-2xl leading-none">{agentIcon}</span>}
            <h1 className="text-xl font-semibold text-[#e6edf3] truncate">{agentName}</h1>
          </div>
          {agentTitle && (
            <p className="text-sm text-[#8b949e] mt-0.5">{agentTitle}</p>
          )}
          <p className="text-xs font-mono text-[#8b949e] mt-1">{run.id}</p>
        </div>

        {/* Status badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${statusCfg.bg} ${statusCfg.text} flex-shrink-0`}>
          <span className={`w-2 h-2 rounded-full ${statusCfg.dot} ${statusCfg.pulse ? "animate-pulse" : ""}`} />
          {statusCfg.label}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Timing card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">Timing</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Created</span>
              <span className="text-xs text-[#8b949e]">{formatRelativeTime(run.created_at)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Started</span>
              <span className="text-xs text-[#e6edf3]">{formatDateTime(run.started_at)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Finished</span>
              <span className="text-xs text-[#e6edf3]">{formatDateTime(run.finished_at)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Duration</span>
              <span className="font-mono text-[#e6edf3]">{formatDuration(run.started_at, run.finished_at)}</span>
            </div>
          </div>
        </div>

        {/* Token usage card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">Token Usage</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Input</span>
              <span className="font-mono text-[#e6edf3]">{run.input_tokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Cached input</span>
              <span className="font-mono text-[#8b949e]">{run.cached_input_tokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Output</span>
              <span className="font-mono text-[#e6edf3]">{run.output_tokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-2 pt-1 border-t border-[#30363d]">
              <span className="text-[#8b949e]">Total</span>
              <span className="font-mono text-[#e6edf3] font-semibold">
                {(run.input_tokens + run.output_tokens).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Meta card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">Details</h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Cost</span>
              <span className="font-mono text-[#00d4aa] font-semibold">{formatCost(run.cost_usd)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Model</span>
              <span className="font-mono text-xs text-[#e6edf3] truncate max-w-[150px]" title={run.model ?? ""}>
                {run.model ?? "--"}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#8b949e]">Source</span>
              <span className="text-xs text-[#e6edf3]">{run.invocation_source}</span>
            </div>
            {run.exit_code != null && (
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Exit code</span>
                <span className={`font-mono text-xs ${run.exit_code === 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                  {run.exit_code}
                </span>
              </div>
            )}
            {run.timed_out && (
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Timed out</span>
                <span className="text-xs text-[#d29922]">Yes</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {run.error && (
        <div className="mb-4 bg-[#f85149]/10 border border-[#f85149]/30 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-[#f85149] uppercase tracking-wide mb-1">
            Error{run.error_code ? ` (${run.error_code})` : ""}
          </p>
          <p className="text-sm text-[#f85149] font-mono">{run.error}</p>
        </div>
      )}

      {/* Summary */}
      {run.summary && (
        <div className="mb-4 bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide mb-1">Summary</p>
          <p className="text-sm text-[#e6edf3]">{run.summary}</p>
        </div>
      )}

      {/* Trigger detail */}
      {run.trigger_detail && (
        <div className="mb-4 bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-[#8b949e] uppercase tracking-wide mb-1">Trigger</p>
          <p className="text-sm text-[#e6edf3] font-mono">{run.trigger_detail}</p>
        </div>
      )}

      {/* Events log */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
            Run Events
          </h2>
          <span className="text-xs font-mono text-[#8b949e]">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        </div>

        {events.length === 0 ? (
          <div className="px-4 py-10 text-center text-[#8b949e] text-sm">
            No events recorded
          </div>
        ) : (
          <div className="bg-[#0d1117] p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
            <div className="font-mono text-xs space-y-0.5">
              {events.map((evt) => {
                const color = eventLineColor(evt.stream, evt.level, evt.event_type);
                const prefix = eventPrefix(evt.stream, evt.level, evt.event_type);
                const ts = new Date(evt.created_at).toISOString().slice(11, 23); // HH:MM:SS.mmm

                return (
                  <div key={evt.id} className={`flex gap-3 leading-5 ${color}`}>
                    {/* Seq + timestamp */}
                    <span className="text-[#8b949e] flex-shrink-0 select-none w-[130px]">
                      <span className="mr-2 text-[#30363d]">{String(evt.seq).padStart(4, "0")}</span>
                      {ts}
                    </span>

                    {/* Prefix */}
                    <span className="flex-shrink-0 select-none w-3">{prefix}</span>

                    {/* Message */}
                    <span className="break-all whitespace-pre-wrap">
                      {evt.message ?? (evt.payload ? JSON.stringify(evt.payload) : `[${evt.event_type}]`)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Retry link */}
      {run.retry_of_run_id && (
        <div className="mt-3 text-xs text-[#8b949e]">
          Retry of{" "}
          <Link href={`/runs/${run.retry_of_run_id}`} className="text-[#00d4aa] hover:underline font-mono">
            {run.retry_of_run_id.slice(0, 8)}…
          </Link>
        </div>
      )}
    </div>
  );
}
