import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentActions } from "./AgentActions";

export const revalidate = 0; // Cookie-dependent (active company) — must render per-request

// ── Types ──────────────────────────────────────────────────────────────────────

type Agent = {
  id: string;
  company_id: string | null;
  name: string;
  role: string | null;
  title: string | null;
  icon: string | null;
  status: string;
  adapter_type: string | null;
  adapter_config: Record<string, unknown> | null;
  last_heartbeat_at: string | null;
  reports_to: string | null;
  skills: string[] | null;
  created_at: string;
  instructions_file?: string | null;
  prompt_template?: string | null;
  can_create_agents?: boolean | null;
  can_create_issues?: boolean | null;
  monthly_budget_usd?: number | null;
  assignee_agent_id?: string | null;
};

type Run = {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  summary?: string | null;
};

type Issue = {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  priority: string;
  created_at: string;
};

type CostEvent = {
  id: string;
  cost_cents: number;
  occurred_at: string;
  billing_type: string;
};

// ── Data fetchers ──────────────────────────────────────────────────────────────

async function getAgent(id: string): Promise<Agent | null> {
  const supabase = await createForgeClient();
  const company = await getActiveCompany();
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();
  if (!data) return null;
  if (company && data.company_id !== company.id) notFound();
  return data as Agent | null;
}

async function getAgentRuns(agentId: string): Promise<Run[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("runs")
    .select("id, status, started_at, finished_at, created_at, model, input_tokens, output_tokens, cost_usd, summary")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data as Run[]) || [];
}

async function getAgentIssues(agentId: string): Promise<Issue[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("issues")
    .select("id, identifier, title, status, priority, created_at")
    .eq("assignee_agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data as Issue[]) || [];
}

async function getAgentCostEvents(agentId: string): Promise<CostEvent[]> {
  const supabase = await createForgeClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { data } = await supabase
    .from("cost_events")
    .select("id, cost_cents, occurred_at, billing_type")
    .eq("agent_id", agentId)
    .gte("occurred_at", monthStart.toISOString())
    .order("occurred_at", { ascending: false });
  return (data as CostEvent[]) || [];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDateTime(timestamp: string | null): string {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(started: string | null, finished: string | null): string {
  if (!started) return "--";
  const end = finished ? new Date(finished).getTime() : Date.now();
  const ms = end - new Date(started).getTime();
  if (ms < 0) return "--";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatCost(cost: number | null): string {
  if (cost == null) return "--";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function formatCostCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function shortenModel(model: string | null): string {
  if (!model) return "--";
  return model
    .replace("claude-", "")
    .replace("-20250219", "")
    .replace("-20241022", "")
    .replace("-20240620", "")
    .replace("-latest", "");
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function adapterLabel(adapterType: string | null): string {
  if (!adapterType) return "--";
  const map: Record<string, string> = {
    claude_local: "Claude (Local)",
    claude:       "Claude",
    gemini:       "Gemini",
    codex:        "Codex",
    openai:       "OpenAI",
  };
  return map[adapterType.toLowerCase()] ?? adapterType;
}

// ── Shared UI components ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; label: string; bg: string; text: string }> = {
  idle:       { dot: "bg-[#3fb950]", label: "Idle",       bg: "bg-[#0f2d1f] border border-[#3fb950]/30", text: "text-[#3fb950]" },
  running:    { dot: "bg-[#58a6ff]", label: "Running",    bg: "bg-[#1f3358] border border-[#58a6ff]/30", text: "text-[#58a6ff]" },
  paused:     { dot: "bg-[#d29922]", label: "Paused",     bg: "bg-[#3a2f00] border border-[#d29922]/30", text: "text-[#d29922]" },
  error:      { dot: "bg-[#f85149]", label: "Error",      bg: "bg-[#3d1f1f] border border-[#f85149]/30", text: "text-[#f85149]" },
  terminated: { dot: "bg-[#8b949e]", label: "Terminated", bg: "bg-[#161b22] border border-[#30363d]",    text: "text-[#8b949e]" },
};

const RUN_STATUS_CONFIG: Record<string, { label: string; badge: string; text: string; pulse?: boolean }> = {
  queued:    { label: "Queued",    badge: "bg-[#8b949e]/10 border border-[#8b949e]/30", text: "text-[#8b949e]" },
  running:   { label: "Running",   badge: "bg-[#58a6ff]/10 border border-[#58a6ff]/30", text: "text-[#58a6ff]", pulse: true },
  succeeded: { label: "Succeeded", badge: "bg-[#3fb950]/10 border border-[#3fb950]/30", text: "text-[#3fb950]" },
  failed:    { label: "Failed",    badge: "bg-[#f85149]/10 border border-[#f85149]/30", text: "text-[#f85149]" },
  timed_out: { label: "Timed Out", badge: "bg-[#d29922]/10 border border-[#d29922]/30", text: "text-[#d29922]" },
  cancelled: { label: "Cancelled", badge: "bg-[#8b949e]/10 border border-[#8b949e]/30", text: "text-[#8b949e]" },
};

const ISSUE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  backlog:     { label: "Backlog",     color: "bg-[#30363d] text-[#8b949e]" },
  todo:        { label: "Todo",        color: "bg-[#1f3358] text-[#58a6ff]" },
  in_progress: { label: "In Progress", color: "bg-[#3a2f00] text-[#d29922]" },
  in_review:   { label: "In Review",   color: "bg-[#2b1f5c] text-[#a371f7]" },
  done:        { label: "Done",        color: "bg-[#0f2d1f] text-[#3fb950]" },
  cancelled:   { label: "Cancelled",   color: "bg-[#3d1f1f] text-[#f85149]" },
};

const PRIORITY_ICON: Record<string, { color: string; label: string }> = {
  critical: { color: "text-[#f85149]", label: "!" },
  high:     { color: "text-[#d29922]", label: "↑" },
  medium:   { color: "text-[#8b949e]", label: "–" },
  low:      { color: "text-[#484f58]", label: "↓" },
};

function RunStatusBadge({ status }: { status: string }) {
  const cfg = RUN_STATUS_CONFIG[status] ?? { label: status, badge: "bg-[#8b949e]/10 border border-[#8b949e]/30", text: "text-[#8b949e]" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.text.replace("text-", "bg-")} ${cfg.pulse ? "animate-pulse" : ""}`} />
      {cfg.label}
    </span>
  );
}

function IssuePill({ status }: { status: string }) {
  const cfg = ISSUE_STATUS_CONFIG[status] ?? { label: status, color: "bg-[#30363d] text-[#8b949e]" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function ToggleDisplay({ value }: { value: boolean | null | undefined }) {
  const on = !!value;
  return (
    <div
      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
        on ? "bg-[#00d4aa]/20 border-[#00d4aa]/50" : "bg-[#30363d] border-[#484f58]"
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full shadow transition-transform ${
          on ? "translate-x-5 bg-[#00d4aa]" : "translate-x-1 bg-[#8b949e]"
        }`}
      />
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { key: "dashboard",     label: "Dashboard" },
  { key: "instructions",  label: "Instructions" },
  { key: "skills",        label: "Skills" },
  { key: "configuration", label: "Configuration" },
  { key: "runs",          label: "Runs" },
  { key: "budget",        label: "Budget" },
];

// ── Tab contents ───────────────────────────────────────────────────────────────

function DashboardTab({
  agent,
  runs,
  issues,
  costEvents,
}: {
  agent: Agent;
  runs: Run[];
  issues: Issue[];
  costEvents: CostEvent[];
}) {
  const latestRun = runs[0] ?? null;
  const totalRuns = runs.length;
  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const running = runs.filter((r) => r.status === "running").length;
  const successRate = totalRuns > 0 ? Math.round((succeeded / totalRuns) * 100) : null;

  const issuesByPriority = {
    critical: issues.filter((i) => i.priority === "critical").length,
    high:     issues.filter((i) => i.priority === "high").length,
    medium:   issues.filter((i) => i.priority === "medium").length,
    low:      issues.filter((i) => i.priority === "low").length,
  };

  const issuesByStatus = {
    open:        issues.filter((i) => !["done", "cancelled"].includes(i.status)).length,
    in_progress: issues.filter((i) => i.status === "in_progress").length,
    done:        issues.filter((i) => i.status === "done").length,
  };

  const spendCents = costEvents.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Latest run card */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
          Latest Run
        </h3>
        {latestRun ? (
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <RunStatusBadge status={latestRun.status} />
                <span className="text-xs font-mono text-[#8b949e]">
                  {latestRun.id.slice(0, 8)}…
                </span>
              </div>
              {latestRun.summary ? (
                <p className="text-sm text-[#8b949e]">{latestRun.summary}</p>
              ) : (
                <p className="text-xs text-[#484f58] italic">No summary available</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-[#8b949e]">{formatRelativeTime(latestRun.started_at ?? latestRun.created_at)}</p>
              <p className="text-xs font-mono text-[#8b949e] mt-0.5">{formatDuration(latestRun.started_at, latestRun.finished_at)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#484f58] italic">No runs yet</p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Run activity */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Run Activity</p>
          <p className="text-2xl font-mono font-semibold text-[#e6edf3]">{totalRuns}</p>
          <div className="mt-1 flex gap-2 text-xs">
            {running > 0 && <span className="text-[#58a6ff]">{running} running</span>}
            {succeeded > 0 && <span className="text-[#3fb950]">{succeeded} ok</span>}
            {failed > 0 && <span className="text-[#f85149]">{failed} failed</span>}
          </div>
        </div>

        {/* Issues by priority */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Issues by Priority</p>
          <p className="text-2xl font-mono font-semibold text-[#e6edf3]">{issues.length}</p>
          <div className="mt-1 flex gap-2 text-xs flex-wrap">
            {issuesByPriority.critical > 0 && (
              <span className="text-[#f85149]">{issuesByPriority.critical} crit</span>
            )}
            {issuesByPriority.high > 0 && (
              <span className="text-[#d29922]">{issuesByPriority.high} high</span>
            )}
            {issuesByPriority.medium > 0 && (
              <span className="text-[#8b949e]">{issuesByPriority.medium} med</span>
            )}
          </div>
        </div>

        {/* Issues by status */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Issues by Status</p>
          <p className="text-2xl font-mono font-semibold text-[#e6edf3]">{issuesByStatus.open}</p>
          <div className="mt-1 flex gap-2 text-xs">
            {issuesByStatus.in_progress > 0 && (
              <span className="text-[#d29922]">{issuesByStatus.in_progress} active</span>
            )}
            {issuesByStatus.done > 0 && (
              <span className="text-[#3fb950]">{issuesByStatus.done} done</span>
            )}
          </div>
        </div>

        {/* Success rate */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Success Rate</p>
          <p className="text-2xl font-mono font-semibold text-[#e6edf3]">
            {successRate != null ? `${successRate}%` : "--"}
          </p>
          <p className="text-xs text-[#8b949e] mt-1">
            {totalRuns > 0 ? `${totalRuns} runs sampled` : "No runs yet"}
          </p>
        </div>
      </div>

      {/* Recent issues */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
          Recent Issues
        </h3>
        {issues.length === 0 ? (
          <p className="text-sm text-[#484f58] italic">No issues assigned to this agent</p>
        ) : (
          <div className="space-y-2">
            {issues.slice(0, 5).map((issue) => {
              const priCfg = PRIORITY_ICON[issue.priority] ?? PRIORITY_ICON.medium;
              return (
                <Link
                  key={issue.id}
                  href={`/issues/${issue.id}`}
                  className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-[#1c2333] transition-colors group"
                >
                  <span className={`text-sm font-bold w-4 text-center ${priCfg.color}`}>
                    {priCfg.label}
                  </span>
                  <span className="flex-1 text-sm text-[#e6edf3] truncate group-hover:text-[#00d4aa] transition-colors">
                    {issue.title}
                  </span>
                  <IssuePill status={issue.status} />
                  <span className="text-xs text-[#484f58] shrink-0">
                    {formatRelativeTime(issue.created_at)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Costs */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
          Costs (this month)
        </h3>
        <div className="flex items-center gap-6">
          <div>
            <p className="text-2xl font-mono font-semibold text-[#00d4aa]">
              {formatCostCents(spendCents)}
            </p>
            <p className="text-xs text-[#8b949e] mt-0.5">{costEvents.length} events</p>
          </div>
          {agent.monthly_budget_usd != null && (
            <div className="flex-1">
              <div className="flex justify-between text-xs text-[#8b949e] mb-1">
                <span>Budget</span>
                <span>${agent.monthly_budget_usd.toFixed(2)}</span>
              </div>
              <div className="h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00d4aa] rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (spendCents / 100 / agent.monthly_budget_usd) * 100).toFixed(1)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InstructionsTab({ agent }: { agent: Agent }) {
  const content = agent.prompt_template || agent.instructions_file || null;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-[#e6edf3]">Prompt Template / Instructions</h3>
          <p className="text-xs text-[#8b949e] mt-0.5">
            The system prompt or instructions file loaded when this agent runs.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1c2333] border border-[#30363d] text-[#8b949e] text-xs rounded-md hover:border-[#00d4aa] hover:text-[#e6edf3] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Edit
        </button>
      </div>
      {content ? (
        <pre className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 text-xs font-mono text-[#8b949e] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
          {content}
        </pre>
      ) : (
        <div className="bg-[#161b22] border border-dashed border-[#30363d] rounded-lg p-12 text-center">
          <p className="text-sm text-[#8b949e]">No instructions configured</p>
          <p className="text-xs text-[#484f58] mt-1">
            Set <span className="font-mono">prompt_template</span> or{" "}
            <span className="font-mono">instructions_file</span> on this agent.
          </p>
        </div>
      )}
    </div>
  );
}

function SkillsTab({ agent }: { agent: Agent }) {
  const skills = agent.skills ?? [];
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-medium text-[#e6edf3]">Skills</h3>
        {skills.length > 0 && (
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-[#0d1117] border border-[#30363d] text-[#00d4aa]">
            {skills.length}
          </span>
        )}
      </div>
      {skills.length === 0 ? (
        <div className="bg-[#161b22] border border-dashed border-[#30363d] rounded-lg p-12 text-center">
          <p className="text-sm text-[#8b949e]">No skills assigned</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <div
              key={skill}
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3 hover:border-[#00d4aa]/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[#00d4aa] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm text-[#e6edf3] font-medium truncate">{skill}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigurationTab({ agent }: { agent: Agent }) {
  const config = agent.adapter_config ?? {};
  const model = (config.model as string) || "--";
  const maxTurns = (config.maxTurns as number) ?? null;
  const timeoutSec = (config.timeoutSec as number) ?? null;

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363d]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Identity</p>
        </div>
        <div className="divide-y divide-[#21262d]">
          {[
            { label: "Name",         value: agent.name },
            { label: "Role",         value: agent.role ?? "--" },
            { label: "Title",        value: agent.title ?? "--" },
            { label: "Adapter type", value: adapterLabel(agent.adapter_type) },
            { label: "Model",        value: model },
            ...(maxTurns !== null ? [{ label: "Max turns", value: String(maxTurns) }] : []),
            ...(timeoutSec !== null ? [{ label: "Timeout", value: `${timeoutSec}s` }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[#8b949e]">{label}</span>
              <span className="text-sm font-mono text-[#e6edf3]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Permissions */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363d]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Permissions</p>
        </div>
        <div className="divide-y divide-[#21262d]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-[#e6edf3]">Can create agents</p>
              <p className="text-xs text-[#8b949e]">Permission to spawn sub-agents</p>
            </div>
            <ToggleDisplay value={agent.can_create_agents} />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-[#e6edf3]">Can create issues</p>
              <p className="text-xs text-[#8b949e]">Permission to open new issues</p>
            </div>
            <ToggleDisplay value={agent.can_create_issues} />
          </div>
        </div>
      </div>

      {/* Budget */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363d]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Budget</p>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-[#8b949e]">Monthly budget</span>
          <span className="text-sm font-mono text-[#e6edf3]">
            {agent.monthly_budget_usd != null ? `$${agent.monthly_budget_usd.toFixed(2)}` : "Unlimited"}
          </span>
        </div>
      </div>

      {/* Test connection */}
      <div className="flex justify-end">
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#1c2333] border border-[#30363d] text-sm text-[#8b949e] rounded-md hover:border-[#00d4aa] hover:text-[#e6edf3] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Test connection
        </button>
      </div>
    </div>
  );
}

function RunsTab({ runs }: { runs: Run[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-[#e6edf3]">Run History</h3>
          <p className="text-xs text-[#8b949e] mt-0.5">Last {runs.length} runs for this agent</p>
        </div>
        <Link
          href="/runs"
          className="text-xs text-[#00d4aa] hover:text-[#00bfaa] transition-colors"
        >
          View all runs
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="bg-[#161b22] border border-dashed border-[#30363d] rounded-lg p-12 text-center">
          <p className="text-sm text-[#8b949e]">No runs yet</p>
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[140px_90px_90px_1fr_80px_80px] gap-x-3 px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] text-xs font-medium text-[#8b949e] uppercase tracking-wide">
            <div>Status</div>
            <div>Started</div>
            <div>Duration</div>
            <div>Model</div>
            <div className="text-right">Tokens</div>
            <div className="text-right">Cost</div>
          </div>
          <div className="divide-y divide-[#21262d]">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="grid grid-cols-[140px_90px_90px_1fr_80px_80px] gap-x-3 px-4 py-3 bg-[#161b22] hover:bg-[#1c2333] transition-colors items-center"
              >
                <div><RunStatusBadge status={run.status} /></div>
                <div>
                  <span className="text-xs text-[#8b949e]">
                    {formatRelativeTime(run.started_at ?? run.created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-mono text-[#8b949e]">
                    {formatDuration(run.started_at, run.finished_at)}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-mono text-[#8b949e] truncate block" title={run.model ?? ""}>
                    {shortenModel(run.model)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-[#8b949e]">
                    {run.input_tokens + run.output_tokens > 0
                      ? (run.input_tokens + run.output_tokens).toLocaleString()
                      : "--"}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-mono ${run.cost_usd ? "text-[#00d4aa]" : "text-[#8b949e]"}`}>
                    {formatCost(run.cost_usd)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetTab({
  agent,
  costEvents,
}: {
  agent: Agent;
  costEvents: CostEvent[];
}) {
  const spendCents = costEvents.reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);
  const budgetUsd = agent.monthly_budget_usd ?? null;
  const pct = budgetUsd != null && budgetUsd > 0
    ? Math.min(100, (spendCents / 100 / budgetUsd) * 100)
    : null;

  const apiCents = costEvents.filter((e) => e.billing_type === "api")
    .reduce((s, e) => s + e.cost_cents, 0);
  const subCents = costEvents.filter((e) => e.billing_type === "subscription")
    .reduce((s, e) => s + e.cost_cents, 0);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Spend This Month</p>
          <p className="text-2xl font-mono font-semibold text-[#00d4aa]">
            {formatCostCents(spendCents)}
          </p>
          <p className="text-xs text-[#8b949e] mt-0.5">{costEvents.length} events</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Monthly Budget</p>
          <p className="text-2xl font-mono font-semibold text-[#e6edf3]">
            {budgetUsd != null ? `$${budgetUsd.toFixed(2)}` : "∞"}
          </p>
          <p className="text-xs text-[#8b949e] mt-0.5">
            {budgetUsd != null ? "configured" : "unlimited"}
          </p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Remaining</p>
          <p className={`text-2xl font-mono font-semibold ${pct != null && pct > 80 ? "text-[#f85149]" : "text-[#e6edf3]"}`}>
            {budgetUsd != null
              ? `$${Math.max(0, budgetUsd - spendCents / 100).toFixed(2)}`
              : "--"}
          </p>
          <p className="text-xs text-[#8b949e] mt-0.5">
            {pct != null ? `${pct.toFixed(1)}% used` : "No budget set"}
          </p>
        </div>
      </div>

      {/* Budget bar */}
      {pct != null && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <div className="flex justify-between text-xs text-[#8b949e] mb-2">
            <span>Budget utilization</span>
            <span>{pct.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 bg-[#30363d] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct > 90 ? "bg-[#f85149]" : pct > 75 ? "bg-[#d29922]" : "bg-[#00d4aa]"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-[#484f58] mt-1.5">
            <span>{formatCostCents(spendCents)} spent</span>
            <span>${budgetUsd?.toFixed(2)} budget</span>
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363d]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">Billing Breakdown</p>
        </div>
        <div className="divide-y divide-[#21262d]">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#58a6ff]" />
              <span className="text-sm text-[#e6edf3]">API inference</span>
            </div>
            <span className="text-sm font-mono text-[#e6edf3]">{formatCostCents(apiCents)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#8b949e]" />
              <span className="text-sm text-[#e6edf3]">Subscription (Claude Max)</span>
            </div>
            <span className="text-sm font-mono text-[#e6edf3]">{formatCostCents(subCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeTab = sp?.tab ?? "dashboard";

  const agent = await getAgent(id);

  if (!agent) {
    return (
      <div>
        <Link
          href="/agents"
          className="inline-flex items-center gap-1 text-[#00d4aa] text-sm hover:text-[#00bfaa] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Agents
        </Link>
        <div className="mt-8 text-center text-[#8b949e] p-12 border border-[#30363d] bg-[#161b22] rounded-lg">
          Agent not found
        </div>
      </div>
    );
  }

  // Fetch all data in parallel
  const [runs, issues, costEvents] = await Promise.all([
    getAgentRuns(id),
    getAgentIssues(id),
    getAgentCostEvents(id),
  ]);

  const statusCfg = STATUS_CONFIG[agent.status] ?? {
    dot: "bg-[#8b949e]",
    label: agent.status,
    bg: "bg-[#161b22] border border-[#30363d]",
    text: "text-[#8b949e]",
  };

  const avatarInitials = initials(agent.name);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mb-4">
        <Link href="/agents" className="hover:text-[#e6edf3] transition-colors">
          agents
        </Link>
        <span>/</span>
        <span className="text-[#e6edf3] truncate max-w-[200px]">{agent.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          {/* Large avatar */}
          <div className="w-14 h-14 rounded-xl bg-[#1c2333] border border-[#30363d] flex items-center justify-center shrink-0">
            {agent.icon ? (
              <span className="text-2xl leading-none">{agent.icon}</span>
            ) : (
              <span className="text-lg font-semibold text-[#00d4aa] font-mono">
                {avatarInitials}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-[#e6edf3]">{agent.name}</h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${
                    agent.status === "running" ? "animate-pulse" : ""
                  }`}
                />
                {statusCfg.label}
              </span>
            </div>
            {agent.role && (
              <p className="text-sm text-[#8b949e] mt-0.5">{agent.role}</p>
            )}
            {agent.title && (
              <p className="text-xs text-[#484f58] mt-0.5">{agent.title}</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <AgentActions
            agentId={id}
            companyId={agent.company_id}
            status={agent.status}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-[#30363d] mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.key === "dashboard" ? `/agents/${id}` : `/agents/${id}?tab=${tab.key}`}
              className={`px-4 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-[#00d4aa] text-[#e6edf3] font-medium"
                  : "border-transparent text-[#8b949e] hover:text-[#e6edf3] hover:border-[#30363d]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "dashboard" && (
        <DashboardTab agent={agent} runs={runs} issues={issues} costEvents={costEvents} />
      )}
      {activeTab === "instructions" && <InstructionsTab agent={agent} />}
      {activeTab === "skills" && <SkillsTab agent={agent} />}
      {activeTab === "configuration" && <ConfigurationTab agent={agent} />}
      {activeTab === "runs" && <RunsTab runs={runs} />}
      {activeTab === "budget" && <BudgetTab agent={agent} costEvents={costEvents} />}
    </div>
  );
}
