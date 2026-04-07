import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 30;

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  repo_url: string | null;
  repo_branch: string | null;
  workspace_dir: string | null;
  color: string | null;
  target_date: string | null;
  company_id: string;
  created_at: string;
  updated_at: string;
  company: { id: string; name: string; slug: string } | null;
};

type Issue = {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  priority: string;
  assignee_agent_id: string | null;
  created_at: string;
  agent_name?: string | null;
};

type Agent = {
  id: string;
  name: string;
  role: string | null;
  icon: string | null;
  status: string;
};

async function getProject(id: string) {
  const supabase = await createForgeClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*, company:companies(id, name, slug)")
    .eq("id", id)
    .single();

  if (!project) return null;
  const company = await getActiveCompany();
  if (company && project.company_id !== company.id) return null;

  // Issues for this project
  const { data: rawIssues } = await supabase
    .from("issues")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const issues: Issue[] = rawIssues || [];

  // Resolve assignee names
  const agentIds = [...new Set(issues.map((i) => i.assignee_agent_id).filter(Boolean))];
  let agentMap: Record<string, string> = {};
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name")
      .in("id", agentIds);
    if (agents) agentMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  }

  const issuesWithAgents: Issue[] = issues.map((i) => ({
    ...i,
    agent_name: i.assignee_agent_id ? agentMap[i.assignee_agent_id] ?? null : null,
  }));

  // Agents assigned to this project
  let projectAgents: Agent[] = [];
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, role, icon, status")
    .eq("project_id", id)
    .order("name");
  projectAgents = (agents as Agent[]) || [];

  return { project: project as unknown as Project, issues: issuesWithAgents, agents: projectAgents };
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

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string; text: string }> = {
  in_progress: { label: "In Progress", dot: "bg-[#d29922]", badge: "bg-[#3a2f00] border border-[#d29922]/30", text: "text-[#d29922]" },
  active:      { label: "Active",      dot: "bg-[#3fb950]", badge: "bg-[#0f2d1f] border border-[#3fb950]/30", text: "text-[#3fb950]" },
  planning:    { label: "Planning",    dot: "bg-[#58a6ff]", badge: "bg-[#1f3358] border border-[#58a6ff]/30", text: "text-[#58a6ff]" },
  paused:      { label: "Paused",      dot: "bg-[#8b949e]", badge: "bg-[#21262d] border border-[#30363d]",    text: "text-[#8b949e]" },
  archived:    { label: "Archived",    dot: "bg-[#484f58]", badge: "bg-[#161b22] border border-[#30363d]",    text: "text-[#484f58]" },
};

const ISSUE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  backlog:     { label: "Backlog",     color: "bg-[#30363d] text-[#8b949e]" },
  todo:        { label: "Todo",        color: "bg-[#1f3358] text-[#58a6ff]" },
  in_progress: { label: "In Progress", color: "bg-[#3a2f00] text-[#d29922]" },
  in_review:   { label: "In Review",   color: "bg-[#2b1f5c] text-[#a371f7]" },
  done:        { label: "Done",        color: "bg-[#0f2d1f] text-[#3fb950]" },
  cancelled:   { label: "Cancelled",   color: "bg-[#3d1f1f] text-[#f85149]" },
};

const AGENT_STATUS_CONFIG: Record<string, { dot: string }> = {
  idle:       { dot: "bg-[#3fb950]" },
  running:    { dot: "bg-[#58a6ff]" },
  paused:     { dot: "bg-[#d29922]" },
  error:      { dot: "bg-[#f85149]" },
  terminated: { dot: "bg-[#8b949e]" },
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getProject(id);

  if (!result) return notFound();

  const { project, issues, agents } = result;
  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.paused;

  const openIssues = issues.filter((i) => !["done", "cancelled"].includes(i.status));
  const closedIssues = issues.filter((i) => ["done", "cancelled"].includes(i.status));

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#8b949e] mb-5">
        <Link href="/projects" className="hover:text-[#e6edf3] transition-colors">
          Projects
        </Link>
        <span>/</span>
        <span className="text-[#e6edf3]">{project.name}</span>
      </div>

      {/* Project header */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              {project.color && (
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: project.color }}
                />
              )}
              <h1 className="text-xl font-semibold text-[#e6edf3]">{project.name}</h1>
            </div>
            {project.description && (
              <p className="text-sm text-[#8b949e] leading-relaxed max-w-2xl">
                {project.description}
              </p>
            )}
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${statusCfg.badge} ${statusCfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>

        {/* Meta fields */}
        <div className="mt-5 pt-4 border-t border-[#21262d] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {project.company && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e] mb-0.5">Company</p>
              <p className="text-sm text-[#e6edf3]">{project.company.name}</p>
            </div>
          )}
          {project.repo_url && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e] mb-0.5">Repository</p>
              <a
                href={project.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-[#58a6ff] hover:underline truncate block"
              >
                {project.repo_url.replace(/^https?:\/\/(github\.com\/)?/, "")}
              </a>
              {project.repo_branch && (
                <p className="text-xs text-[#8b949e] mt-0.5 font-mono">{project.repo_branch}</p>
              )}
            </div>
          )}
          {project.workspace_dir && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e] mb-0.5">Workspace</p>
              <p className="text-xs font-mono text-[#8b949e] truncate">{project.workspace_dir}</p>
            </div>
          )}
          {project.target_date && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e] mb-0.5">Target Date</p>
              <p className="text-sm text-[#e6edf3]">
                {new Date(project.target_date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e] mb-0.5">Created</p>
            <p className="text-sm text-[#8b949e]">{formatRelativeTime(project.created_at)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Issues — takes 2/3 */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#e6edf3] uppercase tracking-wide">Issues</h2>
              <span className="px-1.5 py-0.5 text-xs font-mono rounded bg-[#21262d] text-[#8b949e]">
                {issues.length}
              </span>
            </div>
            <div className="text-xs text-[#8b949e]">
              <span className="text-[#e6edf3] font-medium">{openIssues.length}</span> open &middot;{" "}
              {closedIssues.length} closed
            </div>
          </div>

          {issues.length === 0 ? (
            <div className="border border-[#30363d] rounded-lg p-8 text-center text-[#8b949e] text-sm bg-[#161b22]">
              No issues in this project yet
            </div>
          ) : (
            <div className="border border-[#30363d] rounded-lg overflow-hidden">
              {/* Column header */}
              <div className="grid grid-cols-[1fr_120px_140px_80px] gap-0 px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
                <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Title</span>
                <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Status</span>
                <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Assignee</span>
                <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider text-right">Created</span>
              </div>

              {issues.map((issue) => {
                const issCfg = ISSUE_STATUS_CONFIG[issue.status] ?? { label: issue.status, color: "bg-[#30363d] text-[#8b949e]" };
                return (
                  <Link
                    key={issue.id}
                    href={`/issues/${issue.id}`}
                    className="grid grid-cols-[1fr_120px_140px_80px] gap-0 px-4 py-3 bg-[#0d1117] border-b border-[#21262d] last:border-b-0 hover:bg-[#161b22] transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <span className="text-sm text-[#e6edf3] truncate block">{issue.title}</span>
                      {issue.identifier && (
                        <span className="text-xs font-mono text-[#8b949e]">{issue.identifier}</span>
                      )}
                    </div>
                    <div className="flex items-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${issCfg.color}`}>
                        {issCfg.label}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs text-[#8b949e] truncate">
                        {issue.agent_name ?? <span className="text-[#484f58]">Unassigned</span>}
                      </span>
                    </div>
                    <div className="flex items-center justify-end">
                      <span className="text-xs text-[#8b949e]">{formatRelativeTime(issue.created_at)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Agents sidebar — 1/3 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-[#e6edf3] uppercase tracking-wide">Agents</h2>
            <span className="px-1.5 py-0.5 text-xs font-mono rounded bg-[#21262d] text-[#8b949e]">
              {agents.length}
            </span>
          </div>

          {agents.length === 0 ? (
            <div className="border border-[#30363d] rounded-lg p-6 text-center text-[#8b949e] text-sm bg-[#161b22]">
              No agents assigned
            </div>
          ) : (
            <div className="border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#21262d]">
              {agents.map((agent) => {
                const agentStatusCfg = AGENT_STATUS_CONFIG[agent.status] ?? { dot: "bg-[#8b949e]" };
                const initials = agent.name
                  .split(/[\s\-_]+/)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? "")
                  .join("");

                return (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className="flex items-center gap-3 px-4 py-3 bg-[#161b22] hover:bg-[#1c2333] transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-7 h-7 rounded-full bg-[#21262d] flex items-center justify-center text-[10px] font-bold text-[#8b949e] shrink-0">
                      {agent.icon ?? initials}
                    </div>

                    {/* Name + role */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#e6edf3] truncate">{agent.name}</p>
                      {agent.role && (
                        <p className="text-xs text-[#8b949e] truncate">{agent.role}</p>
                      )}
                    </div>

                    {/* Status dot */}
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${agentStatusCfg.dot} ${
                        agent.status === "running" ? "animate-pulse" : ""
                      }`}
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
