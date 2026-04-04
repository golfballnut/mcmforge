import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import DashboardClient from "./DashboardClient";

export const revalidate = 15;

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

  const [agents, recentRuns, stats] = await Promise.all([
    getAgents(companyId),
    getRecentRuns(companyId),
    getStats(companyId),
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      </div>

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
