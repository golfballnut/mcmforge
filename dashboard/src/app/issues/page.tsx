import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";

export const revalidate = 15;

interface Issue {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_agent_id: string | null;
  company_id: string | null;
  project_id: string | null;
  origin_kind: string | null;
  created_at: string;
  completed_at: string | null;
  agent_name?: string | null;
}

async function getIssues(companyId: string): Promise<Issue[]> {
  const supabase = await createForgeClient();
  const { data: issues } = await supabase
    .from("issues")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (!issues || issues.length === 0) return [];

  // Collect unique assignee agent IDs
  const agentIds = [...new Set(issues.map((i) => i.assignee_agent_id).filter(Boolean))];

  let agentMap: Record<string, string> = {};
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name")
      .in("id", agentIds);
    if (agents) {
      agentMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));
    }
  }

  return issues.map((issue) => ({
    ...issue,
    agent_name: issue.assignee_agent_id ? agentMap[issue.assignee_agent_id] ?? null : null,
  }));
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  backlog:     { label: "Backlog",     color: "bg-[#30363d] text-[#8b949e]" },
  todo:        { label: "Todo",        color: "bg-[#1f3358] text-[#58a6ff]" },
  in_progress: { label: "In Progress", color: "bg-[#3a2f00] text-[#d29922]" },
  in_review:   { label: "In Review",   color: "bg-[#2b1f5c] text-[#a371f7]" },
  done:        { label: "Done",        color: "bg-[#0f2d1f] text-[#3fb950]" },
  cancelled:   { label: "Cancelled",   color: "bg-[#3d1f1f] text-[#f85149]" },
};

const PRIORITY_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  critical: { label: "CRITICAL", badgeClass: "bg-[#f85149] text-[#0d1117]" },
  high:     { label: "HIGH",     badgeClass: "bg-[#d29922] text-[#0d1117]" },
  medium:   { label: "MEDIUM",   badgeClass: "bg-[#30363d] text-[#8b949e]" },
  low:      { label: "LOW",      badgeClass: "bg-transparent text-[#8b949e] border border-[#30363d]" },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-[#30363d] text-[#8b949e]" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${cfg.badgeClass}`}>
      {cfg.label}
    </span>
  );
}

export default async function IssuesPage() {
  const company = await getActiveCompany();
  const issues = await getIssues(company?.id ?? "");

  const openCount = issues.filter((i) => !["done", "cancelled"].includes(i.status)).length;
  const doneCount = issues.filter((i) => i.status === "done").length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] tracking-wide uppercase">
            Issues
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            <span className="text-[#e6edf3] font-medium">{openCount}</span> open &middot;{" "}
            <span className="text-[#8b949e]">{doneCount} closed</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b949e]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search issues..."
              className="pl-8 pr-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded-md text-sm text-[#e6edf3] placeholder-[#8b949e] focus:outline-none focus:border-[#00d4aa] w-48 sm:w-64"
            />
          </div>
          <Link
            href="/issues/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00d4aa] text-[#0d1117] text-sm font-medium rounded-md hover:bg-[#00e4b8] transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Issue
          </Link>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-4">
        {["Filter", "Sort", "Group"].map((label) => (
          <button
            key={label}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22] border border-[#30363d] text-[#8b949e] text-xs rounded-md hover:border-[#58a6ff] hover:text-[#e6edf3] transition-colors"
          >
            {label === "Filter" && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 14.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-6.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
            )}
            {label === "Sort" && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            )}
            {label === "Group" && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            )}
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-[#8b949e]">{issues.length} issues</span>
      </div>

      {/* Table */}
      {issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-[#8b949e] text-sm">No issues yet</p>
          <p className="text-[#8b949e] text-xs mt-1">Create your first issue to get started</p>
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-lg overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[120px_1fr_130px_140px_100px] gap-0 px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
            <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">ID</span>
            <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Title</span>
            <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Status</span>
            <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Assignee</span>
            <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider text-right">Created</span>
          </div>

          {/* Issue rows */}
          {issues.map((issue) => (
            <Link
              key={issue.id}
              href={`/issues/${issue.id}`}
              className="grid grid-cols-[120px_1fr_130px_140px_100px] gap-0 px-4 py-3 bg-[#0d1117] border-b border-[#21262d] hover:bg-[#161b22] transition-colors group last:border-b-0"
            >
              {/* Identifier */}
              <div className="flex items-center">
                <span className="font-mono text-xs text-[#8b949e] group-hover:text-[#58a6ff] transition-colors">
                  {issue.identifier ?? "—"}
                </span>
              </div>

              {/* Title + priority badge */}
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <span className="text-sm text-[#e6edf3] truncate">{issue.title}</span>
                <PriorityBadge priority={issue.priority} />
              </div>

              {/* Status */}
              <div className="flex items-center">
                <StatusPill status={issue.status} />
              </div>

              {/* Assignee */}
              <div className="flex items-center">
                {issue.agent_name ? (
                  <span className="text-xs text-[#8b949e] truncate">{issue.agent_name}</span>
                ) : (
                  <span className="text-xs text-[#484f58]">Unassigned</span>
                )}
              </div>

              {/* Date */}
              <div className="flex items-center justify-end">
                <span className="text-xs text-[#8b949e]">{formatRelativeTime(issue.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
