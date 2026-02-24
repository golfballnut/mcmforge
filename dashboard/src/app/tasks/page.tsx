import { createClient } from "@/lib/supabase/server";
import NewTaskForm from "@/components/NewTaskForm";

export const revalidate = 30;

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    todo: "bg-gray-800 text-gray-300 border-gray-700",
    in_progress: "bg-blue-900/50 text-blue-300 border-blue-800",
    review: "bg-amber-900/50 text-amber-300 border-amber-800",
    approved: "bg-green-900/50 text-green-300 border-green-800",
    done: "bg-green-900/50 text-green-300 border-green-800",
    rejected: "bg-red-900/50 text-red-300 border-red-800",
    blocked: "bg-red-900/50 text-red-300 border-red-800",
  };
  const label: Record<string, string> = {
    todo: "Todo",
    in_progress: "In Progress",
    review: "Review",
    approved: "Approved",
    done: "Done",
    rejected: "Rejected",
    blocked: "Blocked",
  };
  const cls = styles[status] ?? "bg-gray-800 text-gray-300 border-gray-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}
    >
      {label[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    low: "bg-gray-800 text-gray-300 border-gray-700",
    medium: "bg-blue-900/50 text-blue-300 border-blue-800",
    high: "bg-amber-900/50 text-amber-300 border-amber-800",
    critical: "bg-red-900/50 text-red-300 border-red-800",
  };
  const cls = styles[priority] ?? "bg-gray-800 text-gray-300 border-gray-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls} capitalize`}
    >
      {priority}
    </span>
  );
}

type TaskRow = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  skill_name: string | null;
  status: string;
  priority: string;
  board: string | null;
  assigned_to: string | null;
  cli_target: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  preview_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  company_registry: { name: string } | null;
};

export default async function TasksPage() {
  const supabase = await createClient();

  const [{ data: tasks, error }, { data: companies }] = await Promise.all([
    supabase
      .from("task_queue")
      .select("*, company_registry(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("company_registry")
      .select("id, name")
      .eq("status", "active")
      .order("name"),
  ]);

  if (error) {
    console.error("Failed to load tasks:", error.message);
  }

  const rows = (tasks ?? []) as TaskRow[];

  const counts = {
    todo: rows.filter((t) => t.status === "todo").length,
    in_progress: rows.filter((t) => t.status === "in_progress").length,
    review: rows.filter((t) => t.status === "review").length,
    done: rows.filter((t) => t.status === "done" || t.status === "approved").length,
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Task Queue</h1>
            <p className="mt-1 text-sm text-gray-400">
              All agent tasks across MCM Forge companies &mdash;{" "}
              <span className="text-gray-300 font-medium">{rows.length} total</span>
            </p>
          </div>
        </div>

        <NewTaskForm companies={(companies ?? []) as { id: string; name: string }[]} />

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Todo", value: counts.todo, color: "text-gray-300" },
            { label: "In Progress", value: counts.in_progress, color: "text-blue-300" },
            { label: "Review", value: counts.review, color: "text-amber-300" },
            { label: "Done", value: counts.done, color: "text-green-300" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-900/50 border border-gray-800 rounded-lg px-5 py-4"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <svg
                className="w-10 h-10 mb-3 text-gray-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="text-sm">No tasks in queue</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Title
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Status
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Priority
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Assigned To
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Company
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {rows.map((task) => (
                    <tr
                      key={task.id}
                      className="hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <div>
                          <p className="font-medium text-gray-100 truncate">{task.title}</p>
                          {task.skill_name && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {task.skill_name}
                            </p>
                          )}
                          {task.pr_url && (
                            <a
                              href={task.pr_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300 mt-0.5 inline-block"
                            >
                              PR #{task.pr_number ?? "link"} &rarr;
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PriorityBadge priority={task.priority} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {task.assigned_to ? (
                          <span className="text-gray-300">{task.assigned_to}</span>
                        ) : (
                          <span className="text-gray-600 italic">unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-gray-300">
                          {task.company_registry?.name ?? (
                            <span className="text-gray-600 italic">unknown</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">
                        {new Date(task.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
