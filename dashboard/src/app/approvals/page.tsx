import { createClient } from "@/lib/supabase/server";
import { approveItem, rejectItem } from "./actions";

export const revalidate = 30;

export default async function ApprovalsPage() {
  const supabase = await createClient();

  const { data: pending } = await supabase
    .from("approval_queue")
    .select("*, company_registry(name), agents!approval_queue_requested_by_agent_id_fkey(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: history } = await supabase
    .from("approval_queue")
    .select("*, company_registry(name), agents!approval_queue_requested_by_agent_id_fkey(name)")
    .in("status", ["approved", "rejected"])
    .order("decided_at", { ascending: false });

  const pendingItems = pending ?? [];
  const historyItems = history ?? [];

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "\u2014";
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
    <div className="min-h-screen text-[#202124]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-medium text-[#202124]">Approvals</h1>
        {pendingItems.length > 0 && (
          <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 text-sm font-medium px-3 py-1 rounded-full border border-amber-200">
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
        <h2 className="text-lg font-medium text-[#1a73e8] mb-4">
          Pending Approvals
        </h2>

        {pendingItems.length === 0 ? (
          <div className="bg-white border border-[#dadce0] rounded-xl p-8 text-center text-[#5f6368]">
            No pending approvals
          </div>
        ) : (
          <div className="grid gap-4">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-amber-200 rounded-xl p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-medium text-[#202124]">{item.title}</h3>
                      <span className="text-xs bg-[#f1f3f4] text-[#5f6368] px-2 py-0.5 rounded-full border border-[#dadce0]">
                        {item.approval_type}
                      </span>
                      {item.company_registry?.name && (
                        <span className="text-xs text-[#5f6368]">
                          {item.company_registry.name}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-[#5f6368] line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-600 shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wide">
                      Pending
                    </span>
                  </div>
                </div>

                {/* Requester + payload */}
                <div className="flex items-center gap-3 flex-wrap text-xs text-[#5f6368] mb-2">
                  {(item as any).agents?.name && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {(item as any).agents.name}
                    </span>
                  )}
                  {(item as any).payload && (
                    <details className="w-full mt-1">
                      <summary className="cursor-pointer text-[#1a73e8] hover:underline text-xs select-none">
                        View payload
                      </summary>
                      <pre className="mt-1.5 p-2 bg-[#f1f3f4] rounded text-[10px] text-[#202124] overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                        {JSON.stringify((item as any).payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>

                <div className="flex items-center gap-4 flex-wrap text-sm">
                  {formatCost(item.estimated_cost) && (
                    <span className="text-[#5f6368]">
                      Cost:{" "}
                      <span className="font-medium text-[#202124]">
                        {formatCost(item.estimated_cost)}
                      </span>
                    </span>
                  )}
                  {item.preview_url && (
                    <a
                      href={item.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1a73e8] hover:underline"
                    >
                      Preview
                    </a>
                  )}
                  <span className="text-[#5f6368]">
                    Submitted {formatDate(item.created_at)}
                  </span>
                </div>

                {/* Approve / Reject Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4 pt-4 border-t border-[#dadce0]">
                  <form action={approveItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      className="w-full sm:w-auto px-4 py-2 bg-[#34a853] hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
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
                      className="px-3 py-2 bg-white border border-[#dadce0] rounded-lg text-sm text-[#202124] placeholder-[#5f6368] focus:outline-none focus:border-[#1a73e8] w-full sm:w-64"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg border border-red-200 hover:border-red-300 transition-colors"
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
        <h2 className="text-lg font-medium text-[#202124] mb-4">
          Decision History
        </h2>

        {historyItems.length === 0 ? (
          <div className="bg-white border border-[#dadce0] rounded-xl p-8 text-center text-[#5f6368]">
            No decisions yet
          </div>
        ) : (
          <div className="grid gap-3">
            {historyItems.map((item) => {
              const approved = item.status === "approved";
              return (
                <div
                  key={item.id}
                  className="bg-white border border-[#dadce0] rounded-xl p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-medium text-[#202124]">{item.title}</h3>
                        <span className="text-xs bg-[#f1f3f4] text-[#5f6368] px-2 py-0.5 rounded-full border border-[#dadce0]">
                          {item.approval_type}
                        </span>
                        {item.company_registry?.name && (
                          <span className="text-xs text-[#5f6368]">
                            {item.company_registry.name}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-[#5f6368] line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium uppercase tracking-wide shrink-0 px-2.5 py-1 rounded-full ${
                        approved
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    {formatCost(item.estimated_cost) && (
                      <span className="text-[#5f6368]">
                        Cost:{" "}
                        <span className="text-[#202124]">
                          {formatCost(item.estimated_cost)}
                        </span>
                      </span>
                    )}
                    {item.preview_url && (
                      <a
                        href={item.preview_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1a73e8] hover:underline"
                      >
                        Preview
                      </a>
                    )}
                    {item.decided_by && (
                      <span className="text-[#5f6368]">
                        By{" "}
                        <span className="text-[#202124]">{item.decided_by}</span>
                      </span>
                    )}
                    {item.decided_at && (
                      <span className="text-[#5f6368]">
                        {formatDate(item.decided_at)}
                      </span>
                    )}
                  </div>

                  {item.decision_notes && (
                    <p className="mt-2 text-sm text-[#5f6368] bg-[#f1f3f4] rounded-lg px-3 py-2">
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
