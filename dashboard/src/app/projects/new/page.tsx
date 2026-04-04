import { createForgeClient } from "@/lib/supabase/forge-server";
import Link from "next/link";
import { createProject } from "./actions";

async function getFormData() {
  const supabase = await createForgeClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .order("name");
  return { companies: companies ?? [] };
}

const INPUT_CLASS =
  "w-full px-3 py-2 rounded-md bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm placeholder-[#8b949e] focus:outline-none focus:border-[#00d4aa] focus:ring-1 focus:ring-[#00d4aa]/30 transition-colors";

const SELECT_CLASS =
  "w-full px-3 py-2 rounded-md bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm focus:outline-none focus:border-[#00d4aa] focus:ring-1 focus:ring-[#00d4aa]/30 transition-colors appearance-none";

const LABEL_CLASS = "block text-xs font-medium text-[#8b949e] mb-1.5 uppercase tracking-wide";

const COLOR_PRESETS = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#f78166",
  "#bc8cff",
  "#39d353",
  "#00d4aa",
  "#f0883e",
];

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

export default async function NewProjectPage() {
  const { companies } = await getFormData();

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] tracking-wide uppercase">
            New Project
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Create a new project workspace</p>
        </div>
        <Link
          href="/projects"
          className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Cancel
        </Link>
      </div>

      <form action={createProject} className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="name" className={LABEL_CLASS}>
            Name <span className="text-[#f85149]">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. DirtSync iOS App"
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
            placeholder="What is this project?"
            className={INPUT_CLASS + " resize-y"}
          />
        </div>

        {/* Company */}
        <div>
          <label htmlFor="company_id" className={LABEL_CLASS}>
            Company <span className="text-[#f85149]">*</span>
          </label>
          <SelectWrapper>
            <select id="company_id" name="company_id" required defaultValue="" className={SELECT_CLASS}>
              <option value="" disabled>Select company...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </SelectWrapper>
        </div>

        {/* Repo URL + Branch */}
        <div className="grid grid-cols-[1fr_160px] gap-4">
          <div>
            <label htmlFor="repo_url" className={LABEL_CLASS}>
              Repo URL
            </label>
            <input
              id="repo_url"
              name="repo_url"
              type="text"
              placeholder="https://github.com/org/repo"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="repo_branch" className={LABEL_CLASS}>
              Branch
            </label>
            <input
              id="repo_branch"
              name="repo_branch"
              type="text"
              defaultValue="main"
              placeholder="main"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* Workspace Dir */}
        <div>
          <label htmlFor="workspace_dir" className={LABEL_CLASS}>
            Workspace Directory
          </label>
          <input
            id="workspace_dir"
            name="workspace_dir"
            type="text"
            placeholder="/Users/stevemcmillian/..."
            className={INPUT_CLASS + " font-mono text-xs"}
          />
          <p className="mt-1 text-xs text-[#484f58]">
            Local path where agents will check out and run code.
          </p>
        </div>

        {/* Color + Target Date */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="color" className={LABEL_CLASS}>
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="color"
                name="color"
                type="text"
                placeholder="#58a6ff"
                className={INPUT_CLASS + " font-mono"}
              />
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {COLOR_PRESETS.map((color) => (
                <span
                  key={color}
                  className="w-5 h-5 rounded-full cursor-pointer border-2 border-transparent hover:border-white transition-colors shrink-0"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="target_date" className={LABEL_CLASS}>
              Target Date
            </label>
            <input
              id="target_date"
              name="target_date"
              type="date"
              className={INPUT_CLASS + " [color-scheme:dark]"}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#30363d]">
          <Link
            href="/projects"
            className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-5 py-2 rounded-md bg-[#00d4aa] text-[#0d1117] text-sm font-semibold hover:bg-[#00e4b8] active:bg-[#00c49a] transition-colors"
          >
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
}
