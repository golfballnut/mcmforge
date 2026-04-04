import { createForgeClient } from "@/lib/supabase/forge-server";
import Link from "next/link";
import { createAgent } from "./actions";

async function getFormData() {
  const supabase = await createForgeClient();

  const [{ data: companies }, { data: agents }] = await Promise.all([
    supabase.from("companies").select("id, name, slug").order("name"),
    supabase.from("agents").select("id, name, icon").order("name"),
  ]);

  return { companies: companies ?? [], agents: agents ?? [] };
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

export default async function NewAgentPage() {
  const { companies, agents } = await getFormData();

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] tracking-wide uppercase">
            New Agent
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Register a new AI agent</p>
        </div>
        <Link
          href="/agents"
          className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Cancel
        </Link>
      </div>

      <form action={createAgent} className="space-y-5">
        {/* Name + Icon */}
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <div>
            <label htmlFor="name" className={LABEL_CLASS}>
              Name <span className="text-[#f85149]">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Map View Engineer"
              autoFocus
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="icon" className={LABEL_CLASS}>
              Icon
            </label>
            <input
              id="icon"
              name="icon"
              type="text"
              placeholder="🤖"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className={LABEL_CLASS}>
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            placeholder="e.g. Senior iOS Engineer"
            className={INPUT_CLASS}
          />
        </div>

        {/* Role + Company */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="role" className={LABEL_CLASS}>
              Role
            </label>
            <SelectWrapper>
              <select id="role" name="role" defaultValue="engineer" className={SELECT_CLASS}>
                <option value="engineer">Engineer</option>
                <option value="manager">Manager</option>
                <option value="scout">Scout</option>
                <option value="routine">Routine</option>
              </select>
            </SelectWrapper>
          </div>

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
        </div>

        {/* Adapter Type + Model */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="adapter_type" className={LABEL_CLASS}>
              Adapter
            </label>
            <SelectWrapper>
              <select id="adapter_type" name="adapter_type" defaultValue="claude" className={SELECT_CLASS}>
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="codex">Codex</option>
              </select>
            </SelectWrapper>
          </div>

          <div>
            <label htmlFor="model" className={LABEL_CLASS}>
              Model
            </label>
            <input
              id="model"
              name="model"
              type="text"
              placeholder="claude-sonnet-4-20250514"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* Max Turns + Timeout */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="max_turns" className={LABEL_CLASS}>
              Max Turns
            </label>
            <input
              id="max_turns"
              name="max_turns"
              type="number"
              min={1}
              max={100}
              defaultValue={10}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="timeout_sec" className={LABEL_CLASS}>
              Timeout (seconds)
            </label>
            <input
              id="timeout_sec"
              name="timeout_sec"
              type="number"
              min={30}
              max={3600}
              defaultValue={300}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        {/* Reports To */}
        <div>
          <label htmlFor="reports_to" className={LABEL_CLASS}>
            Reports To
          </label>
          <SelectWrapper>
            <select id="reports_to" name="reports_to" defaultValue="" className={SELECT_CLASS}>
              <option value="">None</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon ? `${a.icon} ` : ""}{a.name}
                </option>
              ))}
            </select>
          </SelectWrapper>
        </div>

        {/* Instructions File */}
        <div>
          <label htmlFor="instructions_file" className={LABEL_CLASS}>
            Instructions File
          </label>
          <input
            id="instructions_file"
            name="instructions_file"
            type="text"
            placeholder="vault/agents/skills/my-agent.md"
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-[#8b949e]">
            Path to the skill/instructions markdown file loaded at runtime.
          </p>
        </div>

        {/* Skip Permissions */}
        <div className="flex items-center gap-3">
          <input
            id="skip_permissions"
            name="skip_permissions"
            type="checkbox"
            defaultChecked
            className="w-4 h-4 rounded border-[#30363d] bg-[#0d1117] text-[#00d4aa] focus:ring-[#00d4aa]/30 accent-[#00d4aa]"
          />
          <label htmlFor="skip_permissions" className="text-sm text-[#8b949e]">
            Skip permission prompts{" "}
            <span className="text-[#484f58]">(dangerouslySkipPermissions)</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#30363d]">
          <Link
            href="/agents"
            className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-5 py-2 rounded-md bg-[#00d4aa] text-[#0d1117] text-sm font-semibold hover:bg-[#00e4b8] active:bg-[#00c49a] transition-colors"
          >
            Create Agent
          </button>
        </div>
      </form>
    </div>
  );
}
