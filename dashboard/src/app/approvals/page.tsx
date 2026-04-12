import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import { approveItem, rejectItem } from "./actions";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

export default async function ApprovalsPage() {
  const supabase = await createForgeClient();
  const company = await getActiveCompany();

  let pendingQuery = supabase
    .from("approvals")
    .select("*, agent:agents!approvals_requested_by_agent_id_fkey(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  let historyQuery = supabase
    .from("approvals")
    .select("*, agent:agents!approvals_requested_by_agent_id_fkey(name)")
    .in("status", ["approved", "rejected"])
    .order("decided_at", { ascending: false })
    .limit(50);

  if (company) {
    pendingQuery = pendingQuery.eq("company_id", company.id);
    historyQuery = historyQuery.eq("company_id", company.id);
  }

  const [{ data: pending }, { data: history }] = await Promise.all([
    pendingQuery,
    historyQuery,
  ]);

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-[#e6edf3]">Approvals</h1>
        {pendingItems.length > 0 && (
          <span className="flex items-center gap-1.5 bg-[#3a2f00] text-[#d29922] text-sm font-medium px-3 py-1 rounded-full border border-[#d29922]/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#d29922] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#d29922]" />
            </span>
            {pendingItems.length} pending
          </span>
        )}
      </div>

      {/* Pending Approvals */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8b949e] mb-3">
          Pending
        </h2>

        {pendingItems.length === 0 ? (
          <div className="border border-[#30363d] rounded-lg p-8 text-center text-[#8b949e] bg-[#0d1117]">
            No pending approvals
          </div>
        ) : (
          <div className="grid gap-3">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="bg-[#161b22] border border-[#d29922]/30 rounded-lg p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs bg-[#21262d] text-[#8b949e] px-2 py-0.5 rounded-full border border-[#30363d]">
                        {item.type}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#d29922]">Pending</span>
                </div>

                <div className="flex items-center gap-3 text-xs text-[#8b949e] mb-3">
                  {(item as { agent?: { name: string } | null }).agent?.name && (
                    <span>{(item as { agent?: { name: string } | null }).agent!.name}</span>
                  )}
                  <span>{formatDate(item.created_at)}</span>
                </div>

                {item.payload && (
                  <details className="mb-3">
                    <summary className="cursor-pointer text-[#58a6ff] hover:underline text-xs">
                      View payload
                    </summary>
                    <pre className="mt-1.5 p-2 bg-[#0d1117] rounded text-[10px] text-[#c9d1d9] overflow-x-auto max-h-32 border border-[#30363d]">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </details>
                )}

                <div className="flex items-center gap-3 pt-3 border-t border-[#30363d]">
                  <form action={approveItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium rounded-md transition-colors"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectItem} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input
                      type="text"
                      name="notes"
                      placeholder="Reason (optional)"
                      className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] w-48"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#3d1f1f] hover:bg-[#4d2525] text-[#f85149] text-sm font-medium rounded-md border border-[#f85149]/30 transition-colors"
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8b949e] mb-3">
          History
        </h2>

        {historyItems.length === 0 ? (
          <div className="border border-[#30363d] rounded-lg p-8 text-center text-[#8b949e] bg-[#0d1117]">
            No decisions yet
          </div>
        ) : (
          <div className="grid gap-2">
            {historyItems.map((item) => {
              const approved = item.status === "approved";
              return (
                <div
                  key={item.id}
                  className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex items-center gap-4"
                >
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      approved
                        ? "bg-[#0f2d1f] text-[#3fb950] border border-[#3fb950]/30"
                        : "bg-[#3d1f1f] text-[#f85149] border border-[#f85149]/30"
                    }`}
                  >
                    {item.status}
                  </span>
                  <span className="text-xs text-[#8b949e] bg-[#21262d] px-2 py-0.5 rounded-full border border-[#30363d]">
                    {item.type}
                  </span>
                  {(item as Record<string, unknown>).agent && (
                    <span className="text-xs text-[#c9d1d9]">
                      {((item as Record<string, unknown>).agent as { name: string }).name}
                    </span>
                  )}
                  <span className="text-xs text-[#484f58] ml-auto">
                    {formatDate(item.decided_at)}
                  </span>
                  {item.decision_note && (
                    <span className="text-xs text-[#8b949e] max-w-[200px] truncate">
                      {item.decision_note}
                    </span>
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
