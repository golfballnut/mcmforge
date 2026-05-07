import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import StandupCard from "@/components/StandupCard";
import InboxPanel, { type FailedRun, type PendingApproval, type HighPriorityIssue } from "@/components/InboxPanel";
import LiveAgentsGrid from "@/components/LiveAgentsGrid";
import GateACard from "@/components/GateACard";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getAgents(companyId: string) {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("agents")
    .select("id, name, status, adapter_config, last_heartbeat_at, company_id")
    .eq("company_id", companyId)
    .order("status")
    .order("name");
  return data ?? [];
}

async function getRecentRuns(companyId: string) {
  const supabase = await createForgeClient();
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

async function getFailedRunsLast24h(companyId: string): Promise<FailedRun[]> {
  const supabase = await createForgeClient();
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("company_id", companyId);
  const agentIds = (agents ?? []).map((a) => a.id);
  if (agentIds.length === 0) return [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("runs")
    .select("id, agent_id, status, finished_at")
    .in("agent_id", agentIds)
    .eq("status", "failed")
    .gte("finished_at", since)
    .order("finished_at", { ascending: false })
    .limit(10);

  const agentMap = Object.fromEntries((agents ?? []).map((a: any) => [a.id, a.name]));
  return (data ?? []).map((r: any) => ({
    id: r.id,
    agentName: agentMap[r.agent_id] ?? "Unknown Agent",
    status: r.status,
    finishedAt: r.finished_at,
  }));
}

async function getPendingApprovals(companyId: string): Promise<PendingApproval[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("approvals")
    .select("id, title, created_at")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);
  return (data ?? []).map((a: any) => ({
    id: a.id,
    title: a.title ?? "Approval request",
    createdAt: a.created_at,
  }));
}

async function getHighPriorityIssues(companyId: string): Promise<HighPriorityIssue[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("issues")
    .select("id, identifier, title, status")
    .eq("company_id", companyId)
    .eq("priority", "high")
    .not("status", "in", '("completed","done","cancelled","archived")')
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []).map((i: any) => ({
    id: i.id,
    identifier: i.identifier ?? "",
    title: i.title ?? "",
    status: i.status ?? "",
  }));
}

function weekStartUtc(now = new Date()): Date {
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0,
  ));
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

  let band: "A" | "B" | "C";
  if (mergesThisWeek >= 5 && (total4w === 0 || approvalRate >= 85)) band = "A";
  else if (mergesThisWeek < 3 || (total4w > 0 && approvalRate < 70)) band = "C";
  else band = "B";

  return { mergesThisWeek, approvalRate, total4w, band };
}

async function getLatestStandup(companyId: string) {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("daily_standups")
    .select("date, body_md, company_id, generated_at")
    .eq("company_id", companyId)
    .order("date", { ascending: false })
    .limit(1)
    .single();
  return data ?? null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const company = await getActiveCompany();
  const companyId = company?.id ?? "";
  const companyName = company?.name ?? "MCM Forge";

  const [
    agents,
    recentRuns,
    failedRuns,
    pendingApprovals,
    highPriorityIssues,
    gateA,
    latestStandup,
  ] = await Promise.all([
    getAgents(companyId),
    getRecentRuns(companyId),
    getFailedRunsLast24h(companyId),
    getPendingApprovals(companyId),
    getHighPriorityIssues(companyId),
    getGateAMetrics(companyId),
    getLatestStandup(companyId),
  ]);

  const latestRunMap = buildLatestRunMap(recentRuns);
  const runningCount = agents.filter((a) => a.status === "running").length;

  return (
    <div className="space-y-6">
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

      {/* 1. Daily Standup Card — STAYS untouched (FORGE-360/361) */}
      <StandupCard
        companyId={companyId}
        initialStandup={latestStandup}
        isProduction={process.env.VERCEL === "1"}
      />

      {/* 2. Inbox — what needs attention */}
      <InboxPanel
        failedRuns={failedRuns}
        pendingApprovals={pendingApprovals}
        highPriorityIssues={highPriorityIssues}
      />

      {/* 3. Live Agents Grid — compact cards, realtime */}
      <LiveAgentsGrid initialAgents={agents as any} latestRunMap={latestRunMap} />

      {/* 4. Gate-A week score */}
      <GateACard
        mergesThisWeek={gateA.mergesThisWeek}
        approvalRate={gateA.approvalRate}
        total4w={gateA.total4w}
        band={gateA.band}
      />
    </div>
  );
}
