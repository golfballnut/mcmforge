import { createClient } from "@/lib/supabase/server";

export const revalidate = 30;

export default async function ResearchPage() {
  const supabase = await createClient();

  const { data: findings } = await supabase
    .from("research_findings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const items = findings ?? [];
  const unreviewed = items.filter((f) => f.status === "new");
  const reviewed = items.filter((f) => f.status !== "new");

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-stone-100">Research</h1>
        {unreviewed.length > 0 && (
          <span className="bg-orange-500/20 text-orange-400 text-sm font-medium px-3 py-1 rounded-full border border-orange-500/30">
            {unreviewed.length} new
          </span>
        )}
      </div>

      {/* New Findings */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-orange-400 mb-4">
          New Findings
        </h2>

        {unreviewed.length === 0 ? (
          <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-8 text-center">
            <p className="text-stone-500">No new research findings</p>
            <p className="text-stone-600 text-sm mt-1">
              Research agents scan AI news, competitors, and opportunities
              automatically
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {unreviewed.map((item) => (
              <div
                key={item.id}
                className="bg-stone-900/50 border border-orange-500/20 rounded-xl p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white">
                        {item.topic}
                      </h3>
                      <UrgencyBadge urgency={item.urgency} />
                    </div>
                    <p className="text-sm text-stone-400">{item.finding}</p>
                  </div>
                </div>

                {item.recommendation && (
                  <div className="bg-stone-800/50 rounded-lg p-3 mb-3">
                    <p className="text-xs text-stone-500 uppercase tracking-wide mb-1">
                      Recommendation
                    </p>
                    <p className="text-sm text-stone-300">
                      {item.recommendation}
                    </p>
                  </div>
                )}

                {item.proposed_action && (
                  <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-3 mb-3">
                    <p className="text-xs text-orange-400 uppercase tracking-wide mb-1">
                      Proposed Action
                    </p>
                    <p className="text-sm text-stone-300">
                      {item.proposed_action}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm">
                  {item.source_name && (
                    <span className="text-stone-500">
                      Source:{" "}
                      {item.source_url ? (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-400 hover:text-orange-300"
                        >
                          {item.source_name}
                        </a>
                      ) : (
                        <span className="text-stone-400">
                          {item.source_name}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="text-stone-600">
                    {formatDate(item.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reviewed */}
      <section>
        <h2 className="text-lg font-semibold text-stone-300 mb-4">
          Reviewed Findings
        </h2>

        {reviewed.length === 0 ? (
          <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-8 text-center text-stone-500">
            No reviewed findings yet
          </div>
        ) : (
          <div className="grid gap-3">
            {reviewed.map((item) => (
              <div
                key={item.id}
                className="bg-stone-900/50 border border-stone-800 rounded-xl p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white">{item.topic}</h3>
                    <UrgencyBadge urgency={item.urgency} />
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        item.status === "actioned"
                          ? "bg-green-500/10 text-green-400"
                          : item.status === "dismissed"
                            ? "bg-stone-500/10 text-stone-400"
                            : "bg-orange-500/10 text-orange-400"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-stone-500 line-clamp-2">
                  {item.finding}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-stone-600">
                  {item.reviewed_by && <span>By {item.reviewed_by}</span>}
                  <span>{formatDate(item.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const styles: Record<string, string> = {
    low: "bg-stone-500/10 text-stone-400",
    medium: "bg-orange-500/10 text-orange-400",
    high: "bg-amber-500/10 text-amber-400",
    critical: "bg-red-500/10 text-red-400",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${styles[urgency] || styles.low}`}
    >
      {urgency}
    </span>
  );
}
