import { createClient } from "@/lib/supabase/server";
import { approveItem, rejectItem } from "./actions";

export const revalidate = 30;

export default async function ApprovalsPage() {
  const supabase = await createClient();

  const { data: pending } = await supabase
    .from("approval_queue")
    .select("*, company_registry(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: history } = await supabase
    .from("approval_queue")
    .select("*, company_registry(name)")
    .in("status", ["approved", "rejected"])
    .order("decided_at", { ascending: false });

  const pendingItems = pending ?? [];
  const historyItems = history ?? [];

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatCost(cost: number | null) {
    if (cost == null) return null;
    return `$${cost.toFixed(2)}`;
  }

  return (
    <div className="min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-stone-100">Approvals</h1>
        {pendingItems.length > 0 && (
          <span className="flex items-center gap-1.5 bg-amber-500/20 text-amber-400 text-sm font-medium px-3 py-1 rounded-full border border-amber-500/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            {pendingItems.length} pending
          </span>
        )}
      </div>

      {/* Pending Approvals */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-amber-400 mb-4">
          Pending Approvals
        </h2>

        {pendingItems.length === 0 ? (
          <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-8 text-center text-stone-500">
            No pending approvals
          </div>
        ) : (
          <div className="grid gap-4">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="bg-stone-900/50 border border-amber-500/20 rounded-xl p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-white">{item.title}</h3>
                      <span className="text-xs bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full border border-stone-700">
                        {item.approval_type}
                      </span>
                      {item.company_registry?.name && (
                        <span className="text-xs text-stone-400">
                          {item.company_registry.name}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-stone-400 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-400 shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wide">
                      Pending
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap text-sm">
                  {formatCost(item.estimated_cost) && (
                    <span className="text-stone-300">
                      Cost:{" "}
                      <span className="font-medium text-white">
                        {formatCost(item.estimated_cost)}
                      </span>
                    </span>
                  )}
                  {item.preview_url && (
                    <a
                      href={item.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
                    >
                      Preview
                    </a>
                  )}
                  <span className="text-stone-500">
                    Submitted {formatDate(item.created_at)}
                  </span>
                </div>

                {/* Approve / Reject Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4 pt-4 border-t border-stone-800">
                  <form action={approveItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      className="w-full sm:w-auto px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectItem} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input
                      type="text"
                      name="notes"
                      placeholder="Rejection reason (optional)"
                      className="px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-sm text-white placeholder-stone-500 focus:outline-none focus:border-red-500 w-full sm:w-64"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-sm font-medium rounded-lg border border-red-500/30 hover:border-red-500 transition-colors"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Decision History */}
      <section>
        <h2 className="text-lg font-semibold text-stone-300 mb-4">
          Decision History
        </h2>

        {historyItems.length === 0 ? (
          <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-8 text-center text-stone-500">
            No decisions yet
          </div>
        ) : (
          <div className="grid gap-3">
            {historyItems.map((item) => {
              const approved = item.status === "approved";
              return (
                <div
                  key={item.id}
                  className="bg-stone-900/50 border border-stone-800 rounded-xl p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-medium text-white">{item.title}</h3>
                        <span className="text-xs bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full border border-stone-700">
                          {item.approval_type}
                        </span>
                        {item.company_registry?.name && (
                          <span className="text-xs text-stone-400">
                            {item.company_registry.name}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-stone-500 line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium uppercase tracking-wide shrink-0 px-2.5 py-1 rounded-full ${
                        approved
                          ? "bg-green-500/15 text-green-400 border border-green-500/25"
                          : "bg-red-500/15 text-red-400 border border-red-500/25"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    {formatCost(item.estimated_cost) && (
                      <span className="text-stone-400">
                        Cost:{" "}
                        <span className="text-stone-300">
                          {formatCost(item.estimated_cost)}
                        </span>
                      </span>
                    )}
                    {item.preview_url && (
                      <a
                        href={item.preview_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
                      >
                        Preview
                      </a>
                    )}
                    {item.decided_by && (
                      <span className="text-stone-400">
                        By{" "}
                        <span className="text-stone-300">{item.decided_by}</span>
                      </span>
                    )}
                    {item.decided_at && (
                      <span className="text-stone-500">
                        {formatDate(item.decided_at)}
                      </span>
                    )}
                  </div>

                  {item.decision_notes && (
                    <p className="mt-2 text-sm text-stone-400 bg-stone-800/50 rounded-lg px-3 py-2">
                      {item.decision_notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
