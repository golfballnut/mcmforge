"use client";

import { useState } from "react";
import { useRealtimeIssues } from "@/lib/hooks/use-realtime";
import Link from "next/link";

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
  agent_skills?: string[] | null;
}

type FilterMode = "open" | "closed" | "all";

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

const CLOSED_STATUSES = ["done", "cancelled"];

export default function IssuesClient({ initialIssues }: { initialIssues: Issue[] }) {
  const issues = useRealtimeIssues(initialIssues) as Issue[];
  const [filter, setFilter] = useState<FilterMode>("open");
  const [search, setSearch] = useState("");

  const openCount = issues.filter((i) => !CLOSED_STATUSES.includes(i.status)).length;
  const closedCount = issues.filter((i) => CLOSED_STATUSES.includes(i.status)).length;

  // Apply filter
  let filtered = issues;
  if (filter === "open") {
    filtered = issues.filter((i) => !CLOSED_STATUSES.includes(i.status));
  } else if (filter === "closed") {
    filtered = issues.filter((i) => CLOSED_STATUSES.includes(i.status));
  }

  // Apply search
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.identifier && i.identifier.toLowerCase().includes(q)) ||
        (i.agent_name && i.agent_name.toLowerCase().includes(q))
    );
  }

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
            <span className="text-[#8b949e]">{closedCount} closed</span>
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-[#30363d]">
        {([
          { key: "open" as FilterMode, label: "Open", count: openCount },
          { key: "closed" as FilterMode, label: "Closed", count: closedCount },
          { key: "all" as FilterMode, label: "All", count: issues.length },
        ]).map((tab) => {
          const isActive = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-2 text-sm rounded-t-md transition-colors ${
                isActive
                  ? "bg-[#1c2333] text-[#e6edf3] border border-b-0 border-[#30363d]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs font-mono ${isActive ? "text-[#8b949e]" : "text-[#484f58]"}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-[#8b949e] pb-2">
          {filtered.length} {filtered.length === 1 ? "issue" : "issues"}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-[#8b949e] text-sm">
            {search ? "No issues match your search" : filter === "open" ? "No open issues" : filter === "closed" ? "No closed issues" : "No issues yet"}
          </p>
          {!search && filter !== "open" && (
            <p className="text-[#8b949e] text-xs mt-1">Create your first issue to get started</p>
          )}
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-lg overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_130px] sm:grid-cols-[120px_1fr_130px_140px_100px] gap-0 px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
            <span className="hidden sm:block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">ID</span>
            <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Title</span>
            <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Status</span>
            <span className="hidden sm:block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Assignee</span>
            <span className="hidden sm:block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider text-right">Created</span>
          </div>

          {/* Issue rows */}
          {filtered.map((issue) => (
            <Link
              key={issue.id}
              href={`/issues/${issue.id}`}
              className="grid grid-cols-[1fr_130px] sm:grid-cols-[120px_1fr_130px_140px_100px] gap-0 px-4 py-3 bg-[#0d1117] border-b border-[#21262d] hover:bg-[#161b22] transition-colors group last:border-b-0"
            >
              {/* Identifier */}
              <div className="hidden sm:flex items-center">
                <span className="font-mono text-xs text-[#8b949e] group-hover:text-[#58a6ff] transition-colors">
                  {issue.identifier ?? "\u2014"}
                </span>
              </div>

              {/* Title + priority badge */}
              <div className="flex flex-col min-w-0 pr-4 justify-center">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-[#e6edf3] truncate">{issue.title}</span>
                  <PriorityBadge priority={issue.priority} />
                </div>
                {/* Mobile-only specialist line */}
                {issue.agent_name && (
                  <span className="sm:hidden text-[11px] text-[#8b949e] truncate mt-0.5">
                    {issue.agent_name}
                  </span>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center">
                <StatusPill status={issue.status} />
              </div>

              {/* Assignee (desktop) — name + skills badges */}
              <div className="hidden sm:flex flex-col justify-center min-w-0 pr-2">
                {issue.agent_name ? (
                  <>
                    <span className="text-xs text-[#e6edf3] truncate">{issue.agent_name}</span>
                    {issue.agent_skills && issue.agent_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {issue.agent_skills.slice(0, 2).map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-medium bg-[#1f3358] text-[#58a6ff] border border-[#30363d] max-w-full truncate"
                            title={skill}
                          >
                            {skill}
                          </span>
                        ))}
                        {issue.agent_skills.length > 2 && (
                          <span className="text-[9px] text-[#8b949e]">
                            +{issue.agent_skills.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-[#484f58]">Unassigned</span>
                )}
              </div>

              {/* Date */}
              <div className="hidden sm:flex items-center justify-end">
                <span className="text-xs text-[#8b949e]">{formatRelativeTime(issue.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
