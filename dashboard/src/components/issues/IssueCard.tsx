/**
 * IssueCard.tsx
 * FORGE-252 — Card layout for issues grid view
 *
 * CountPill and PriorityBadge are defined locally to avoid
 * importing from the "use client" IssuesClient.tsx (circular import).
 * FORGE-255 filed to extract to shared.tsx.
 */

"use client";

import Link from "next/link";
import { StagePill } from "./StagePill";
import { WorkflowStage } from "@/lib/issue-stage";

interface IssueCardProps {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  priority: string;
  stage: WorkflowStage;
  comment_count: number;
  attachment_count: number;
  agent_name?: string | null;
  created_at: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  critical: { label: "CRITICAL", badgeClass: "bg-[#f85149] text-[#0d1117]" },
  high:     { label: "HIGH",     badgeClass: "bg-[#d29922] text-[#0d1117]" },
  medium:   { label: "MEDIUM",   badgeClass: "bg-[#30363d] text-[#8b949e]" },
  low:      { label: "LOW",      badgeClass: "bg-transparent text-[#8b949e] border border-[#30363d]" },
};

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${cfg.badgeClass}`}>
      {cfg.label}
    </span>
  );
}

function CountPill({ icon, count }: { icon: string; count: number }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums ${
        count === 0 ? "text-[#484f58]" : "text-[#8b949e]"
      }`}
    >
      {icon} {count}
    </span>
  );
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

export function IssueCard({
  id,
  identifier,
  title,
  priority,
  stage,
  comment_count,
  attachment_count,
  agent_name,
  created_at,
}: IssueCardProps) {
  const slug = identifier ?? id;

  return (
    <Link
      href={`/issues/${slug}`}
      className="flex flex-col gap-3 p-4 bg-[#0d1117] border border-[#21262d] rounded-lg hover:border-[#30363d] hover:bg-[#161b22] transition-all group"
      data-testid="issue-card"
    >
      {/* Top row: identifier + priority badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-[#58a6ff] group-hover:text-[#79c0ff] transition-colors">
          {identifier ?? "\u2014"}
        </span>
        <PriorityBadge priority={priority} />
      </div>

      {/* Title */}
      <p className="text-sm text-[#e6edf3] leading-snug line-clamp-2 min-h-[2.5rem]">
        {title}
      </p>

      {/* Stage pill */}
      <div>
        <StagePill stage={stage} />
      </div>

      {/* Footer: counts + assignee + date */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-1 border-t border-[#21262d]">
        <div className="flex items-center gap-3">
          <CountPill icon="💬" count={comment_count} />
          <CountPill icon="📎" count={attachment_count} />
        </div>
        <div className="flex flex-col items-end min-w-0">
          {agent_name && (
            <span className="text-[10px] text-[#8b949e] truncate max-w-[100px]">{agent_name}</span>
          )}
          <span className="text-[10px] text-[#484f58]">{formatRelativeTime(created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
