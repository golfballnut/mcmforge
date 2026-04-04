import { createForgeClient } from "@/lib/supabase/forge-server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 30;

type Routine = {
  id: string;
  company_id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_agent_id: string;
  priority: string;
  status: string;
  cron_expression: string;
  timezone: string;
  next_run_at: string | null;
  last_triggered_at: string | null;
  concurrency_policy: string;
  catch_up_policy: string;
  prompt_template: string | null;
  created_at: string;
  updated_at: string;
};

type RoutineRun = {
  id: string;
  routine_id: string;
  company_id: string;
  status: string;
  triggered_at: string;
  completed_at: string | null;
  linked_issue_id: string | null;
  linked_run_id: string | null;
  failure_reason: string | null;
  created_at: string;
};

type Agent = { id: string; name: string; icon: string | null; title: string | null };
type Company = { id: string; slug: string; name: string };

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

function durationLabel(run: RoutineRun): string {
  if (!run.completed_at) return "--";
  const ms = new Date(run.completed_at).getTime() - new Date(run.triggered_at).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function humanCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, month, dow] = parts;

  if (expr === "* * * * *") return "Every minute";
  if (/^\*\/(\d+)$/.test(min) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    const n = min.match(/^\*\/(\d+)$/)![1];
    return `Every ${n} minutes`;
  }
  if (min !== "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `Hourly at :${min.padStart(2, "0")}`;
  }
  if (dom === "*" && month === "*" && dow === "*") {
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `Daily at ${h12}:${min.padStart(2, "0")} ${ampm} UTC`;
  }
  if (dom === "*" && month === "*" && /^\d$/.test(dow)) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${days[parseInt(dow, 10)]} at ${h12}:${min.padStart(2, "0")} ${ampm} UTC`;
  }
  return expr;
}

const RUN_STATUS_CONFIG: Record<string, { dot: string; label: string; text: string }> = {
  success:   { dot: "bg-[#3fb950]", label: "Success",   text: "text-[#3fb950]" },
  running:   { dot: "bg-[#58a6ff] animate-pulse", label: "Running", text: "text-[#58a6ff]" },
  failed:    { dot: "bg-[#f85149]", label: "Failed",    text: "text-[#f85149]" },
  skipped:   { dot: "bg-[#8b949e]", label: "Skipped",   text: "text-[#8b949e]" },
  pending:   { dot: "bg-[#d29922]", label: "Pending",   text: "text-[#d29922]" },
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-[#f85149] border-[#f85149]/30 bg-[#f85149]/10",
  high: "text-[#d29922] border-[#d29922]/30 bg-[#d29922]/10",
  medium: "text-[#58a6ff] border-[#58a6ff]/30 bg-[#58a6ff]/10",
  low: "text-[#8b949e] border-[#8b949e]/30 bg-[#8b949e]/10",
};

export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createForgeClient();

  const [
    { data: routine },
    { data: agents },
    { data: companies },
    { data: runs },
  ] = await Promise.all([
    supabase.from("routines").select("*").eq("id", id).single(),
    supabase.from("agents").select("id, name, icon, title"),
    supabase.from("companies").select("id, slug, name"),
    supabase
      .from("routine_runs")
      .select("*")
      .eq("routine_id", id)
      .order("triggered_at", { ascending: false })
      .limit(20),
  ]);

  if (!routine) notFound();

  const r = routine as Routine;
  const agentMap = Object.fromEntries(
    ((agents as Agent[]) || []).map((a) => [a.id, a])
  );
  const companyMap = Object.fromEntries(
    ((companies as Company[]) || []).map((c) => [c.id, c])
  );

  const assignee = agentMap[r.assignee_agent_id];
  const company = companyMap[r.company_id];
  const recentRuns = (runs as RoutineRun[]) || [];

  const isActive = r.status === "active";
  const priorityStyle = PRIORITY_COLOR[r.priority] ?? PRIORITY_COLOR.low;

  return (
    <div>
      {/* Back */}
      <Link
        href="/routines"
        className="inline-flex items-center gap-1 text-[#00d4aa] text-sm hover:text-[#00bfaa] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Routines
      </Link>

      {/* Header */}
      <div className="mt-5 mb-6 flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-[#e6edf3]">{r.title}</h1>
          {r.description && (
            <p className="text-sm text-[#8b949e] mt-1">{r.description}</p>
          )}
        </div>

        {/* Status + priority */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${priorityStyle}`}>
            {r.priority}
          </span>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-[#0d1117] border ${
            isActive ? "border-[#3fb950]/30 text-[#3fb950]" : "border-[#8b949e]/30 text-[#8b949e]"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isActive ? "bg-[#3fb950]" : "bg-[#8b949e]"}`} />
            {isActive ? "Active" : "Paused"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Schedule card */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
              Schedule
            </h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Cron</span>
                <span className="font-mono text-[#e6edf3] text-right">
                  {r.cron_expression}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e] shrink-0">Human</span>
                <span className="text-[#e6edf3] text-right text-xs">
                  {humanCron(r.cron_expression)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Timezone</span>
                <span className="text-[#e6edf3] font-mono text-xs">{r.timezone}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e] shrink-0">Next run</span>
                <span className="text-[#e6edf3] text-xs text-right">
                  {r.next_run_at ? formatDateTime(r.next_run_at) : "--"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e] shrink-0">Last triggered</span>
                <span className="text-[#8b949e] text-xs text-right">
                  {formatRelativeTime(r.last_triggered_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Config card */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
              Configuration
            </h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e] shrink-0">Concurrency</span>
                <span className="font-mono text-[#e6edf3] text-xs">
                  {r.concurrency_policy}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e] shrink-0">Catch-up</span>
                <span className="font-mono text-[#e6edf3] text-xs">
                  {r.catch_up_policy}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8b949e]">Company</span>
                <span className="font-mono text-[#8b949e] text-xs">
                  {company?.slug ?? "--"}
                </span>
              </div>
            </div>
          </div>

          {/* Assignee card */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
              Assignee
            </h2>
            {assignee ? (
              <Link
                href={`/agents/${r.assignee_agent_id}`}
                className="flex items-center gap-2.5 p-2 rounded-md hover:bg-[#1c2333] transition-colors -m-2"
              >
                {assignee.icon && (
                  <span className="text-xl leading-none">{assignee.icon}</span>
                )}
                <div>
                  <p className="text-sm font-medium text-[#00d4aa]">{assignee.name}</p>
                  {assignee.title && (
                    <p className="text-xs text-[#8b949e] mt-0.5">{assignee.title}</p>
                  )}
                </div>
              </Link>
            ) : (
              <p className="text-sm text-[#8b949e]">No assignee</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
              Metadata
            </h2>
            <div className="space-y-2 text-xs text-[#8b949e]">
              <div className="flex justify-between gap-2">
                <span>Created</span>
                <span>{formatDateTime(r.created_at)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Updated</span>
                <span>{formatDateTime(r.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Prompt template */}
          {r.prompt_template && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
                Prompt Template
              </h2>
              <pre className="text-xs font-mono text-[#8b949e] bg-[#0d1117] border border-[#30363d] rounded p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-48">
                {r.prompt_template}
              </pre>
            </div>
          )}

          {/* Recent runs */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-4 flex items-center gap-2">
              Recent Runs
              {recentRuns.length > 0 && (
                <span className="font-mono text-[#00d4aa]">{recentRuns.length}</span>
              )}
            </h2>

            {recentRuns.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-[#8b949e] text-sm border border-dashed border-[#30363d] rounded-md">
                No runs recorded yet
              </div>
            ) : (
              <div className="space-y-0">
                {/* Run list header */}
                <div className="grid grid-cols-[90px_80px_1fr_80px] gap-x-4 px-3 py-1.5 text-xs text-[#8b949e] uppercase tracking-wide border-b border-[#30363d] mb-1">
                  <div>Status</div>
                  <div>Duration</div>
                  <div>Triggered</div>
                  <div className="text-right">Issue</div>
                </div>
                <div className="divide-y divide-[#21262d]">
                  {recentRuns.map((run) => {
                    const cfg = RUN_STATUS_CONFIG[run.status] ?? {
                      dot: "bg-[#8b949e]",
                      label: run.status,
                      text: "text-[#8b949e]",
                    };
                    return (
                      <div
                        key={run.id}
                        className="grid grid-cols-[90px_80px_1fr_80px] gap-x-4 px-3 py-2.5 items-center hover:bg-[#1c2333] rounded-sm transition-colors"
                      >
                        {/* Status */}
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          <span className={`text-xs ${cfg.text}`}>{cfg.label}</span>
                        </div>

                        {/* Duration */}
                        <div>
                          <span className="text-xs font-mono text-[#8b949e]">
                            {durationLabel(run)}
                          </span>
                        </div>

                        {/* Triggered */}
                        <div className="min-w-0">
                          <span className="text-xs text-[#8b949e] truncate block">
                            {formatDateTime(run.triggered_at)}
                          </span>
                          {run.failure_reason && (
                            <span className="text-xs text-[#f85149] mt-0.5 truncate block">
                              {run.failure_reason}
                            </span>
                          )}
                        </div>

                        {/* Linked issue */}
                        <div className="text-right">
                          {run.linked_issue_id ? (
                            <Link
                              href={`/issues/${run.linked_issue_id}`}
                              className="text-xs text-[#00d4aa] hover:text-[#00bfaa] font-mono"
                            >
                              issue
                            </Link>
                          ) : (
                            <span className="text-xs text-[#8b949e]">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
