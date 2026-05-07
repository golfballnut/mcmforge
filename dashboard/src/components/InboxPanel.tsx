"use client";

import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FailedRun = {
  id: string;
  agentName: string;
  status: string;
  finishedAt: string | null;
};

export type PendingApproval = {
  id: string;
  title: string;
  createdAt: string | null;
};

export type HighPriorityIssue = {
  id: string;
  identifier: string;
  title: string;
  status: string;
};

type Props = {
  failedRuns: FailedRun[];
  pendingApprovals: PendingApproval[];
  highPriorityIssues: HighPriorityIssue[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "";
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BucketHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8b949e" }}>
        {label}
      </span>
      {count > 0 && (
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: "#21262d", color: "#8b949e" }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-xs py-2" style={{ color: "#484f58" }}>
      All clear — nothing needs you right now.
    </p>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InboxPanel({ failedRuns, pendingApprovals, highPriorityIssues }: Props) {
  return (
    <div
      data-testid="inbox-panel"
      className="rounded-lg border p-4 space-y-5"
      style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
    >
      {/* Section title */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#58a6ff" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
        </svg>
        <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>
          Inbox
        </h2>
      </div>

      {/* ── Bucket 1: Failed Runs (last 24h) ── */}
      <div>
        <BucketHeader label="Failed Runs" count={failedRuns.length} />
        {failedRuns.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-1.5">
            {failedRuns.map((run) => (
              <li
                key={run.id}
                className="flex items-center justify-between text-xs rounded px-2 py-1.5"
                style={{ backgroundColor: "#0d1117" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: "#f85149" }}
                  />
                  <span className="truncate font-medium" style={{ color: "#e6edf3" }}>
                    {run.agentName}
                  </span>
                </div>
                {run.finishedAt && (
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: "#484f58" }}>
                    {formatRelativeTime(run.finishedAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", backgroundColor: "#21262d" }} />

      {/* ── Bucket 2: Pending Approvals ── */}
      <div>
        <BucketHeader label="Pending Approvals" count={pendingApprovals.length} />
        {pendingApprovals.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-1.5">
            {pendingApprovals.map((approval) => (
              <li
                key={approval.id}
                className="flex items-center justify-between text-xs rounded px-2 py-1.5"
                style={{ backgroundColor: "#0d1117" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: "#d29922" }}
                  />
                  <span className="truncate" style={{ color: "#e6edf3" }}>
                    {approval.title}
                  </span>
                </div>
                {approval.createdAt && (
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: "#484f58" }}>
                    {formatRelativeTime(approval.createdAt)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", backgroundColor: "#21262d" }} />

      {/* ── Bucket 3: High-Priority Issues ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <BucketHeader label="High-Priority Issues" count={highPriorityIssues.length} />
          <Link
            href="/issues"
            className="text-[10px] transition-colors"
            style={{ color: "#58a6ff" }}
          >
            View all
          </Link>
        </div>
        {highPriorityIssues.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-1.5">
            {highPriorityIssues.map((issue) => (
              <li
                key={issue.id}
                className="flex items-center gap-2 text-xs rounded px-2 py-1.5"
                style={{ backgroundColor: "#0d1117" }}
              >
                <span
                  className="font-mono shrink-0"
                  style={{ color: "#58a6ff" }}
                >
                  {issue.identifier}
                </span>
                <span className="truncate" style={{ color: "#e6edf3" }}>
                  {issue.title}
                </span>
                <span
                  className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "#21262d", color: "#8b949e" }}
                >
                  {issue.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
