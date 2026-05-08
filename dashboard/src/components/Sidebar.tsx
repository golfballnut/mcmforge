"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createForgeBrowserClient } from "@/lib/supabase/forge-client";
import { useCompany } from "@/lib/company-context";

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

function IconSkills() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
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

function IconOrg() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconCosts() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function IconKnowledge() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function IconChangelogs() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3M12 3a9 9 0 100 18 9 9 0 000-18zM3 12l-1 1m18-1l1 1" />
    </svg>
  );
}

function IconRuns() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconApprovals() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconCRM() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
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

const STORAGE_KEY_AGENTS = "sidebar_agents_collapsed";
const STORAGE_KEY_PROJECTS = "sidebar_projects_collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeCompany: ctxCompany, companies: ctxCompanies, setActiveCompany } = useCompany();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);

  // Collapse state — default collapsed per FORGE-363 spec
  const [agentsCollapsed, setAgentsCollapsed] = useState(true);
  const [projectsCollapsed, setProjectsCollapsed] = useState(true);
  const [collapseHydrated, setCollapseHydrated] = useState(false);

  // Derive companies list from context for icon rail
  const companies = ctxCompanies.map(c => ({ ...c, status: "active" }));

  useEffect(() => {
    if (!ctxCompany) return;
    const companyId = ctxCompany.id;
    const supabase = createForgeBrowserClient();

    async function fetchData() {
      // Fetch agents for this company
      const agentsRes = await supabase
        .from("agents")
        .select("id, name, role, icon, status, company_id")
        .eq("company_id", companyId)
        .order("name");

      if (agentsRes.data) {
        setAgents(agentsRes.data as Agent[]);
      }

      // Fetch projects for this company
      const projectsRes = await supabase
        .from("projects")
        .select("id, name, company_id, color")
        .eq("company_id", companyId)
        .order("name");

      if (projectsRes.data) {
        setProjects(projectsRes.data as Project[]);
      }

      // Fetch inbox count: failed + running runs for agents in this company
      const agentIds = (agentsRes.data ?? []).map((a: Agent) => a.id);
      if (agentIds.length > 0) {
        const runsRes = await supabase
          .from("runs")
          .select("id", { count: "exact", head: true })
          .in("agent_id", agentIds)
          .in("status", ["failed", "running"]);
        setInboxCount(runsRes.count ?? 0);
      } else {
        setInboxCount(0);
      }
    }

    fetchData();
  }, [ctxCompany?.id]);

  // Hydrate collapse state from localStorage (runs once on mount)
  useEffect(() => {
    try {
      const storedAgents = localStorage.getItem(STORAGE_KEY_AGENTS);
      const storedProjects = localStorage.getItem(STORAGE_KEY_PROJECTS);
      if (storedAgents !== null) setAgentsCollapsed(storedAgents === "true");
      if (storedProjects !== null) setProjectsCollapsed(storedProjects === "true");
    } catch {
      // localStorage not available (SSR guard)
    }
    setCollapseHydrated(true);
  }, []);

  function toggleAgents() {
    const next = !agentsCollapsed;
    setAgentsCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY_AGENTS, String(next)); } catch {}
  }

  function toggleProjects() {
    const next = !projectsCollapsed;
    setProjectsCollapsed(next);
    try { localStorage.setItem(STORAGE_KEY_PROJECTS, String(next)); } catch {}
  }

  useEffect(() => {
    setLiveCount(agents.filter((a) => a.status === "running").length);
  }, [agents]);

  const activeCompanyName = ctxCompany?.name ?? "MCM Forge";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex h-full">
      {/* ── Icon Rail ── */}
      <div className="w-12 bg-[#010409] border-r border-[#21262d] flex flex-col items-center py-3 shrink-0">
        {/* MCM Forge logo */}
        <div className="w-8 h-8 rounded-lg bg-[#00d4aa] flex items-center justify-center mb-4 shrink-0">
          <span className="text-[#010409] font-bold text-sm leading-none">{(ctxCompany?.name ?? "MCM Forge").charAt(0).toUpperCase()}</span>
        </div>

        {/* Company icons */}
        {companies.map((company) => {
          const isActiveCompany = ctxCompany?.id === company.id;
          return (
            <div
              key={company.id}
              title={company.name}
              onClick={async () => {
                // Await so the cookie is written (via document.cookie + API)
                // before router.refresh() triggers a server re-render. Without
                // awaiting, the server read the stale cookie and rendered the
                // previous company's data (root cause of "routes get confused").
                await setActiveCompany({ ...company, issue_prefix: "" });
                router.refresh();
              }}
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
      <div className="w-[248px] bg-[#0d1117] flex flex-col h-full overflow-hidden">
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
            badge={liveCount > 0 ? `${liveCount} live` : agents.length > 0 ? `${agents.length}` : undefined}
            badgeVariant={liveCount > 0 ? "cyan" : "default"}
            isActive={isActive("/")}
          />
          <NavLink
            href="/inbox"
            icon={<IconInbox />}
            label="Inbox"
            badge={inboxCount > 0 ? inboxCount : undefined}
            badgeVariant="default"
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
            href="/crm"
            icon={<IconCRM />}
            label="CRM"
            isActive={isActive("/crm")}
          />
          <NavLink
            href="/knowledge"
            icon={<IconKnowledge />}
            label="Knowledge"
            isActive={isActive("/knowledge")}
          />
          <NavLink
            href="/changelogs"
            icon={<IconChangelogs />}
            label="Changelogs"
            isActive={isActive("/changelogs")}
          />
          <NavLink
            href="/runs"
            icon={<IconRuns />}
            label="Runs"
            isActive={isActive("/runs")}
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
          <NavLink
            href="/approvals"
            icon={<IconApprovals />}
            label="Approvals"
            isActive={isActive("/approvals")}
          />
        </div>

        {/* PROJECTS section — collapsible */}
        <button
          data-testid="sidebar-projects-group-label"
          onClick={toggleProjects}
          className="px-4 pt-4 pb-1 flex items-center justify-between w-full text-left focus:outline-none"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">
            Projects
          </span>
          <svg
            className={`w-3 h-3 text-[#8b949e] transition-transform ${projectsCollapsed ? "" : "rotate-180"}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          data-testid="sidebar-projects-list"
          className="space-y-0.5 pb-1"
          style={{ display: projectsCollapsed ? "none" : undefined }}
        >
          {projects.length === 0 ? (
            <p className="px-4 py-1.5 text-xs text-[#484f58]">No projects</p>
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

        {/* AGENTS section — collapsible with localStorage persistence */}
        <button
          data-testid="sidebar-agents-group-label"
          onClick={toggleAgents}
          className="px-4 pt-4 pb-1 flex items-center justify-between w-full text-left focus:outline-none"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">
            Agents
          </span>
          <span className="text-[#8b949e] flex items-center gap-1">
            {liveCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#00d4aa]/15 text-[#00d4aa]">
                {liveCount} live
              </span>
            )}
            <svg
              className={`w-3 h-3 transition-transform ${agentsCollapsed ? "" : "rotate-180"}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        <div
          data-testid="sidebar-agents-list"
          className="overflow-y-auto pb-2 space-y-0.5 min-h-0"
          style={{
            flex: agentsCollapsed ? "0 0 0px" : "1 1 auto",
            overflow: agentsCollapsed ? "hidden" : undefined,
            display: agentsCollapsed ? "none" : undefined,
          }}
        >
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
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-[#00d4aa] shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa] animate-pulse" />
                      live
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </div>

        {/* Spacer — pushes Company section to bottom when agents collapsed */}
        <div className="flex-1" />

        {/* COMPANY section — fixed at bottom */}
        <div className="shrink-0 border-t border-[#21262d]">
          <SectionHeader label="Company" />
          <div className="space-y-0.5 pb-1">
            <NavLink
              href="/org"
              icon={<IconOrg />}
              label="Org"
              isActive={isActive("/org")}
            />
            <NavLink
              href="/skills"
              icon={<IconSkills />}
              label="Skills"
              isActive={isActive("/skills")}
            />
            <NavLink
              href="/costs"
              icon={<IconCosts />}
              label="Costs"
              isActive={isActive("/costs")}
            />
            <NavLink
              href="/activity"
              icon={<IconActivity />}
              label="Activity"
              isActive={isActive("/activity")}
            />
            <NavLink
              href="/settings"
              icon={<IconSettings />}
              label="Settings"
              isActive={isActive("/settings")}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-3 py-2 border-t border-[#21262d] flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors">
            <IconDoc />
            <span>Documentation</span>
          </button>
        </div>
      </div>
    </div>
  );
}
