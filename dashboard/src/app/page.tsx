import { createClient } from "@/lib/supabase/server";

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
  const stats = await getStats();
  const recentTasks = await getRecentTasks();
  const approvals = await getPendingApprovals();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Command Center</h1>
        <p className="text-gray-500 mt-1">MCM Forge Operations Overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Companies" value={stats.activeCompanies} color="blue" />
        <StatCard label="Pending Approvals" value={stats.pendingApprovals} color={stats.pendingApprovals > 0 ? "amber" : "green"} />
        <StatCard label="Tasks In Progress" value={stats.inProgressTasks} color="purple" />
        <StatCard label="Agents Online" value={`${stats.activeAgents}/${stats.totalAgents}`} color="green" />
      </div>

      {/* Task Pipeline */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Task Pipeline</h2>
        <div className="grid grid-cols-5 gap-3">
          <PipelineStage label="Todo" count={stats.todoTasks} color="gray" />
          <PipelineStage label="In Progress" count={stats.inProgressTasks} color="blue" />
          <PipelineStage label="Review" count={0} color="amber" />
          <PipelineStage label="Approved" count={0} color="green" />
          <PipelineStage label="Done" count={stats.completedTasks} color="emerald" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Pending Approvals */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            Pending Approvals
            {stats.pendingApprovals > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-xs rounded-full">
                {stats.pendingApprovals}
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {approvals.length === 0 ? (
              <div className="text-gray-600 text-sm p-4 border border-gray-800 rounded-lg text-center">
                No pending approvals
              </div>
            ) : (
              approvals.map((a) => (
                <div key={a.id} className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{a.title}</p>
                    <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 rounded">
                      {a.approval_type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{a.description}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Tasks */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Recent Tasks</h2>
          <div className="space-y-2">
            {recentTasks.length === 0 ? (
              <div className="text-gray-600 text-sm p-4 border border-gray-800 rounded-lg text-center">
                No tasks yet
              </div>
            ) : (
              recentTasks.map((t) => (
                <div key={t.id} className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t.title}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
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
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    green: "bg-green-500/10 border-green-500/20 text-green-400",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  };

  return (
    <div className={`rounded-xl border p-6 ${colors[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm opacity-70 mt-1">{label}</p>
    </div>
  );
}

function PipelineStage({ label, count, color }: { label: string; count: number; color: string }) {
  const colors: Record<string, string> = {
    gray: "border-gray-700 text-gray-400",
    blue: "border-blue-500/30 text-blue-400",
    amber: "border-amber-500/30 text-amber-400",
    green: "border-green-500/30 text-green-400",
    emerald: "border-emerald-500/30 text-emerald-400",
  };

  return (
    <div className={`border rounded-lg p-4 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    todo: "bg-gray-500/10 text-gray-400",
    in_progress: "bg-blue-500/10 text-blue-400",
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
