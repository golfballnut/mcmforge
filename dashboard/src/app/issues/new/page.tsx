import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { createIssue } from "./actions";

async function getFormData(companyId: string) {
  const supabase = await createForgeClient();

  const [{ data: agents }, { data: projects }] =
    await Promise.all([
      supabase.from("agents").select("id, name, icon").eq("company_id", companyId).order("name"),
      supabase.from("projects").select("id, name").eq("company_id", companyId).order("name"),
    ]);

  return {
    agents: agents ?? [],
    projects: projects ?? [],
  };
}

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-md bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm placeholder-[#8b949e] focus:outline-none focus:border-[#00d4aa] focus:ring-1 focus:ring-[#00d4aa]/30 transition-colors";

const SELECT_CLASS =
  "w-full px-3 py-2 rounded-md bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm focus:outline-none focus:border-[#00d4aa] focus:ring-1 focus:ring-[#00d4aa]/30 transition-colors appearance-none";

const LABEL_CLASS = "block text-xs font-medium text-[#8b949e] mb-1.5 uppercase tracking-wide";

export default async function NewIssuePage() {
  const company = await getActiveCompany();
  const companyId = company?.id ?? "";
  const { agents, projects } = await getFormData(companyId);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] tracking-wide uppercase">
            New Issue
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Create a new issue</p>
        </div>
        <Link
          href="/issues"
          className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Cancel
        </Link>
      </div>

      {/* Form */}
      <form action={createIssue} className="space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="title" className={LABEL_CLASS}>
            Title <span className="text-[#f85149]">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="Issue title..."
            autoFocus
            className={INPUT_CLASS}
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className={LABEL_CLASS}>
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={6}
            placeholder="Describe the issue..."
            className={INPUT_CLASS + " resize-y min-h-[120px]"}
          />
        </div>

        {/* Priority + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="priority" className={LABEL_CLASS}>
              Priority
            </label>
            <div className="relative">
              <select id="priority" name="priority" defaultValue="medium" className={SELECT_CLASS}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="status" className={LABEL_CLASS}>
              Status
            </label>
            <div className="relative">
              <select id="status" name="status" defaultValue="todo" className={SELECT_CLASS}>
                <option value="backlog">Backlog</option>
                <option value="todo">Todo</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Company — auto-set from active company */}
        <input type="hidden" name="company_id" value={companyId} />
        {company && (
          <div>
            <span className={LABEL_CLASS}>Company</span>
            <p className="text-sm text-[#e6edf3]">{company.name}{company.issue_prefix ? ` (${company.issue_prefix})` : ""}</p>
          </div>
        )}

        {/* Assignee */}
        <div>
          <label htmlFor="assignee_agent_id" className={LABEL_CLASS}>
            Assignee
          </label>
          <div className="relative">
            <select id="assignee_agent_id" name="assignee_agent_id" defaultValue="" className={SELECT_CLASS}>
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon ? `${a.icon} ` : ""}{a.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
              <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Project */}
        <div>
          <label htmlFor="project_id" className={LABEL_CLASS}>
            Project
          </label>
          <div className="relative">
            <select id="project_id" name="project_id" defaultValue="" className={SELECT_CLASS}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
              <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#30363d]">
          <Link
            href="/issues"
            className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-5 py-2 rounded-md bg-[#00d4aa] text-[#0d1117] text-sm font-semibold hover:bg-[#00e4b8] active:bg-[#00c49a] transition-colors"
          >
            Create Issue
          </button>
        </div>
      </form>
    </div>
  );
}
