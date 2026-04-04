import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { createGoal } from "./actions";

async function getFormData(companyId: string) {
  const supabase = await createForgeClient();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, level")
    .eq("company_id", companyId)
    .order("title");

  return { goals: goals ?? [] };
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

export default async function NewGoalPage() {
  const company = await getActiveCompany();
  const companyId = company?.id ?? "";
  const { goals } = await getFormData(companyId);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] tracking-wide uppercase">
            New Goal
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Define a company, team, or individual objective</p>
        </div>
        <Link
          href="/goals"
          className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Cancel
        </Link>
      </div>

      <form action={createGoal} className="space-y-5">
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
            placeholder="e.g. Ship DirtSync v2.0"
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
            rows={4}
            placeholder="Describe this goal..."
            className={INPUT_CLASS + " resize-y"}
          />
        </div>

        {/* Level + Company */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="level" className={LABEL_CLASS}>
              Level
            </label>
            <SelectWrapper>
              <select id="level" name="level" defaultValue="strategy" className={SELECT_CLASS}>
                <option value="vision">Vision</option>
                <option value="strategy">Strategy</option>
                <option value="task">Task</option>
              </select>
            </SelectWrapper>
          </div>

          <div>
            <span className={LABEL_CLASS}>Company</span>
            <p className="text-sm text-[#e6edf3] py-2">{company?.name ?? "—"}</p>
            <input type="hidden" name="company_id" value={companyId} />
          </div>
        </div>

        {/* Parent Goal */}
        {goals.length > 0 && (
          <div>
            <label htmlFor="parent_id" className={LABEL_CLASS}>
              Parent Goal
            </label>
            <SelectWrapper>
              <select id="parent_id" name="parent_id" defaultValue="" className={SELECT_CLASS}>
                <option value="">No parent (root goal)</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    [{g.level}] {g.title}
                  </option>
                ))}
              </select>
            </SelectWrapper>
            <p className="mt-1 text-xs text-[#484f58]">
              Nest this goal under an existing one to build a goal hierarchy.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#30363d]">
          <Link
            href="/goals"
            className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-5 py-2 rounded-md bg-[#00d4aa] text-[#0d1117] text-sm font-semibold hover:bg-[#00e4b8] active:bg-[#00c49a] transition-colors"
          >
            Create Goal
          </button>
        </div>
      </form>
    </div>
  );
}
