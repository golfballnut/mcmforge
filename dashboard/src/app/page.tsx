import Link from "next/link";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import DashboardClient from "./DashboardClient";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

async function getAgents(companyId: string) {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("agents")
    .select(
      "id, name, title, status, adapter_type, adapter_config, last_heartbeat_at, company_id"
    )
    .eq("company_id", companyId)
    .order("status")
    .order("name");
  return data ?? [];
}

async function getRecentRuns(companyId: string) {
  const supabase = await createForgeClient();
  // Runs don't have company_id directly — filter via agent join
  const { data: agents } = await supabase
    .from("agents")
    .select("id")
    .eq("company_id", companyId);
  const agentIds = (agents ?? []).map((a) => a.id);
  if (agentIds.length === 0) return [];
  const { data } = await supabase
    .from("runs")
    .select("id, agent_id, status, summary, started_at, finished_at, context_snapshot")
    .in("agent_id", agentIds)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

function buildLatestRunMap(runs: any[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const run of runs) {
    if (!map[run.agent_id]) {
      map[run.agent_id] = run;
    }
  }
  return map;
}

async function getAgentPerformance(companyId: string) {
  const supabase = await createForgeClient();

  // Get all agents for this company
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, status")
    .eq("company_id", companyId);

  if (!agents?.length) return [];

  const agentIds = agents.map((a) => a.id);

  // Get all runs for these agents
  const { data: runs } = await supabase
    .from("runs")
    .select("agent_id, status, cost_usd, input_tokens, output_tokens, started_at, finished_at")
    .in("agent_id", agentIds)
    .not("status", "eq", "cancelled")
    .order("created_at", { ascending: false })
    .limit(500);

  // Compute per-agent stats
  const statsMap: Record<string, {
    name: string; status: string; totalRuns: number; succeeded: number; failed: number;
    totalCost: number; avgCost: number; totalTokens: number;
  }> = {};

  for (const agent of agents) {
    const agentRuns = (runs ?? []).filter((r) => r.agent_id === agent.id);
    const succeeded = agentRuns.filter((r) => r.status === "succeeded").length;
    const failed = agentRuns.filter((r) => r.status === "failed" || r.status === "timed_out").length;
    const totalCost = agentRuns.reduce((sum, r) => sum + (parseFloat(r.cost_usd) || 0), 0);
    const totalTokens = agentRuns.reduce((sum, r) => sum + (r.input_tokens || 0) + (r.output_tokens || 0), 0);

    statsMap[agent.id] = {
      name: agent.name,
      status: agent.status,
      totalRuns: agentRuns.length,
      succeeded,
      failed,
      totalCost,
      avgCost: agentRuns.length > 0 ? totalCost / agentRuns.length : 0,
      totalTokens,
    };
  }

  return Object.values(statsMap).sort((a, b) => b.totalRuns - a.totalRuns);
}

async function getStats(companyId: string) {
  const supabase = await createForgeClient();

  const [agentsRes, issuesRes, approvalsRes] = await Promise.all([
    supabase.from("agents").select("id, status").eq("company_id", companyId),
    supabase
      .from("issues")
      .select("id", { count: "exact" })
      .eq("status", "in_progress")
      .eq("company_id", companyId),
    supabase
      .from("approvals")
      .select("id", { count: "exact" })
      .eq("status", "pending"),
  ]);

  const agents = agentsRes.data ?? [];
  const enabledAgents = agents.filter((a) => a.status !== "terminated").length;

  // Monthly spend: sum cost_events for current month if table exists
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const agentIds = agents.map((a) => a.id);
  let monthlySpend = 0;
  if (agentIds.length > 0) {
    const { data: costData } = await supabase
      .from("cost_events")
      .select("amount_usd")
      .in("agent_id", agentIds)
      .gte("created_at", monthStart);
    monthlySpend = (costData ?? []).reduce(
      (sum, row) => sum + (row.amount_usd ?? 0),
      0
    );
  }

  return {
    enabledAgents,
    tasksInProgress: issuesRes.count ?? 0,
    monthlySpend,
    pendingApprovals: approvalsRes.count ?? 0,
  };
}

function weekStartUtc(now = new Date()): Date {
  // ISO week start = Monday 00:00:00 UTC
  const day = now.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0
  ));
  return monday;
}

async function getGateAMetrics(companyId: string) {
  const supabase = await createForgeClient();

  const weekStart = weekStartUtc().toISOString();
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const [thisWeekRes, fourWeekMergedRes, fourWeekCancelledRes] = await Promise.all([
    supabase
      .from("issues")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "done")
      .not("pr_url", "is", null)
      .gte("completed_at", weekStart),
    supabase
      .from("issues")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "done")
      .not("pr_url", "is", null)
      .gte("completed_at", fourWeeksAgo),
    supabase
      .from("issues")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "cancelled")
      .gte("cancelled_at", fourWeeksAgo),
  ]);

  const mergesThisWeek = thisWeekRes.count ?? 0;
  const merged4w = fourWeekMergedRes.count ?? 0;
  const cancelled4w = fourWeekCancelledRes.count ?? 0;
  const total4w = merged4w + cancelled4w;
  const approvalRate = total4w > 0 ? Math.round((merged4w / total4w) * 100) : 0;

  // A-week: ≥5 merges AND ≥85% approval
  // B-week: 3–4 merges OR 70–85% approval
  // C-week: <3 merges OR <70% approval
  let band: "A" | "B" | "C";
  if (mergesThisWeek >= 5 && (total4w === 0 || approvalRate >= 85)) band = "A";
  else if (mergesThisWeek < 3 || (total4w > 0 && approvalRate < 70)) band = "C";
  else band = "B";

  return { mergesThisWeek, approvalRate, total4w, band };
}

async function getActiveCompanyGoals(companyId: string) {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("goals")
    .select("id, title, level")
    .eq("company_id", companyId)
    .eq("status", "active")
    .eq("level", "company")
    .order("created_at", { ascending: true })
    .limit(3);
  return data ?? [];
}

async function getKnowledgeHealth(companyId: string) {
  const supabase = await createForgeClient();

  // Count total knowledge entries for this company
  const { count: totalCount } = await supabase
    .from("knowledge")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  const total = totalCount ?? 0;

  // Count done issues for this company
  const { count: doneCount } = await supabase
    .from("issues")
    .select("id", { count: "exact", head: true })
    .eq("status", "done")
    .eq("company_id", companyId);

  const doneIssues = doneCount ?? 0;

  // Count unique issue IDs referenced in knowledge source_issue_ids
  const { data: knowledgeRows } = await supabase
    .from("knowledge")
    .select("source_issue_ids")
    .eq("company_id", companyId);

  const synthesizedIds = new Set<string>();
  for (const row of knowledgeRows ?? []) {
    if (Array.isArray(row.source_issue_ids)) {
      for (const id of row.source_issue_ids) {
        synthesizedIds.add(String(id));
      }
    }
  }
  const synthesized = synthesizedIds.size;

  const coverage = doneIssues > 0 ? Math.round((synthesized / doneIssues) * 100) : 0;

  return { total, coverage };
}

function GoalsCard({ goals }: { goals: { id: string; title: string; level: string }[] }) {
  return (
    <Link
      href="/goals"
      className="rounded-lg border p-4 flex flex-col gap-2 hover:border-[#30363d]/80 transition-colors"
      style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider" style={{ color: "#8b949e" }}>
          Active Goals
        </span>
        <span className="text-xs tabular-nums" style={{ color: "#8b949e" }}>
          {goals.length}
        </span>
      </div>
      {goals.length === 0 ? (
        <p className="text-sm" style={{ color: "#8b949e" }}>
          No active company goals
        </p>
      ) : (
        <ul className="space-y-1.5">
          {goals.map((g) => (
            <li key={g.id} className="flex items-start gap-2 text-sm">
              <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "#3fb950" }} />
              <span className="truncate" style={{ color: "#e6edf3" }}>{g.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}

function GateACard({
  mergesThisWeek,
  approvalRate,
  total4w,
  band,
}: {
  mergesThisWeek: number;
  approvalRate: number;
  total4w: number;
  band: "A" | "B" | "C";
}) {
  const bandColor = band === "A" ? "#3fb950" : band === "B" ? "#d29922" : "#f85149";
  const bandLabel = band === "A" ? "A-week" : band === "B" ? "B-week" : "C-week";
  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-2"
      style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider" style={{ color: "#8b949e" }}>
          Gate-A This Week
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{ color: bandColor, backgroundColor: `${bandColor}15`, border: `1px solid ${bandColor}40` }}
        >
          {bandLabel}
        </span>
      </div>
      <div className="flex items-baseline gap-4">
        <div>
          <div className="text-3xl font-bold tabular-nums" style={{ color: bandColor }}>
            {mergesThisWeek}
          </div>
          <div className="text-xs" style={{ color: "#8b949e" }}>
            merges · target ≥5
          </div>
        </div>
        <div className="border-l pl-4" style={{ borderColor: "#30363d" }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: total4w > 0 ? bandColor : "#8b949e" }}>
            {total4w > 0 ? `${approvalRate}%` : "—"}
          </div>
          <div className="text-xs" style={{ color: "#8b949e" }}>
            1st-pass approval · 4w rolling · target ≥85%
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-1"
      style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
    >
      <span
        className="text-3xl font-bold tabular-nums"
        style={{ color: accent ?? "#e6edf3" }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: "#8b949e" }}>
        {label}
      </span>
    </div>
  );
}

export default async function HomePage() {
  const company = await getActiveCompany();
  const companyId = company?.id ?? "";
  const companyName = company?.name ?? "MCM Forge";

  const [agents, recentRuns, stats, agentPerf, knowledgeHealth, gateA, activeGoals] = await Promise.all([
    getAgents(companyId),
    getRecentRuns(companyId),
    getStats(companyId),
    getAgentPerformance(companyId),
    getKnowledgeHealth(companyId),
    getGateAMetrics(companyId),
    getActiveCompanyGoals(companyId),
  ]);

  const latestRunMap = buildLatestRunMap(recentRuns);

  const runningCount = agents.filter((a) => a.status === "running").length;

  const spendFormatted = `$${stats.monthlySpend.toFixed(2)}`;
  const approvalAccent =
    stats.pendingApprovals > 0 ? "#d29922" : "#e6edf3";

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#e6edf3" }}>
          {companyName}
        </h1>
        <p className="text-sm mt-1" style={{ color: "#8b949e" }}>
          {runningCount > 0
            ? `${runningCount} agent${runningCount !== 1 ? "s" : ""} running now`
            : "All agents idle"}
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Agents Enabled" value={stats.enabledAgents} />
        <StatCard
          label="Tasks in Progress"
          value={stats.tasksInProgress}
          accent={stats.tasksInProgress > 0 ? "#58a6ff" : undefined}
        />
        <StatCard label="Monthly Spend" value={spendFormatted} />
        <StatCard
          label="Pending Approvals"
          value={stats.pendingApprovals}
          accent={approvalAccent}
        />
        <Link href="/knowledge" className="block">
          <StatCard
            label="Knowledge Health"
            value={`${knowledgeHealth.coverage}%`}
            accent={knowledgeHealth.coverage >= 50 ? "#3fb950" : knowledgeHealth.coverage >= 25 ? "#d29922" : "#f85149"}
          />
        </Link>
      </div>

      {/* Goals + Gate-A row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GoalsCard goals={activeGoals} />
        <GateACard mergesThisWeek={gateA.mergesThisWeek} approvalRate={gateA.approvalRate} total4w={gateA.total4w} band={gateA.band} />
      </div>

      {/* Changelog quick link */}
      <Link
        href="/changelogs"
        className="inline-flex items-center gap-1.5 text-sm text-[#58a6ff] hover:text-[#79c0ff] transition-colors"
      >
        View today&apos;s changelogs
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Agent Performance */}
      {agentPerf.length > 0 && (
        <div>
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-3"
            style={{ color: "#8b949e" }}
          >
            Agent Performance
          </h2>
          <div
            className="rounded-lg border overflow-hidden"
            style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #30363d" }}>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: "#8b949e" }}>Agent</th>
                  <th className="text-center px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Status</th>
                  <th className="text-center px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Runs</th>
                  <th className="text-center px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Success</th>
                  <th className="text-center px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Failed</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Total Cost</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: "#8b949e" }}>Avg/Run</th>
                  <th className="text-right px-4 py-2 font-medium" style={{ color: "#8b949e" }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {agentPerf.map((a) => {
                  const rate = a.totalRuns > 0 ? Math.round((a.succeeded / a.totalRuns) * 100) : 0;
                  const rateColor = rate >= 80 ? "#3fb950" : rate >= 50 ? "#d29922" : rate > 0 ? "#f85149" : "#8b949e";
                  const statusColor = a.status === "running" ? "#3fb950" : a.status === "error" ? "#f85149" : "#8b949e";
                  return (
                    <tr key={a.name} style={{ borderBottom: "1px solid #21262d" }}>
                      <td className="px-4 py-2 font-medium" style={{ color: "#e6edf3" }}>{a.name}</td>
                      <td className="text-center px-3 py-2">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: statusColor, backgroundColor: `${statusColor}20` }}>{a.status}</span>
                      </td>
                      <td className="text-center px-3 py-2 tabular-nums" style={{ color: "#e6edf3" }}>{a.totalRuns}</td>
                      <td className="text-center px-3 py-2 tabular-nums" style={{ color: "#3fb950" }}>{a.succeeded}</td>
                      <td className="text-center px-3 py-2 tabular-nums" style={{ color: a.failed > 0 ? "#f85149" : "#8b949e" }}>{a.failed}</td>
                      <td className="text-right px-3 py-2 tabular-nums" style={{ color: "#e6edf3" }}>${a.totalCost.toFixed(2)}</td>
                      <td className="text-right px-3 py-2 tabular-nums" style={{ color: "#8b949e" }}>${a.avgCost.toFixed(2)}</td>
                      <td className="text-right px-4 py-2 tabular-nums font-medium" style={{ color: rateColor }}>{a.totalRuns > 0 ? `${rate}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent grid — live via Realtime */}
      <div>
        <h2
          className="text-sm font-semibold uppercase tracking-wider mb-3"
          style={{ color: "#8b949e" }}
        >
          Agents
        </h2>
        <DashboardClient initialAgents={agents} recentRuns={recentRuns} latestRunMap={latestRunMap} />
      </div>
    </div>
  );
}
