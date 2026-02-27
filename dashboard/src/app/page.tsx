import { createClient } from "@/lib/supabase/server";
import KillSwitch from "@/components/KillSwitch";
import WarRoomFeed from "@/components/WarRoomFeed";
import type { FeedItemData } from "@/components/FeedItem";

async function getDispatcherStatus() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "dispatcher_status")
    .single();
  return data?.value || "unknown";
}

async function getStats() {
  const supabase = await createClient();
  const [tasks, pendingApprovals, agents] = await Promise.all([
    supabase.from("task_queue").select("status"),
    supabase.from("approval_queue").select("*", { count: "exact" }).eq("status", "pending"),
    supabase.from("agent_roster").select("status"),
  ]);

  const taskRows = tasks.data || [];
  const agentRows = agents.data || [];
  const today = new Date().toISOString().split("T")[0];

  return {
    agentsOnline: agentRows.filter((a) => a.status === "active").length,
    totalAgents: agentRows.length,
    pendingApprovals: pendingApprovals.count || 0,
    inProgress: taskRows.filter((t) => t.status === "in_progress").length,
    completedToday: taskRows.filter((t) => t.status === "done").length,
    todayLabel: today,
  };
}

async function getWarRoomFeed(): Promise<FeedItemData[]> {
  const supabase = await createClient();

  const [warRoom, recentTasks, approvals] = await Promise.all([
    supabase
      .from("communication_log")
      .select("*")
      .eq("channel", "war_room")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("task_queue")
      .select("*, company_registry(name)")
      .in("status", ["done", "in_progress", "rejected", "todo"])
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("approval_queue")
      .select("*, company_registry(name)")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const items: FeedItemData[] = [];

  // War room messages
  (warRoom.data || []).forEach((msg) => {
    items.push({
      id: msg.id,
      type: "message",
      title: msg.agent_name || "Agent",
      summary: msg.message || "",
      timestamp: msg.created_at,
      company: msg.company_slug,
    });
  });

  // Task updates
  (recentTasks.data || []).forEach((task) => {
    items.push({
      id: "task-" + task.id,
      type: "task",
      title: task.title,
      summary: `${task.status.replace("_", " ")} — ${task.assigned_to || "unassigned"}`,
      timestamp: task.updated_at || task.created_at,
      company: task.company_registry?.name,
      status: task.status,
      href: "/tasks",
    });
  });

  // Approvals
  (approvals.data || []).forEach((a) => {
    items.push({
      id: "approval-" + a.id,
      type: "approval",
      title: a.title,
      summary: `${a.approval_type} — ${a.status}`,
      timestamp: a.created_at,
      company: a.company_registry?.name,
      status: a.status,
      href: "/approvals",
      isNew: a.status === "pending",
    });
  });

  // Sort by timestamp desc
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return items;
}

export const revalidate = 30;

export default async function WarRoom() {
  const [stats, feedItems, dispatcherStatus] = await Promise.all([
    getStats(),
    getWarRoomFeed(),
    getDispatcherStatus(),
  ]);

  const kpis = [
    { label: "Agents Online", value: `${stats.agentsOnline}/${stats.totalAgents}`, color: "#34a853" },
    { label: "Pending Approvals", value: stats.pendingApprovals, color: stats.pendingApprovals > 0 ? "#fbbc04" : "#34a853" },
    { label: "In Progress", value: stats.inProgress, color: "#1a73e8" },
    { label: "Completed", value: stats.completedToday, color: "#34a853" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-medium text-[#202124]">War Room</h1>
          <p className="text-sm text-[#5f6368] mt-0.5">Real-time agent activity feed</p>
        </div>
        <KillSwitch status={dispatcherStatus} />
      </div>

      {/* KPI Strip */}
      <div className="flex flex-wrap gap-3 mb-6">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="flex items-center gap-2 bg-white border border-[#dadce0] rounded-full px-4 py-2"
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: kpi.color }}
            />
            <span className="text-sm font-medium text-[#202124]">{kpi.value}</span>
            <span className="text-xs text-[#5f6368]">{kpi.label}</span>
          </div>
        ))}
      </div>

      {/* War Room Feed */}
      <WarRoomFeed initialItems={feedItems} />
    </div>
  );
}
