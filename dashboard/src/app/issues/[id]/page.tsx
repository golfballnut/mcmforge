import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusDropdown, PriorityDropdown, AssigneeDropdown, CommentForm } from "./IssueActions";
import { IssueTabs } from "./IssueTabs";
import { AcceptanceCriteria } from "./AcceptanceCriteria";
import { CopyLinkButton } from "./CopyLinkButton";
import { buildIdentifierQuery } from "@/lib/resolve-issue-id";

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
  verify_command?: string | null;
  acceptance_criteria?: unknown;
  branch_name?: string | null;
  pr_url?: string | null;
  proof_summary?: string | null;
  parent_id?: string | null;
}

interface SubIssue {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  priority: string;
  assignee_agent_id: string | null;
}

interface ParentIssue {
  id: string;
  identifier: string | null;
  title: string;
}

interface Comment {
  id: string;
  body: string;
  author_agent_id: string | null;
  created_at: string;
  author_name?: string | null;
}

interface Attachment {
  id: string;
  filename: string;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
  url: string;
  category: string | null;
  comment_id: string | null;
}

async function getIssue(id: string) {
  const supabase = await createForgeClient();

  const { field, value } = buildIdentifierQuery(id);
  // Debug breadcrumb — logs which lookup fired for future URL-routing diagnosis
  console.debug(`[getIssue] lookup: field=${field} value=${value}`);

  const { data: issue } = await supabase
    .from("issues")
    .select("*")
    .eq(field, value)
    .single();

  if (!issue) return null;
  const company = await getActiveCompany();
  if (company && issue.company_id !== company.id) return null;

  // Fetch all agents for assignee dropdown + assignee name/skills lookup
  const { data: allAgents } = await supabase
    .from("agents")
    .select("id, name, skills")
    .order("name", { ascending: true });

  const agentList = (allAgents ?? []) as { id: string; name: string; skills: string[] | null }[];
  const agentMap = Object.fromEntries(agentList.map((a) => [a.id, a]));

  const assigneeName = issue.assignee_agent_id
    ? (agentMap[issue.assignee_agent_id]?.name ?? null)
    : null;
  const assigneeSkills = issue.assignee_agent_id
    ? (agentMap[issue.assignee_agent_id]?.skills ?? null)
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
        author_name: c.author_agent_id
          ? agentMap[c.author_agent_id]?.name ?? null
          : c.author_user_id ? "COO (Steve)" : null,
      });
    }
  }

  // Fetch attachments
  const { data: rawAttachments } = await supabase
    .from("issue_attachments")
    .select("*")
    .eq("issue_id", id)
    .order("created_at", { ascending: false });

  const attachments: Attachment[] = (rawAttachments ?? []).map((a) => {
    const { data: urlData } = supabase.storage.from("artifacts").getPublicUrl(a.storage_path);
    return {
      id: a.id,
      filename: a.filename,
      mime_type: a.mime_type,
      storage_path: a.storage_path,
      created_at: a.created_at,
      url: urlData.publicUrl,
      category: a.category ?? null,
      comment_id: a.comment_id ?? null,
    };
  });

  // Fetch activity events
  const { data: rawEvents } = await supabase
    .from("issue_events")
    .select("id, event_type, actor_type, actor_id, old_value, new_value, metadata, created_at")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  const events = (rawEvents ?? []) as {
    id: string;
    event_type: string;
    actor_type: string;
    actor_id: string | null;
    old_value: string | null;
    new_value: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }[];

  // Fetch child issues (sub-issues)
  const { data: rawSubIssues } = await supabase
    .from("issues")
    .select("id, identifier, title, status, priority, assignee_agent_id")
    .eq("parent_id", id)
    .order("created_at", { ascending: true });

  const subIssues: SubIssue[] = (rawSubIssues ?? []) as SubIssue[];

  // Fetch parent issue if this issue has a parent_id
  let parentIssue: ParentIssue | null = null;
  if (issue.parent_id) {
    const { data: parentData } = await supabase
      .from("issues")
      .select("id, identifier, title")
      .eq("id", issue.parent_id)
      .single();
    if (parentData) {
      parentIssue = parentData as ParentIssue;
    }
  }

  return { issue: issue as Issue, assigneeName, assigneeSkills, comments, agents: agentList, attachments, events, subIssues, parentIssue };
}

interface CriterionItem {
  criterion: string;
  verified: boolean;
}

function normalizeCriteria(raw: unknown): CriterionItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === "object" && item && "criterion" in item) {
        return { criterion: String((item as { criterion: unknown }).criterion), verified: !!(item as { verified?: unknown }).verified };
      }
      if (typeof item === "string") return { criterion: item, verified: false };
      if (typeof item === "object" && item && "text" in item) return { criterion: String((item as { text: unknown }).text), verified: false };
      return { criterion: String(item), verified: false };
    }).filter((c) => c.criterion.length > 0);
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeCriteria(parsed);
    } catch { /* fall through */ }
    return raw.split(/\r?\n/).map((s) => s.replace(/^[-*\d.\s[\]x]+/i, "").trim()).filter(Boolean).map((s) => ({ criterion: s, verified: false }));
  }
  return [];
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

  const { issue, assigneeName, assigneeSkills, comments, agents, attachments, events, subIssues, parentIssue } = result;
  const statusCfg = STATUS_CONFIG[issue.status] ?? STATUS_CONFIG.backlog;
  const priorityCfg = PRIORITY_CONFIG[issue.priority] ?? PRIORITY_CONFIG.medium;
  const criteria = normalizeCriteria(issue.acceptance_criteria);
  const skills = assigneeSkills ?? [];

  return (
    <div className="min-h-screen">
      {/* Breadcrumb + copy-link */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/issues" className="text-[#8b949e] hover:text-[#58a6ff] transition-colors">
            Issues
          </Link>
          <svg className="w-3 h-3 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-mono text-[#8b949e]">{issue.identifier ?? id.slice(0, 8)}</span>
        </div>
        <CopyLinkButton identifier={issue.identifier} issueId={issue.id} />
      </div>

      {/* Parent link */}
      {parentIssue && (
        <div className="flex items-center gap-2 text-sm mb-4 px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg">
          <span className="text-[#8b949e]">Parent:</span>
          <Link
            href={`/issues/${parentIssue.id}`}
            className="text-[#58a6ff] hover:underline font-mono"
          >
            {parentIssue.identifier ?? parentIssue.id.slice(0, 8)}
          </Link>
          <span className="text-[#8b949e]">—</span>
          <Link
            href={`/issues/${parentIssue.id}`}
            className="text-[#e6edf3] hover:text-[#58a6ff] transition-colors truncate"
          >
            {parentIssue.title}
          </Link>
        </div>
      )}

      {/* Main layout: 2/3 + 1/3 */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left: content */}
        <div className="flex-1 min-w-0">
          {/* Title — AC7: identifier · title */}
          <h1 className="text-2xl font-semibold text-[#e6edf3] leading-tight mb-4 break-words">
            {issue.identifier && (
              <span className="font-mono text-[#8b949e] text-lg mr-2">{issue.identifier} ·</span>
            )}
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

          {criteria.length > 0 && (
            <AcceptanceCriteria issueId={issue.id} criteria={criteria} />
          )}

          {issue.verify_command && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 mb-6">
              <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
                Verify Command
              </h3>
              <pre className="bg-[#0d1117] border border-[#30363d] rounded p-3 overflow-x-auto">
                <code className="text-xs text-[#e6edf3] font-mono whitespace-pre">{issue.verify_command}</code>
              </pre>
            </div>
          )}

          {issue.proof_summary && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 mb-6">
              <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
                Proof Summary
              </h3>
              <div className="text-sm text-[#e6edf3] leading-relaxed whitespace-pre-wrap">
                {issue.proof_summary}
              </div>
            </div>
          )}

          <IssueTabs issueId={issue.id} comments={comments} attachments={attachments} events={events} subIssues={subIssues} />

          {/* Comment input */}
          <CommentForm issueId={issue.id} companyId={issue.company_id} />
        </div>

        {/* Right: properties panel */}
        <div className="w-full lg:w-72 shrink-0">
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

            {skills.length > 0 && (
              <PropertyRow label="Skills">
                <div className="flex flex-wrap gap-1 justify-end">
                  {skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-block text-[10px] px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] text-[#8b949e] rounded font-mono"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </PropertyRow>
            )}

            {issue.branch_name && (
              <PropertyRow label="Branch">
                <span className="inline-block text-[11px] px-1.5 py-0.5 bg-[#0d1117] border border-[#30363d] text-[#58a6ff] rounded font-mono break-all">
                  {issue.branch_name}
                </span>
              </PropertyRow>
            )}

            {issue.pr_url && (
              <PropertyRow label="PR">
                <a
                  href={issue.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#58a6ff] hover:underline break-all"
                >
                  {issue.pr_url.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                </a>
              </PropertyRow>
            )}

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
