import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { RoutineToggle } from "./RoutineToggle";

export const revalidate = 30;

type Routine = {
  id: string;
  company_id: string;
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
  created_at: string;
  updated_at: string;
};

type Agent = { id: string; name: string; icon: string | null };
type Company = { id: string; slug: string; name: string };

type RoutineRow = Routine & {
  agentName: string;
  agentIcon: string | null;
  companySlug: string;
};

async function getRoutines(companyId: string): Promise<RoutineRow[]> {
  const supabase = await createForgeClient();

  const [{ data: routines }, { data: agents }, { data: companies }] =
    await Promise.all([
      supabase.from("routines").select("*").eq("company_id", companyId).order("title", { ascending: true }),
      supabase.from("agents").select("id, name, icon"),
      supabase.from("companies").select("id, slug, name"),
    ]);

  const agentMap = Object.fromEntries(
    ((agents as Agent[]) || []).map((a) => [a.id, a])
  );
  const companyMap = Object.fromEntries(
    ((companies as Company[]) || []).map((c) => [c.id, c])
  );

  return ((routines as Routine[]) || []).map((r) => ({
    ...r,
    agentName: agentMap[r.assignee_agent_id]?.name ?? "Unknown",
    agentIcon: agentMap[r.assignee_agent_id]?.icon ?? null,
    companySlug: companyMap[r.company_id]?.slug ?? "--",
  }));
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

/**
 * Convert a 5-field cron expression to a human-readable string.
 * Handles the most common patterns used by the Paperclip scheduler.
 */
function humanCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, month, dow] = parts;

  // Every N minutes
  if (expr === "* * * * *") return "Every minute";
  if (/^\*\/(\d+)$/.test(min) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    const n = min.match(/^\*\/(\d+)$/)![1];
    return `Every ${n} minutes`;
  }
  // Every N hours (e.g. 0 */6 * * *)
  if (/^\*\/(\d+)$/.test(hour) && dom === "*" && month === "*" && dow === "*") {
    const n = hour.match(/^\*\/(\d+)$/)![1];
    return `Every ${n} hours`;
  }
  // Hourly
  if (min !== "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `Hourly at :${min.padStart(2, "0")}`;
  }
  // Daily at midnight
  if (min === "0" && hour === "0" && dom === "*" && month === "*" && dow === "*") {
    return "Daily at midnight";
  }
  // Daily at specific hour (numeric hour only)
  if (dom === "*" && month === "*" && dow === "*" && /^\d+$/.test(hour)) {
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `Daily at ${h12}:${min.padStart(2, "0")} ${ampm} UTC`;
  }
  // Weekly (single dow)
  if (dom === "*" && month === "*" && /^\d$/.test(dow) && /^\d+$/.test(hour)) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const h = parseInt(hour, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${days[parseInt(dow, 10)]} at ${h12}:${min.padStart(2, "0")} ${ampm} UTC`;
  }
  return expr;
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-[#f85149]",
  high: "text-[#d29922]",
  medium: "text-[#58a6ff]",
  low: "text-[#8b949e]",
};

export default async function RoutinesPage() {
  const company = await getActiveCompany();
  const routines = await getRoutines(company?.id ?? "");

  const activeCount = routines.filter((r) => r.status === "active").length;
  const pausedCount = routines.filter((r) => r.status === "paused").length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Routines
          </h1>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-[#161b22] border border-[#30363d] text-[#3fb950]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
            {activeCount} active
          </span>
          {pausedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-[#161b22] border border-[#30363d] text-[#8b949e]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8b949e]" />
              {pausedCount} paused
            </span>
          )}
        </div>
        <Link
          href="/routines/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#00d4aa] text-[#0d1117] text-sm font-medium hover:bg-[#00bfaa] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Routine
        </Link>
      </div>

      {/* Table */}
      {routines.length === 0 ? (
        <div className="text-[#8b949e] text-sm p-12 border border-[#30363d] bg-[#161b22] rounded-lg text-center">
          No routines scheduled yet
        </div>
      ) : (
        <div className="border border-[#21262d] rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_160px_200px_90px_120px] gap-x-4 px-4 py-2.5 bg-[#161b22] border-b border-[#21262d] text-xs font-medium text-[#8b949e] uppercase tracking-wide">
            <div>Title</div>
            <div>Company</div>
            <div>Assignee</div>
            <div>Schedule</div>
            <div className="text-center">Status</div>
            <div className="text-right">Last Triggered</div>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-[#21262d]">
            {routines.map((routine) => {
              const isActive = routine.status === "active";
              return (
                <div
                  key={routine.id}
                  className="grid grid-cols-[1fr_100px_160px_200px_90px_120px] gap-x-4 px-4 py-3 bg-[#161b22] hover:bg-[#1c2333] transition-colors items-center relative"
                >
                  {/* Title + priority — clickable link */}
                  <Link href={`/routines/${routine.id}`} className="min-w-0">
                    <span className="text-sm font-medium text-[#e6edf3] truncate block">
                      {routine.title}
                    </span>
                    <span
                      className={`text-xs font-mono mt-0.5 ${
                        PRIORITY_COLOR[routine.priority] ?? "text-[#8b949e]"
                      }`}
                    >
                      {routine.priority}
                    </span>
                  </Link>

                  {/* Company slug */}
                  <div>
                    <span className="inline-block px-1.5 py-0.5 text-xs font-mono rounded bg-[#0d1117] border border-[#30363d] text-[#8b949e] truncate max-w-full">
                      {routine.companySlug}
                    </span>
                  </div>

                  {/* Assignee */}
                  <div className="min-w-0 flex items-center gap-1.5">
                    {routine.agentIcon && (
                      <span className="text-sm leading-none shrink-0">{routine.agentIcon}</span>
                    )}
                    <span className="text-sm text-[#e6edf3] truncate">
                      {routine.agentName}
                    </span>
                  </div>

                  {/* Schedule (human-readable) */}
                  <div className="min-w-0">
                    <span className="text-xs font-mono text-[#8b949e] truncate block" title={routine.cron_expression}>
                      {humanCron(routine.cron_expression)}
                    </span>
                    <span className="text-xs text-[#8b949e]/60 mt-0.5 block font-mono">
                      {routine.cron_expression}
                    </span>
                  </div>

                  {/* Toggle */}
                  <div className="flex items-center justify-center gap-1.5">
                    <RoutineToggle routineId={routine.id} currentStatus={routine.status} />
                    <span
                      className={`text-xs ${
                        isActive ? "text-[#3fb950]" : "text-[#8b949e]"
                      }`}
                    >
                      {isActive ? "Active" : "Paused"}
                    </span>
                  </div>

                  {/* Last triggered */}
                  <div className="text-right">
                    <span className="text-xs text-[#8b949e]">
                      {formatRelativeTime(routine.last_triggered_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
