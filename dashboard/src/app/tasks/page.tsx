import { createClient } from "@/lib/supabase/server";
import NewTaskForm from "@/components/NewTaskForm";

export const revalidate = 30;

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    todo: "bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]",
    in_progress: "bg-[#e8f0fe] text-[#1a73e8] border-[#d3e3fd]",
    review: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    done: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    blocked: "bg-red-50 text-red-700 border-red-200",
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
  const cls = styles[status] ?? "bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]";
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
    low: "bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]",
    medium: "bg-[#e8f0fe] text-[#1a73e8] border-[#d3e3fd]",
    high: "bg-amber-50 text-amber-700 border-amber-200",
    critical: "bg-red-50 text-red-700 border-red-200",
  };
  const cls = styles[priority] ?? "bg-[#f1f3f4] text-[#5f6368] border-[#dadce0]";
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
    <div className="min-h-screen text-[#202124]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-medium text-[#202124] tracking-tight">Task Queue</h1>
            <p className="mt-1 text-sm text-[#5f6368]">
              All agent tasks across MCM Forge companies &mdash;{" "}
              <span className="text-[#202124] font-medium">{rows.length} total</span>
            </p>
          </div>
        </div>

        <NewTaskForm companies={(companies ?? []) as { id: string; name: string }[]} />

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Todo", value: counts.todo, color: "text-[#5f6368]" },
            { label: "In Progress", value: counts.in_progress, color: "text-[#1a73e8]" },
            { label: "Review", value: counts.review, color: "text-amber-600" },
            { label: "Done", value: counts.done, color: "text-[#34a853]" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-[#dadce0] rounded-lg px-5 py-4"
            >
              <p className="text-xs text-[#5f6368] uppercase tracking-wider">{stat.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Task List */}
        {rows.length === 0 ? (
          <div className="bg-white border border-[#dadce0] rounded-lg flex flex-col items-center justify-center py-20 text-[#5f6368]">
            <svg
              className="w-10 h-10 mb-3 text-[#dadce0]"
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
          <>
            {/* Mobile: Card layout */}
            <div className="md:hidden space-y-3">
              {rows.map((task) => (
                <div
                  key={task.id}
                  className="bg-white border border-[#dadce0] rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-medium text-[#202124] text-sm leading-tight">{task.title}</p>
                    <StatusBadge status={task.status} />
                  </div>
                  {task.skill_name && (
                    <p className="text-xs text-[#5f6368] mb-2">{task.skill_name}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <PriorityBadge priority={task.priority} />
                    <span className="text-[#5f6368]">
                      {task.company_registry?.name ?? "unknown"}
                    </span>
                    <span className="text-[#dadce0]">&middot;</span>
                    <span className="text-[#5f6368]">
                      {task.assigned_to || "unassigned"}
                    </span>
                  </div>
                  {task.pr_url && (
                    <a
                      href={task.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#1a73e8] hover:underline mt-2 inline-block"
                    >
                      PR #{task.pr_number ?? "link"} &rarr;
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden md:block bg-white border border-[#dadce0] rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#dadce0]">
                      <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">
                        Title
                      </th>
                      <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">
                        Status
                      </th>
                      <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">
                        Priority
                      </th>
                      <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">
                        Assigned To
                      </th>
                      <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">
                        Company
                      </th>
                      <th className="text-left text-xs font-medium text-[#5f6368] uppercase tracking-wider px-4 py-3">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dadce0]">
                    {rows.map((task) => (
                      <tr
                        key={task.id}
                        className="hover:bg-[#f1f3f4] transition-colors"
                      >
                        <td className="px-4 py-3 max-w-xs">
                          <div>
                            <p className="font-medium text-[#202124] truncate">{task.title}</p>
                            {task.skill_name && (
                              <p className="text-xs text-[#5f6368] mt-0.5 truncate">
                                {task.skill_name}
                              </p>
                            )}
                            {task.pr_url && (
                              <a
                                href={task.pr_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#1a73e8] hover:underline mt-0.5 inline-block"
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
                            <span className="text-[#202124]">{task.assigned_to}</span>
                          ) : (
                            <span className="text-[#5f6368] italic">unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[#202124]">
                            {task.company_registry?.name ?? (
                              <span className="text-[#5f6368] italic">unknown</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#5f6368] text-xs">
                          {new Date(task.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          <span className="text-[#80868b]">
                            {new Date(task.created_at).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
