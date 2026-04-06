"use client";

import { useEffect, useState } from "react";
import { createForgeBrowserClient } from "@/lib/supabase/forge-client";
import { useCompany } from "@/lib/company-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type SkillEntry = {
  name: string;
  agentNames: string[];
};

type AgentRow = {
  id: string;
  name: string;
  skills: string[] | null;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconSearch() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconSkill() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

// ─── Skill list item ──────────────────────────────────────────────────────────

function SkillItem({
  skill,
  isSelected,
  onClick,
}: {
  skill: SkillEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors border-b border-[#21262d] last:border-b-0 ${
        isSelected
          ? "bg-[#1c2333]"
          : "hover:bg-[#161b22]"
      }`}
    >
      <span className="mt-0.5 shrink-0 text-[#00d4aa]">
        <IconSkill />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${isSelected ? "text-[#e6edf3]" : "text-[#c9d1d9]"}`}>
          {skill.name}
        </p>
        <p className="text-xs text-[#8b949e] mt-0.5 truncate">
          {skill.agentNames.length === 1
            ? skill.agentNames[0]
            : `${skill.agentNames.length} agents`}
        </p>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const { activeCompany } = useCompany();
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [filtered, setFiltered] = useState<SkillEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SkillEntry | null>(null);
  const [activeTab, setActiveTab] = useState<"view" | "code">("view");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createForgeBrowserClient();

    async function load() {
      let q = supabase
        .from("agents")
        .select("id, name, skills")
        .not("skills", "is", null);
      if (activeCompany) {
        q = q.eq("company_id", activeCompany.id);
      }
      const { data } = await q;

      const agents = (data as AgentRow[]) || [];

      // Build skill -> agent[] map
      const map = new Map<string, string[]>();
      for (const agent of agents) {
        for (const skill of agent.skills ?? []) {
          if (!skill) continue;
          const existing = map.get(skill) ?? [];
          existing.push(agent.name);
          map.set(skill, existing);
        }
      }

      const list: SkillEntry[] = Array.from(map.entries())
        .map(([name, agentNames]) => ({ name, agentNames }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setSkills(list);
      setFiltered(list);
      setLoading(false);
    }

    load();
  }, [activeCompany]);

  // Filter by query
  useEffect(() => {
    if (!query.trim()) {
      setFiltered(skills);
    } else {
      const q = query.toLowerCase();
      setFiltered(skills.filter((s) => s.name.toLowerCase().includes(q)));
    }
  }, [query, skills]);

  return (
    <div className="flex h-[calc(100vh-56px)] -mx-6 -mt-6 overflow-hidden">
      {/* ── Left panel ── */}
      <div
        className="w-1/3 min-w-[220px] max-w-xs flex flex-col border-r border-[#30363d] bg-[#0d1117] shrink-0"
      >
        {/* Panel header */}
        <div className="px-3 py-3 border-b border-[#30363d] flex items-center gap-2 shrink-0">
          <h2 className="text-sm font-semibold text-[#e6edf3] flex-1">Skills</h2>
          <span className="text-xs font-mono text-[#8b949e] bg-[#161b22] px-1.5 py-0.5 rounded">
            {skills.length}
          </span>
          <button
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#30363d] text-xs text-[#8b949e] hover:text-[#e6edf3] hover:border-[#8b949e] transition-colors"
            title="Add skill"
          >
            <IconPlus />
            Add
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-[#21262d] shrink-0">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#161b22] border border-[#30363d]">
            <span className="text-[#8b949e]"><IconSearch /></span>
            <input
              type="text"
              placeholder="Filter skills..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-xs text-[#e6edf3] placeholder-[#8b949e] outline-none"
            />
          </div>
        </div>

        {/* Skill list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-6 text-xs text-[#8b949e] text-center">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-[#8b949e]">
                {skills.length === 0
                  ? "No skills assigned to agents yet"
                  : "No skills match your filter"}
              </p>
            </div>
          ) : (
            filtered.map((skill) => (
              <SkillItem
                key={skill.name}
                skill={skill}
                isSelected={selected?.name === skill.name}
                onClick={() => {
                  setSelected(skill);
                  setActiveTab("view");
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col bg-[#0d1117] min-w-0">
        {selected ? (
          <>
            {/* Right panel header */}
            <div className="px-6 py-3 border-b border-[#30363d] flex items-center gap-3 shrink-0">
              <span className="text-[#00d4aa]"><IconSkill /></span>
              <h2 className="text-base font-semibold text-[#e6edf3] flex-1 truncate">
                {selected.name}
              </h2>
              <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#30363d] text-xs text-[#8b949e] hover:text-[#e6edf3] hover:border-[#8b949e] transition-colors">
                <IconEdit />
                Edit
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-3 border-b border-[#30363d] shrink-0">
              {(["view", "code"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-sm rounded-t transition-colors capitalize ${
                    activeTab === tab
                      ? "bg-[#1c2333] text-[#e6edf3] border border-b-0 border-[#30363d]"
                      : "text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                >
                  {tab === "code" ? (
                    <span className="flex items-center gap-1.5">
                      <IconCode />
                      Code
                    </span>
                  ) : (
                    "View"
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "view" ? (
                <div className="space-y-6">
                  {/* Agents using this skill */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-3">
                      Assigned Agents
                    </h3>
                    {selected.agentNames.length === 0 ? (
                      <p className="text-sm text-[#8b949e]">No agents assigned</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selected.agentNames.map((name) => {
                          const initials = name
                            .split(/[\s\-_]+/)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() ?? "")
                            .join("");
                          return (
                            <div
                              key={name}
                              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#161b22] border border-[#30363d]"
                            >
                              <span className="w-5 h-5 rounded-full bg-[#00d4aa]/20 text-[#00d4aa] text-[9px] font-bold flex items-center justify-center shrink-0">
                                {initials}
                              </span>
                              <span className="text-xs text-[#c9d1d9]">{name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Placeholder content area */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-3">
                      Skill Content
                    </h3>
                    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-8 text-center">
                      <p className="text-sm text-[#8b949e]">
                        Skill file content not yet available.
                      </p>
                      <p className="text-xs text-[#484f58] mt-1">
                        Skills are stored as vault markdown files on the local filesystem.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Code tab */
                <div className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
                  <div className="px-4 py-2 border-b border-[#30363d] flex items-center gap-2">
                    <span className="text-[#8b949e]"><IconCode /></span>
                    <span className="text-xs font-mono text-[#8b949e]">
                      vault/agents/skills/{selected.name}.md
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-mono text-[#8b949e]">
                      # File viewer not yet implemented
                    </p>
                    <p className="text-xs font-mono text-[#484f58] mt-1">
                      # Skill files live on the local filesystem
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center mx-auto mb-3">
                <span className="text-[#8b949e]">
                  <IconSkill />
                </span>
              </div>
              <p className="text-sm text-[#8b949e]">Select a skill to view its content</p>
              <p className="text-xs text-[#484f58] mt-1">
                {skills.length > 0
                  ? `${skills.length} skill${skills.length === 1 ? "" : "s"} found across your agents`
                  : "Assign skills to agents to see them here"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
