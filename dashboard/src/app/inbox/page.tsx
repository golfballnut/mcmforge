import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

type Run = {
  id: string;
  agent_id: string;
  status: string;
  summary: string | null;
  trigger_detail: string | null;
  context_snapshot: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  agent: { name: string; icon: string | null } | null;
};

type IssueRef = {
  id: string;
  identifier: string | null;
  title: string;
};

async function getRuns(companyId: string): Promise<{ runs: Run[]; issueMap: Record<string, IssueRef> }> {
  const supabase = await createForgeClient();

  // Get agent IDs for this company
  const { data: companyAgents } = await supabase
    .from("agents")
    .select("id")
    .eq("company_id", companyId);
  const agentIds = (companyAgents ?? []).map((a) => a.id);
  if (agentIds.length === 0) return { runs: [], issueMap: {} };

  const { data } = await supabase
    .from("runs")
    .select("id, agent_id, status, summary, trigger_detail, context_snapshot, created_at, started_at, finished_at, agent:agents(name, icon)")
    .in("agent_id", agentIds)
    .order("created_at", { ascending: false })
    .limit(50);

  const runs = ((data as unknown) as Run[]) || [];

  // Collect issue IDs referenced in context_snapshot.issueId
  const issueIds = [
    ...new Set(
      runs
        .map((r) => r.context_snapshot?.issueId as string | undefined)
        .filter(Boolean) as string[]
    ),
  ];

  let issueMap: Record<string, IssueRef> = {};
  if (issueIds.length > 0) {
    const { data: issues } = await supabase
      .from("issues")
      .select("id, identifier, title")
      .in("id", issueIds);
    if (issues) {
      issueMap = Object.fromEntries(issues.map((i) => [i.id, i as IssueRef]));
    }
  }

  return { runs, issueMap };
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "--";
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

function agentInitials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const STATUS_DOT: Record<string, { color: string; pulse?: boolean; label: string }> = {
  succeeded: { color: "bg-[#3fb950]",   label: "Succeeded" },
  failed:    { color: "bg-[#f85149]",   label: "Failed" },
  running:   { color: "bg-[#58a6ff]",   label: "Running", pulse: true },
  queued:    { color: "bg-[#8b949e]",   label: "Queued" },
  timed_out: { color: "bg-[#d29922]",   label: "Timed Out" },
  cancelled: { color: "bg-[#8b949e]",   label: "Cancelled" },
};

const TABS = [
  { key: "recent", label: "Recent" },
  { key: "unread", label: "Unread" },
  { key: "all",    label: "All" },
];

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab = params?.tab ?? "recent";

  const company = await getActiveCompany();
  const { runs, issueMap } = await getRuns(company?.id ?? "");

  // Tab filtering
  const filtered =
    activeTab === "unread"
      ? runs.filter((r) => r.status === "failed" || r.status === "running")
      : activeTab === "recent"
      ? runs.slice(0, 20)
      : runs;

  const failedCount = runs.filter((r) => r.status === "failed").length;
  const runningCount = runs.filter((r) => r.status === "running").length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Inbox
          </h1>
          {(failedCount > 0 || runningCount > 0) && (
            <div className="flex items-center gap-2">
              {runningCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse" />
                  {runningCount} live
                </span>
              )}
              {failedCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-xs font-medium">
                  {failedCount} failed
                </span>
              )}
            </div>
          )}
        </div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8b949e] border border-[#30363d] rounded-md hover:border-[#58a6ff] hover:text-[#e6edf3] transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Mark all as read
        </button>
      </div>

      {/* Tab row */}
      <div className="flex gap-1 mb-4 border-b border-[#30363d]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/inbox?tab=${tab.key}`}
              className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
                isActive
                  ? "bg-[#1c2333] text-[#e6edf3] border border-b-0 border-[#30363d]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {tab.label}
              {tab.key === "unread" && (failedCount + runningCount) > 0 && (
                <span className="ml-1.5 text-xs font-mono text-[#f85149]">
                  {failedCount + runningCount}
                </span>
              )}
              {tab.key === "all" && (
                <span className="ml-1.5 text-xs font-mono text-[#8b949e]">
                  {runs.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4m8-4v4" />
            </svg>
          </div>
          <p className="text-[#8b949e] text-sm">All caught up</p>
          <p className="text-[#8b949e] text-xs mt-1">No notifications to show</p>
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-lg overflow-hidden">
          {filtered.map((run) => {
            const dotCfg = STATUS_DOT[run.status] ?? { color: "bg-[#8b949e]", label: run.status };
            const agentName = run.agent?.name ?? "Unknown Agent";
            const agentIcon = run.agent?.icon;
            const initials = agentInitials(agentName);

            const issueId = run.context_snapshot?.issueId as string | undefined;
            const issueRef = issueId ? issueMap[issueId] : null;

            const title =
              run.summary ||
              run.trigger_detail ||
              (issueRef ? issueRef.title : null) ||
              `Run ${run.id.slice(0, 8)}`;

            return (
              <div
                key={run.id}
                className="flex items-start gap-4 px-4 py-4 bg-[#0d1117] border-b border-[#21262d] last:border-b-0 hover:bg-[#161b22] transition-colors group"
              >
                {/* Status dot */}
                <div className="shrink-0 mt-1.5">
                  <span
                    className={`w-2 h-2 rounded-full block ${dotCfg.color} ${
                      dotCfg.pulse ? "animate-pulse" : ""
                    }`}
                    title={dotCfg.label}
                  />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    {issueRef && (
                      <Link
                        href={`/issues/${issueRef.id}`}
                        className="text-xs font-mono text-[#58a6ff] hover:underline shrink-0"
                      >
                        {issueRef.identifier ?? issueRef.id.slice(0, 6)}
                      </Link>
                    )}
                    <Link
                      href={`/runs/${run.id}`}
                      className="text-sm text-[#e6edf3] truncate hover:text-white transition-colors"
                    >
                      {title}
                    </Link>
                  </div>

                  {/* Agent + timestamp row */}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#21262d] flex items-center justify-center text-[9px] font-bold text-[#8b949e] shrink-0">
                        {agentIcon ?? initials}
                      </span>
                      <span className="text-xs text-[#8b949e]">{agentName}</span>
                    </div>
                    <span className="text-[#484f58] text-xs">·</span>
                    <span className="text-xs text-[#8b949e]">
                      {formatRelativeTime(run.started_at ?? run.created_at)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-2">
                  {run.status === "failed" && (
                    <Link
                      href={`/runs/${run.id}`}
                      className="px-2.5 py-1 text-xs border border-[#f85149]/40 text-[#f85149] rounded-md hover:bg-[#f85149]/10 transition-colors"
                    >
                      Retry
                    </Link>
                  )}
                  <Link
                    href={`/runs/${run.id}`}
                    className="text-[#8b949e] hover:text-[#e6edf3] transition-colors opacity-0 group-hover:opacity-100"
                    title="View run"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
