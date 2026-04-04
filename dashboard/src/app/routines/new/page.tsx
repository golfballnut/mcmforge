import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { createRoutine } from "./actions";

async function getFormData(companyId: string) {
  const supabase = await createForgeClient();

  const [{ data: agents }, { data: projects }] =
    await Promise.all([
      supabase.from("agents").select("id, name, icon, company_id").eq("company_id", companyId).order("name"),
      supabase.from("projects").select("id, name, company_id").eq("company_id", companyId).order("name"),
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

function SelectWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
        <svg className="w-4 h-4 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

const CRON_EXAMPLES = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily 9 AM", value: "0 9 * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "Mon–Fri 9 AM", value: "0 9 * * 1-5" },
];

export default async function NewRoutinePage() {
  const company = await getActiveCompany();
  const companyId = company?.id ?? "";
  const { agents, projects } = await getFormData(companyId);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] tracking-wide uppercase">
            New Routine
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Schedule a recurring agent task</p>
        </div>
        <Link
          href="/routines"
          className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Cancel
        </Link>
      </div>

      <form action={createRoutine} className="space-y-5">
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
            placeholder="e.g. Trail Data Health Check"
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
            rows={3}
            placeholder="What does this routine do?"
            className={INPUT_CLASS + " resize-y"}
          />
        </div>

        {/* Company (auto-set) + Priority */}
        <input type="hidden" name="company_id" value={companyId} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className={LABEL_CLASS}>Company</span>
            <p className="text-sm text-[#e6edf3] py-2">{company?.name ?? "—"}</p>
          </div>

          <div>
            <label htmlFor="priority" className={LABEL_CLASS}>
              Priority
            </label>
            <SelectWrapper>
              <select id="priority" name="priority" defaultValue="medium" className={SELECT_CLASS}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </SelectWrapper>
          </div>
        </div>

        {/* Assignee Agent */}
        <div>
          <label htmlFor="assignee_agent_id" className={LABEL_CLASS}>
            Assignee Agent <span className="text-[#f85149]">*</span>
          </label>
          <SelectWrapper>
            <select id="assignee_agent_id" name="assignee_agent_id" required defaultValue="" className={SELECT_CLASS}>
              <option value="" disabled>Select agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon ? `${a.icon} ` : ""}{a.name}
                </option>
              ))}
            </select>
          </SelectWrapper>
        </div>

        {/* Project */}
        <div>
          <label htmlFor="project_id" className={LABEL_CLASS}>
            Project
          </label>
          <SelectWrapper>
            <select id="project_id" name="project_id" defaultValue="" className={SELECT_CLASS}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </SelectWrapper>
        </div>

        {/* Cron Expression */}
        <div>
          <label htmlFor="cron_expression" className={LABEL_CLASS}>
            Cron Expression <span className="text-[#f85149]">*</span>
          </label>
          <input
            id="cron_expression"
            name="cron_expression"
            type="text"
            required
            placeholder="0 9 * * *"
            className={INPUT_CLASS + " font-mono"}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CRON_EXAMPLES.map((ex) => (
              <button
                key={ex.value}
                type="button"
                onClick={undefined}
                className="px-2 py-0.5 text-xs rounded bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:border-[#00d4aa] hover:text-[#00d4aa] transition-colors font-mono"
                data-cron={ex.value}
                title={ex.label}
              >
                {ex.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[#484f58]">
            5-field cron: minute hour day month weekday
          </p>
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="timezone" className={LABEL_CLASS}>
            Timezone
          </label>
          <input
            id="timezone"
            name="timezone"
            type="text"
            defaultValue="America/New_York"
            placeholder="America/New_York"
            className={INPUT_CLASS}
          />
        </div>

        {/* Concurrency + Catch-up policies */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="concurrency_policy" className={LABEL_CLASS}>
              Concurrency Policy
            </label>
            <SelectWrapper>
              <select id="concurrency_policy" name="concurrency_policy" defaultValue="skip_if_active" className={SELECT_CLASS}>
                <option value="skip_if_active">Skip if active</option>
                <option value="queue">Queue</option>
                <option value="coalesce">Coalesce</option>
              </select>
            </SelectWrapper>
          </div>

          <div>
            <label htmlFor="catch_up_policy" className={LABEL_CLASS}>
              Catch-up Policy
            </label>
            <SelectWrapper>
              <select id="catch_up_policy" name="catch_up_policy" defaultValue="skip_missed" className={SELECT_CLASS}>
                <option value="skip_missed">Skip missed</option>
                <option value="run_once">Run once</option>
                <option value="run_all">Run all</option>
              </select>
            </SelectWrapper>
          </div>
        </div>

        {/* Prompt Template */}
        <div>
          <label htmlFor="prompt_template" className={LABEL_CLASS}>
            Prompt Template
          </label>
          <textarea
            id="prompt_template"
            name="prompt_template"
            rows={4}
            placeholder="Instructions sent to the agent on each run. Leave blank to use the agent's default instructions."
            className={INPUT_CLASS + " resize-y font-mono text-xs"}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#30363d]">
          <Link
            href="/routines"
            className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-5 py-2 rounded-md bg-[#00d4aa] text-[#0d1117] text-sm font-semibold hover:bg-[#00e4b8] active:bg-[#00c49a] transition-colors"
          >
            Create Routine
          </button>
        </div>
      </form>
    </div>
  );
}
