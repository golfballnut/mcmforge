import { createClient } from "@/lib/supabase/server";
import KillSwitch from "@/components/KillSwitch";

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
  const [companies, tasks, pendingApprovals, agents] = await Promise.all([
    supabase.from("company_registry").select("*", { count: "exact" }).eq("status", "active"),
    supabase.from("task_queue").select("*", { count: "exact" }),
    supabase.from("approval_queue").select("*", { count: "exact" }).eq("status", "pending"),
    supabase.from("agent_roster").select("*"),
  ]);

  const taskRows = tasks.data || [];
  const agentRows = agents.data || [];

  return {
    activeCompanies: companies.count || 0,
    totalTasks: tasks.count || 0,
    todoTasks: taskRows.filter((t) => t.status === "todo").length,
    inProgressTasks: taskRows.filter((t) => t.status === "in_progress").length,
    completedTasks: taskRows.filter((t) => t.status === "done").length,
    pendingApprovals: pendingApprovals.count || 0,
    activeAgents: agentRows.filter((a) => a.status === "active").length,
    totalAgents: agentRows.length,
  };
}

async function getRecentTasks() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("task_queue")
    .select("*, company_registry(name, slug)")
    .order("created_at", { ascending: false })
    .limit(10);
  return data || [];
}

async function getPendingApprovals() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("approval_queue")
    .select("*, company_registry(name, slug)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  return data || [];
}

export const revalidate = 30;

export default async function Dashboard() {
  const [stats, recentTasks, approvals, dispatcherStatus] = await Promise.all([
    getStats(),
    getRecentTasks(),
    getPendingApprovals(),
    getDispatcherStatus(),
  ]);

  return (
    <div>
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-100">Command Center</h1>
          <p className="text-stone-500 mt-1 text-sm md:text-base">MCM Forge Operations Overview</p>
        </div>
        <KillSwitch status={dispatcherStatus} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <StatCard label="Active Companies" value={stats.activeCompanies} color="orange" />
        <StatCard label="Pending Approvals" value={stats.pendingApprovals} color={stats.pendingApprovals > 0 ? "amber" : "green"} />
        <StatCard label="Tasks In Progress" value={stats.inProgressTasks} color="yellow" />
        <StatCard label="Agents Online" value={`${stats.activeAgents}/${stats.totalAgents}`} color="green" />
      </div>

      {/* Task Pipeline */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-lg font-semibold mb-3 md:mb-4 text-stone-200">Task Pipeline</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3">
          <PipelineStage label="Todo" count={stats.todoTasks} color="stone" />
          <PipelineStage label="In Progress" count={stats.inProgressTasks} color="orange" />
          <PipelineStage label="Review" count={0} color="amber" />
          <PipelineStage label="Approved" count={0} color="green" />
          <PipelineStage label="Done" count={stats.completedTasks} color="emerald" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Pending Approvals */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-stone-200">
            Pending Approvals
            {stats.pendingApprovals > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-xs rounded-full">
                {stats.pendingApprovals}
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {approvals.length === 0 ? (
              <div className="text-stone-600 text-sm p-4 border border-stone-800 rounded-lg text-center">
                No pending approvals
              </div>
            ) : (
              approvals.map((a) => (
                <div key={a.id} className="p-4 bg-stone-900/50 border border-stone-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-200">{a.title}</p>
                    <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 rounded">
                      {a.approval_type}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{a.description}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Tasks */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-stone-200">Recent Tasks</h2>
          <div className="space-y-2">
            {recentTasks.length === 0 ? (
              <div className="text-stone-600 text-sm p-4 border border-stone-800 rounded-lg text-center">
                No tasks yet
              </div>
            ) : (
              recentTasks.map((t) => (
                <div key={t.id} className="p-4 bg-stone-900/50 border border-stone-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-200">{t.title}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    {t.company_registry?.name} &middot; {t.assigned_to || "Unassigned"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colors: Record<string, string> = {
    orange: "bg-orange-500/10 border-orange-500/20 text-orange-400",
    green: "bg-green-500/10 border-green-500/20 text-green-400",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    yellow: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
  };

  return (
    <div className={`rounded-xl border p-4 md:p-6 ${colors[color]}`}>
      <p className="text-2xl md:text-3xl font-bold">{value}</p>
      <p className="text-xs md:text-sm opacity-70 mt-1">{label}</p>
    </div>
  );
}

function PipelineStage({ label, count, color }: { label: string; count: number; color: string }) {
  const colors: Record<string, string> = {
    stone: "border-stone-700 text-stone-400",
    orange: "border-orange-500/30 text-orange-400",
    amber: "border-amber-500/30 text-amber-400",
    green: "border-green-500/30 text-green-400",
    emerald: "border-emerald-500/30 text-emerald-400",
  };

  return (
    <div className={`border rounded-lg p-3 md:p-4 text-center ${colors[color]}`}>
      <p className="text-xl md:text-2xl font-bold">{count}</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    todo: "bg-stone-500/10 text-stone-400",
    in_progress: "bg-orange-500/10 text-orange-400",
    review: "bg-amber-500/10 text-amber-400",
    approved: "bg-green-500/10 text-green-400",
    rejected: "bg-red-500/10 text-red-400",
    done: "bg-emerald-500/10 text-emerald-400",
    blocked: "bg-red-500/10 text-red-400",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded ${styles[status] || styles.todo}`}>
      {status.replace("_", " ")}
    </span>
  );
}
