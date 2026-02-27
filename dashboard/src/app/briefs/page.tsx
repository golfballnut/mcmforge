import { createClient } from "@/lib/supabase/server";

export const revalidate = 30;

interface BriefTask {
  title: string;
  priority?: string;
  status?: string;
  company?: string;
}

export default async function BriefsPage() {
  const supabase = await createClient();

  const { data: briefs } = await supabase
    .from("daily_briefs")
    .select("*")
    .order("brief_date", { ascending: false })
    .limit(30);

  const items = briefs ?? [];
  const today = new Date().toISOString().split("T")[0];
  const todayBrief = items.find((b) => b.brief_date === today);
  const pastBriefs = items.filter((b) => b.brief_date !== today);

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-[#202124]">Daily Briefs</h1>
        <p className="text-[#5f6368] text-sm mt-1">
          Your daily task list from the COO
        </p>
      </div>

      {/* Today's Brief */}
      <section className="mb-10">
        <h2 className="text-lg font-medium text-[#1a73e8] mb-4">
          Today&apos;s Brief
        </h2>

        {!todayBrief ? (
          <div className="bg-white border border-[#dadce0] rounded-xl p-8 text-center">
            <p className="text-[#5f6368]">No brief for today yet</p>
            <p className="text-[#5f6368] text-sm mt-1">
              The COO will generate your daily brief each morning
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#d3e3fd] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-[#202124]">
                {formatDate(todayBrief.brief_date)}
              </h3>
              <StatusBadge status={todayBrief.status} />
            </div>

            {todayBrief.summary && (
              <p className="text-[#5f6368] text-sm mb-4">
                {todayBrief.summary}
              </p>
            )}

            {todayBrief.tasks && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-[#5f6368] uppercase tracking-wide">
                  Your Tasks
                </h4>
                {(todayBrief.tasks as BriefTask[]).map(
                  (task: BriefTask, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 bg-[#f1f3f4] rounded-lg"
                    >
                      <span className="text-[#5f6368] text-sm font-mono w-6">
                        {i + 1}.
                      </span>
                      <span className="text-[#202124] text-sm flex-1">
                        {task.title}
                      </span>
                      {task.priority && (
                        <PriorityBadge priority={task.priority} />
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            {todayBrief.metrics && (
              <div className="mt-4 pt-4 border-t border-[#dadce0]">
                <h4 className="text-sm font-medium text-[#5f6368] uppercase tracking-wide mb-2">
                  Metrics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(
                    todayBrief.metrics as Record<string, string | number>
                  ).map(([key, value]) => (
                    <div key={key} className="text-center">
                      <p className="text-lg font-semibold text-[#202124]">
                        {String(value)}
                      </p>
                      <p className="text-xs text-[#5f6368]">
                        {key.replace(/_/g, " ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {todayBrief.email_sent_at && (
              <p className="text-xs text-[#5f6368] mt-4">
                Emailed at{" "}
                {new Date(todayBrief.email_sent_at).toLocaleTimeString()}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Past Briefs */}
      <section>
        <h2 className="text-lg font-medium text-[#202124] mb-4">
          Past Briefs
        </h2>

        {pastBriefs.length === 0 ? (
          <div className="bg-white border border-[#dadce0] rounded-xl p-8 text-center text-[#5f6368]">
            No past briefs
          </div>
        ) : (
          <div className="space-y-3">
            {pastBriefs.map((brief) => (
              <div
                key={brief.id}
                className="bg-white border border-[#dadce0] rounded-xl p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-[#202124]">
                    {formatDate(brief.brief_date)}
                  </h3>
                  <StatusBadge status={brief.status} />
                </div>
                {brief.summary && (
                  <p className="text-sm text-[#5f6368] mb-3">{brief.summary}</p>
                )}
                {brief.tasks && (
                  <div className="flex flex-wrap gap-2">
                    {(brief.tasks as BriefTask[]).map(
                      (task: BriefTask, i: number) => (
                        <span
                          key={i}
                          className={`text-xs px-2 py-1 rounded ${
                            task.status === "done"
                              ? "bg-green-50 text-green-700"
                              : "bg-[#f1f3f4] text-[#5f6368]"
                          }`}
                        >
                          {task.title}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-[#f1f3f4] text-[#5f6368]",
    sent: "bg-[#e8f0fe] text-[#1a73e8]",
    completed: "bg-green-50 text-green-700",
  };
  return (
    <span
      className={`text-xs px-2 py-1 rounded ${styles[status] || styles.draft}`}
    >
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    low: "bg-[#f1f3f4] text-[#5f6368]",
    medium: "bg-[#e8f0fe] text-[#1a73e8]",
    high: "bg-amber-50 text-amber-700",
    critical: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`text-xs px-2 py-1 rounded ${styles[priority] || styles.low}`}
    >
      {priority}
    </span>
  );
}
