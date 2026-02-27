import { createClient } from "@/lib/supabase/server";
import NewTaskForm from "@/components/NewTaskForm";
import TaskTable from "@/components/TaskTable";

export const revalidate = 30;

export default async function TasksPage() {
  const supabase = await createClient();

  const [{ data: tasks, error }, { data: companies }, { data: agents }] =
    await Promise.all([
      supabase
        .from("task_queue")
        .select("*, company_registry(name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("company_registry")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase.from("agent_roster").select("name, agent_type").order("name"),
    ]);

  if (error) {
    console.error("Failed to load tasks:", error.message);
  }

  return (
    <div className="min-h-screen text-[#202124]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-medium text-[#202124] tracking-tight">
              Task Queue
            </h1>
            <p className="mt-1 text-sm text-[#5f6368]">
              All agent tasks across MCM Forge companies &mdash;{" "}
              <span className="text-[#202124] font-medium">
                {(tasks ?? []).length} total
              </span>
            </p>
          </div>
        </div>

        <NewTaskForm
          companies={(companies ?? []) as { id: string; name: string }[]}
        />

        <TaskTable
          tasks={(tasks ?? []) as any[]}
          companies={(companies ?? []) as { id: string; name: string }[]}
          agents={(agents ?? []) as { name: string; agent_type: string }[]}
        />
      </div>
    </div>
  );
}
