import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

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
  company: { name: string; slug: string } | null;
};

async function getProjects(companyId: string): Promise<Project[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("projects")
    .select("*, company:companies(name, slug)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return ((data as unknown) as Project[]) || [];
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string; text: string }> = {
  in_progress: { label: "In Progress", dot: "bg-[#d29922]", badge: "bg-[#3a2f00] border border-[#d29922]/30", text: "text-[#d29922]" },
  active:      { label: "Active",      dot: "bg-[#3fb950]", badge: "bg-[#0f2d1f] border border-[#3fb950]/30", text: "text-[#3fb950]" },
  planning:    { label: "Planning",    dot: "bg-[#58a6ff]", badge: "bg-[#1f3358] border border-[#58a6ff]/30", text: "text-[#58a6ff]" },
  paused:      { label: "Paused",      dot: "bg-[#8b949e]", badge: "bg-[#21262d] border border-[#30363d]",    text: "text-[#8b949e]" },
  archived:    { label: "Archived",    dot: "bg-[#484f58]", badge: "bg-[#161b22] border border-[#30363d]",    text: "text-[#484f58]" },
};

const PROJECT_COLORS = [
  "#58a6ff", "#3fb950", "#d29922", "#f78166", "#bc8cff", "#39d353", "#00d4aa",
];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.paused;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default async function ProjectsPage() {
  const company = await getActiveCompany();
  const projects = await getProjects(company?.id ?? "");

  const statusCounts = {
    active:      projects.filter((p) => p.status === "active").length,
    in_progress: projects.filter((p) => p.status === "in_progress").length,
    archived:    projects.filter((p) => p.status === "archived").length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Projects
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-[#161b22] border border-[#30363d] text-[#8b949e]">
            {projects.length}
          </span>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#00d4aa] text-[#00d4aa] text-sm font-medium hover:bg-[#00d4aa]/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          + Add Project
        </Link>
      </div>

      {/* Summary chips */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {statusCounts.in_progress > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#3a2f00] border border-[#d29922]/30 text-[#d29922] text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d29922]" />
              {statusCounts.in_progress} in progress
            </span>
          )}
          {statusCounts.active > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0f2d1f] border border-[#3fb950]/30 text-[#3fb950] text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
              {statusCounts.active} active
            </span>
          )}
          {statusCounts.archived > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#21262d] border border-[#30363d] text-[#8b949e] text-xs font-medium">
              {statusCounts.archived} archived
            </span>
          )}
        </div>
      )}

      {/* Cards */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <p className="text-[#8b949e] text-sm">No projects yet</p>
          <p className="text-[#8b949e] text-xs mt-1">Create your first project to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project, idx) => {
            const dotColor = (project.color as string) ?? PROJECT_COLORS[idx % PROJECT_COLORS.length];

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group flex flex-col bg-[#161b22] border border-[#30363d] rounded-lg p-5 gap-3 hover:border-[#8b949e] hover:bg-[#1c2333] transition-all"
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                      style={{ backgroundColor: dotColor }}
                    />
                    <h2 className="text-sm font-semibold text-[#e6edf3] group-hover:text-white truncate">
                      {project.name}
                    </h2>
                  </div>
                  <StatusBadge status={project.status} />
                </div>

                {/* Description */}
                {project.description ? (
                  <p className="text-xs text-[#8b949e] line-clamp-2 leading-relaxed">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-xs text-[#484f58] italic">No description</p>
                )}

                {/* Repo URL */}
                {project.repo_url && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <svg className="w-3 h-3 text-[#8b949e] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span className="text-xs font-mono text-[#8b949e] truncate">
                      {project.repo_url.replace(/^https?:\/\/(github\.com\/)?/, "")}
                    </span>
                  </div>
                )}

                {/* Footer: company + target date */}
                <div className="flex items-center justify-between pt-2 border-t border-[#21262d] mt-auto">
                  {project.company ? (
                    <span className="text-xs text-[#8b949e]">
                      {project.company.name}
                    </span>
                  ) : (
                    <span />
                  )}
                  {project.target_date && (
                    <span className="text-xs text-[#8b949e] font-mono">
                      {new Date(project.target_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
