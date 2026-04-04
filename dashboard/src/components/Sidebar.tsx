"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createForgeBrowserClient } from "@/lib/supabase/forge-client";

// ─── Types ───────────────────────────────────────────────────────────────────

type Company = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type Agent = {
  id: string;
  name: string;
  role: string | null;
  icon: string | null;
  status: string;
  company_id: string | null;
};

type Project = {
  id: string;
  name: string;
  company_id: string | null;
  color?: string | null;
};

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconSearch() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
    </svg>
  );
}

function IconPlus({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4m8-4v4" />
    </svg>
  );
}

function IconIssues() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function IconRoutines() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconGoals() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

// ─── Project dot colors (cycle through these) ────────────────────────────────

const PROJECT_COLORS = [
  "#58a6ff", // blue
  "#3fb950", // green
  "#d29922", // yellow
  "#f78166", // orange
  "#bc8cff", // purple
  "#39d353", // bright green
  "#00d4aa", // teal
];

// ─── Nav link ─────────────────────────────────────────────────────────────────

function NavLink({
  href,
  icon,
  label,
  badge,
  badgeVariant = "default",
  isActive,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
  badgeVariant?: "default" | "cyan" | "beta";
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md mx-1 transition-colors ${
        isActive
          ? "bg-[#1c2333] text-[#e6edf3]"
          : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]"
      }`}
    >
      <span className="shrink-0 text-[#8b949e]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
            badgeVariant === "cyan"
              ? "bg-[#00d4aa]/15 text-[#00d4aa]"
              : badgeVariant === "beta"
              ? "bg-[#58a6ff]/15 text-[#58a6ff]"
              : "bg-[#21262d] text-[#8b949e]"
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  label,
  onAdd,
}: {
  label: string;
  onAdd?: () => void;
}) {
  return (
    <div className="px-4 pt-4 pb-1 flex items-center justify-between">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">
        {label}
      </span>
      {onAdd && (
        <button
          onClick={onAdd}
          className="text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          title={`Add ${label.toLowerCase()}`}
        >
          <IconPlus />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    const supabase = createForgeBrowserClient();

    async function fetchData() {
      const [companiesRes, agentsRes] = await Promise.all([
        supabase.from("companies").select("id, name, slug, status").order("name"),
        supabase.from("agents").select("id, name, role, icon, status, company_id").order("name"),
      ]);

      if (companiesRes.data) setCompanies(companiesRes.data as Company[]);
      if (agentsRes.data) {
        const agentData = agentsRes.data as Agent[];
        setAgents(agentData);
        setLiveCount(agentData.filter((a) => a.status === "running").length);
      }
    }

    fetchData();
  }, []);

  // Active company = first company (DirtSync) for now
  const activeCompany = companies[0];
  const activeCompanyName = activeCompany?.name ?? "MCM Forge";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex h-full">
      {/* ── Icon Rail ── */}
      <div className="w-12 bg-[#010409] border-r border-[#21262d] flex flex-col items-center py-3 shrink-0">
        {/* MCM Forge logo */}
        <div className="w-8 h-8 rounded-lg bg-[#00d4aa] flex items-center justify-center mb-4 shrink-0">
          <span className="text-[#010409] font-bold text-sm leading-none">M</span>
        </div>

        {/* Company icons */}
        {companies.map((company, idx) => {
          const isActiveCompany = idx === 0;
          return (
            <div
              key={company.id}
              title={company.name}
              className={`w-9 h-9 rounded-full flex items-center justify-center mb-2 cursor-pointer transition-all shrink-0 ${
                isActiveCompany
                  ? "ring-2 ring-[#00d4aa] ring-offset-1 ring-offset-[#010409]"
                  : "ring-2 ring-transparent hover:ring-[#30363d] ring-offset-1 ring-offset-[#010409]"
              } bg-[#161b22]`}
            >
              <span className="text-xs font-bold text-[#e6edf3]">
                {company.slug[0]?.toUpperCase() ?? company.name[0]?.toUpperCase()}
              </span>
            </div>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add company */}
        <button
          className="w-9 h-9 rounded-full border border-dashed border-[#30363d] flex items-center justify-center text-[#8b949e] hover:text-[#e6edf3] hover:border-[#8b949e] transition-colors shrink-0"
          title="Add company"
        >
          <IconPlus className="w-4 h-4" />
        </button>
      </div>

      {/* ── Main Sidebar ── */}
      <div className="w-[248px] bg-[#0d1117] flex flex-col min-h-0">
        {/* Company header */}
        <div className="px-4 py-3 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-[#e6edf3] truncate">
            {activeCompanyName}
          </span>
          <button className="text-[#8b949e] hover:text-[#e6edf3] transition-colors ml-2 shrink-0" title="Search">
            <IconSearch />
          </button>
        </div>

        {/* New Issue — subtle row, not a big button */}
        <div className="mx-1 mb-1">
          <Link
            href="/issues/new"
            className="flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9] transition-colors"
          >
            <span className="shrink-0 w-4 h-4 rounded-sm bg-[#21262d] flex items-center justify-center">
              <IconPlus className="w-2.5 h-2.5" />
            </span>
            <span>New Issue</span>
          </Link>
        </div>

        {/* Top nav: Dashboard + Inbox */}
        <div className="space-y-0.5 pb-1">
          <NavLink
            href="/"
            icon={<IconDashboard />}
            label="Dashboard"
            badge={liveCount > 0 ? `${liveCount} live` : undefined}
            badgeVariant="cyan"
            isActive={isActive("/")}
          />
          <NavLink
            href="/inbox"
            icon={<IconInbox />}
            label="Inbox"
            isActive={isActive("/inbox")}
          />
        </div>

        {/* WORK section */}
        <SectionHeader label="Work" />
        <div className="space-y-0.5 pb-1">
          <NavLink
            href="/issues"
            icon={<IconIssues />}
            label="Issues"
            isActive={isActive("/issues")}
          />
          <NavLink
            href="/routines"
            icon={<IconRoutines />}
            label="Routines"
            badge="Beta"
            badgeVariant="beta"
            isActive={isActive("/routines")}
          />
          <NavLink
            href="/goals"
            icon={<IconGoals />}
            label="Goals"
            isActive={isActive("/goals")}
          />
        </div>

        {/* PROJECTS section */}
        <SectionHeader label="Projects" onAdd={() => {}} />
        <div className="space-y-0.5 pb-1">
          {projects.length === 0 ? (
            // Fallback static project while loading / if empty
            <div className="flex items-center gap-2.5 px-4 py-1.5 text-sm text-[#8b949e]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: PROJECT_COLORS[0] }}
              />
              <span className="truncate">DirtSync iOS</span>
            </div>
          ) : (
            projects.map((project, idx) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center gap-2.5 px-4 py-1.5 text-sm text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9] transition-colors rounded-md mx-1"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: (project.color as string) ?? PROJECT_COLORS[idx % PROJECT_COLORS.length],
                  }}
                />
                <span className="truncate">{project.name}</span>
              </Link>
            ))
          )}
        </div>

        {/* AGENTS section — scrollable */}
        <SectionHeader label="Agents" onAdd={() => {}} />
        <div className="flex-1 overflow-y-auto pb-2 space-y-0.5 min-h-0">
          {agents.length === 0 ? (
            <p className="px-4 py-2 text-xs text-[#484f58]">No agents yet</p>
          ) : (
            agents.map((agent) => {
              const initials = agent.name
                .split(/[\s-_]+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("");
              const isRunning = agent.status === "running";

              return (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className={`flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md mx-1 transition-colors ${
                    isActive(`/agents/${agent.id}`)
                      ? "bg-[#1c2333] text-[#e6edf3]"
                      : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]"
                  }`}
                >
                  {/* Agent icon circle */}
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      isRunning
                        ? "bg-[#00d4aa]/20 text-[#00d4aa]"
                        : "bg-[#21262d] text-[#8b949e]"
                    }`}
                  >
                    {initials}
                  </span>
                  <span className="truncate flex-1">{agent.name}</span>
                  {isRunning && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa] shrink-0 animate-pulse" />
                  )}
                </Link>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-3 py-3 border-t border-[#21262d] flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors">
            <IconDoc />
            <span>Documentation</span>
          </button>
          <div className="flex-1" />
          <Link
            href="/settings"
            className="text-[#8b949e] hover:text-[#e6edf3] transition-colors"
            title="Settings"
          >
            <IconSettings />
          </Link>
        </div>
      </div>
    </div>
  );
}
