import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const revalidate = 30;

async function getAgent(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forge_agents")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

async function getHeartbeats(agentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_heartbeats")
    .select("*")
    .eq("agent_id", agentId)
    .order("started_at", { ascending: false })
    .limit(20);
  return data || [];
}

function formatDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return "--";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatCents(cents: number | null): string {
  if (cents == null) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

function truncate(text: string | null, maxLen: number): string {
  if (!text) return "--";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = await getAgent(id);

  if (!agent) {
    return (
      <div>
        <Link href="/agents" className="text-[#1a73e8] text-sm hover:underline">
          &larr; Back to Agents
        </Link>
        <div className="mt-8 text-center text-[#5f6368] p-12 border border-[#dadce0] bg-white rounded-xl">
          Agent not found
        </div>
      </div>
    );
  }

  const heartbeats = await getHeartbeats(id);

  const spent = (agent.spent_monthly_cents as number) || 0;
  const budget = (agent.budget_monthly_cents as number) || 0;
  const budgetPct = budget > 0 ? (spent / budget) * 100 : 0;
  const budgetColor =
    budgetPct > 100 ? "bg-[#ea4335]" : budgetPct >= 80 ? "bg-amber-400" : "bg-[#34a853]";

  const completed = (agent.tasks_completed as number) || 0;
  const failed = (agent.tasks_failed as number) || 0;
  const total = completed + failed;
  const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "--";

  const skills = (agent.skills as string[]) || [];

  const statusConfig: Record<string, { dot: string; label: string }> = {
    active: { dot: "bg-[#34a853]", label: "Active" },
    paused: { dot: "bg-amber-400", label: "Paused" },
    budget_exceeded: { dot: "bg-[#ea4335]", label: "Budget Exceeded" },
    terminated: { dot: "bg-[#ea4335]", label: "Terminated" },
  };
  const statusStyle = statusConfig[agent.status as string] || {
    dot: "bg-[#5f6368]",
    label: agent.status as string,
  };

  return (
    <div>
      {/* Back link */}
      <Link href="/agents" className="text-[#1a73e8] text-sm hover:underline inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Agents
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <h1 className="text-2xl md:text-3xl font-medium text-[#202124]">{agent.name as string}</h1>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[#e8f0fe] border border-[#d3e3fd] text-[#1a73e8] text-xs rounded">
              {agent.role as string}
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusStyle.dot} animate-pulse`} />
              <span className="text-xs text-[#5f6368]">{statusStyle.label}</span>
            </div>
          </div>
        </div>
        {agent.title && (
          <p className="text-[#5f6368] mt-1">{agent.title as string}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left column: Details + Budget + Skills */}
        <div className="lg:col-span-1 space-y-4">
          {/* Details card */}
          <div className="bg-white border border-[#dadce0] rounded-xl p-5">
            <h2 className="text-sm font-medium text-[#202124] mb-3">Details</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#5f6368]">Model</span>
                <span className="font-mono text-[#202124]">{(agent.model as string) || "--"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5f6368]">Adapter</span>
                <span className="font-mono text-[#202124]">{(agent.adapter as string) || "--"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5f6368]">Heartbeat</span>
                <span className="text-[#202124]">{(agent.heartbeat_cron as string) || "--"}</span>
              </div>
            </div>
          </div>

          {/* Budget card */}
          <div className="bg-white border border-[#dadce0] rounded-xl p-5">
            <h2 className="text-sm font-medium text-[#202124] mb-3">Budget</h2>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[#5f6368]">
                {formatCents(spent)} / {formatCents(budget)}
              </span>
              <span className="text-[#202124] font-medium">
                {budget > 0 ? `${budgetPct.toFixed(0)}%` : "--"}
              </span>
            </div>
            <div className="w-full h-2 bg-[#f1f3f4] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${budgetColor}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Stats card */}
          <div className="bg-white border border-[#dadce0] rounded-xl p-5">
            <h2 className="text-sm font-medium text-[#202124] mb-3">Stats</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-lg font-semibold text-[#202124]">{completed}</p>
                <p className="text-xs text-[#5f6368]">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-[#202124]">{failed}</p>
                <p className="text-xs text-[#5f6368]">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-[#202124]">
                  {successRate !== "--" ? `${successRate}%` : "--"}
                </p>
                <p className="text-xs text-[#5f6368]">Success</p>
              </div>
            </div>
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="bg-white border border-[#dadce0] rounded-xl p-5">
              <h2 className="text-sm font-medium text-[#202124] mb-3">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-1 bg-[#f1f3f4] text-[#5f6368] text-xs rounded-full border border-[#dadce0]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Heartbeats + Identity */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recent heartbeats */}
          <div className="bg-white border border-[#dadce0] rounded-xl p-5">
            <h2 className="text-sm font-medium text-[#202124] mb-3">Recent Heartbeats</h2>
            {heartbeats.length === 0 ? (
              <p className="text-sm text-[#5f6368]">No heartbeats recorded</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#5f6368] border-b border-[#dadce0]">
                      <th className="pb-2 pr-3 font-medium">Order</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 pr-3 font-medium">Cost</th>
                      <th className="pb-2 pr-3 font-medium">Duration</th>
                      <th className="pb-2 font-medium">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heartbeats.map((hb) => {
                      const hbStatus = hb.status as string;
                      const statusDot =
                        hbStatus === "success"
                          ? "bg-[#34a853]"
                          : hbStatus === "error"
                            ? "bg-[#ea4335]"
                            : "bg-amber-400";
                      return (
                        <tr key={hb.id} className="border-b border-[#f1f3f4] last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs text-[#5f6368]">
                            {truncate(hb.order_id as string, 12)}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                              <span className="text-xs">{hbStatus}</span>
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {formatCents(hb.cost_cents as number)}
                          </td>
                          <td className="py-2 pr-3 text-xs text-[#5f6368]">
                            {formatDuration(hb.started_at as string, hb.ended_at as string)}
                          </td>
                          <td className="py-2 text-xs text-[#5f6368] max-w-xs">
                            {truncate(hb.output_summary as string, 80)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Identity prompt */}
          {agent.identity_prompt && (
            <details className="bg-white border border-[#dadce0] rounded-xl">
              <summary className="px-5 py-4 text-sm font-medium text-[#202124] cursor-pointer hover:bg-[#f8f9fa] rounded-xl select-none">
                Identity Prompt
              </summary>
              <div className="px-5 pb-5">
                <pre className="text-xs text-[#5f6368] whitespace-pre-wrap bg-[#f8f9fa] border border-[#dadce0] rounded-lg p-4 max-h-64 overflow-y-auto">
                  {agent.identity_prompt as string}
                </pre>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
