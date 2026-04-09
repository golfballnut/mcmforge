import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusDropdown, PriorityDropdown, AssigneeDropdown, CommentForm } from "./IssueActions";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

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
}

interface Comment {
  id: string;
  body: string;
  author_agent_id: string | null;
  created_at: string;
  author_name?: string | null;
}

async function getIssue(id: string) {
  const supabase = await createForgeClient();

  const { data: issue } = await supabase
    .from("issues")
    .select("*")
    .eq("id", id)
    .single();

  if (!issue) return null;
  const company = await getActiveCompany();
  if (company && issue.company_id !== company.id) return null;

  // Fetch all agents for assignee dropdown + assignee name lookup
  const { data: allAgents } = await supabase
    .from("agents")
    .select("id, name")
    .order("name", { ascending: true });

  const agentList = (allAgents ?? []) as { id: string; name: string }[];
  const agentMap = Object.fromEntries(agentList.map((a) => [a.id, a.name]));

  const assigneeName = issue.assignee_agent_id
    ? (agentMap[issue.assignee_agent_id] ?? null)
    : null;

  // Fetch comments with author names
  const { data: rawComments } = await supabase
    .from("issue_comments")
    .select("*")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  const comments: Comment[] = [];
  if (rawComments && rawComments.length > 0) {
    for (const c of rawComments) {
      comments.push({
        ...c,
        author_name: c.author_agent_id ? agentMap[c.author_agent_id] ?? null : null,
      });
    }
  }

  return { issue: issue as Issue, assigneeName, comments, agents: agentList };
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
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  backlog:     { label: "Backlog",     color: "text-[#8b949e]", dot: "bg-[#8b949e]" },
  todo:        { label: "Todo",        color: "text-[#58a6ff]", dot: "bg-[#58a6ff]" },
  in_progress: { label: "In Progress", color: "text-[#d29922]", dot: "bg-[#d29922]" },
  in_review:   { label: "In Review",   color: "text-[#a371f7]", dot: "bg-[#a371f7]" },
  done:        { label: "Done",        color: "text-[#3fb950]", dot: "bg-[#3fb950]" },
  cancelled:   { label: "Cancelled",   color: "text-[#f85149]", dot: "bg-[#f85149]" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "text-[#f85149]" },
  high:     { label: "High",     color: "text-[#d29922]" },
  medium:   { label: "Medium",   color: "text-[#8b949e]" },
  low:      { label: "Low",      color: "text-[#8b949e]" },
};

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[#21262d] last:border-b-0">
      <span className="text-xs text-[#8b949e] shrink-0 pt-0.5">{label}</span>
      <div className="text-xs text-[#e6edf3] text-right">{children}</div>
    </div>
  );
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getIssue(id);

  if (!result) notFound();

  const { issue, assigneeName, comments, agents } = result;
  const statusCfg = STATUS_CONFIG[issue.status] ?? STATUS_CONFIG.backlog;
  const priorityCfg = PRIORITY_CONFIG[issue.priority] ?? PRIORITY_CONFIG.medium;

  return (
    <div className="min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link href="/issues" className="text-[#8b949e] hover:text-[#58a6ff] transition-colors">
          Issues
        </Link>
        <svg className="w-3 h-3 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono text-[#8b949e]">{issue.identifier ?? id.slice(0, 8)}</span>
      </div>

      {/* Main layout: 2/3 + 1/3 */}
      <div className="flex gap-6 items-start">
        {/* Left: content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h1 className="text-2xl font-semibold text-[#e6edf3] leading-tight mb-4">
            {issue.title}
          </h1>

          {/* Origin / meta badges */}
          <div className="flex items-center gap-2 mb-6">
            <span className={`inline-flex items-center gap-1.5 text-xs ${statusCfg.color}`}>
              <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
            {issue.origin_kind && (
              <span className="text-xs px-2 py-0.5 bg-[#161b22] border border-[#30363d] text-[#8b949e] rounded">
                {issue.origin_kind}
              </span>
            )}
          </div>

          {/* Description */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 mb-6">
            {issue.description ? (
              <div className="text-sm text-[#e6edf3] leading-relaxed whitespace-pre-wrap">
                {issue.description}
              </div>
            ) : (
              <p className="text-sm text-[#8b949e] italic">No description provided.</p>
            )}
          </div>

          {/* Tabs */}
          <div className="border-b border-[#30363d] mb-6">
            <div className="flex gap-0">
              {["Comments", "Sub-issues", "Activity"].map((tab, i) => (
                <button
                  key={tab}
                  className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
                    i === 0
                      ? "border-[#00d4aa] text-[#e6edf3] font-medium"
                      : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                >
                  {tab}
                  {tab === "Comments" && comments.length > 0 && (
                    <span className="ml-1.5 text-xs bg-[#30363d] text-[#8b949e] px-1.5 py-0.5 rounded-full">
                      {comments.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-4 mb-6">
            {comments.length === 0 ? (
              <p className="text-sm text-[#8b949e] py-4 text-center">No comments yet.</p>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden"
                >
                  {/* Comment header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#30363d] bg-[#0d1117]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#00d4aa] flex items-center justify-center">
                        <span className="text-[10px] font-bold text-[#0d1117]">
                          {(comment.author_name ?? "A")[0].toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-[#e6edf3]">
                        {comment.author_name ?? "Agent"}
                      </span>
                    </div>
                    <span className="text-xs text-[#8b949e]">{formatRelativeTime(comment.created_at)}</span>
                  </div>
                  {/* Comment body */}
                  <div className="px-4 py-3 text-sm text-[#e6edf3] leading-relaxed whitespace-pre-wrap">
                    {comment.body}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Comment input */}
          <CommentForm issueId={issue.id} companyId={issue.company_id} />
        </div>

        {/* Right: properties panel */}
        <div className="w-72 shrink-0">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
              Properties
            </h3>

            <PropertyRow label="Status">
              <StatusDropdown issueId={issue.id} currentStatus={issue.status} />
            </PropertyRow>

            <PropertyRow label="Priority">
              <PriorityDropdown issueId={issue.id} currentPriority={issue.priority} />
            </PropertyRow>

            <PropertyRow label="Assignee">
              <AssigneeDropdown
                issueId={issue.id}
                currentAgentId={issue.assignee_agent_id}
                agents={agents}
              />
            </PropertyRow>

            <PropertyRow label="Project">
              {issue.project_id ? (
                <span className="font-mono text-[#8b949e]">{issue.project_id.slice(0, 8)}</span>
              ) : (
                <span className="text-[#484f58]">None</span>
              )}
            </PropertyRow>

            <PropertyRow label="Identifier">
              <span className="font-mono text-[#8b949e]">{issue.identifier ?? "—"}</span>
            </PropertyRow>

            <PropertyRow label="Origin">
              {issue.origin_kind ? (
                <span className="text-[#8b949e]">{issue.origin_kind}</span>
              ) : (
                <span className="text-[#484f58]">—</span>
              )}
            </PropertyRow>

            <PropertyRow label="Created">
              <span className="text-[#8b949e]">{formatDate(issue.created_at)}</span>
            </PropertyRow>

            {issue.completed_at && (
              <PropertyRow label="Completed">
                <span className="text-[#3fb950]">{formatDate(issue.completed_at)}</span>
              </PropertyRow>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
