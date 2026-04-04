import { createForgeClient } from "@/lib/supabase/forge-server";
import Link from "next/link";

export const revalidate = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

type Goal = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  parent_id: string | null;
  owner_agent_id: string | null;
  created_at: string;
  updated_at: string;
};

type Company = { id: string; name: string; slug: string };

type GoalWithMeta = Goal & {
  companyName: string;
  children: GoalWithMeta[];
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getGoals(): Promise<{ roots: GoalWithMeta[]; total: number }> {
  const supabase = await createForgeClient();

  const [{ data: goals }, { data: companies }] = await Promise.all([
    supabase.from("goals").select("*").order("created_at", { ascending: true }),
    supabase.from("companies").select("id, name, slug"),
  ]);

  const companyMap = Object.fromEntries(
    ((companies as Company[]) || []).map((c) => [c.id, c])
  );

  const goalList = (goals as Goal[]) || [];
  const total = goalList.length;

  // Build enriched map
  const enriched = new Map<string, GoalWithMeta>();
  for (const g of goalList) {
    enriched.set(g.id, {
      ...g,
      companyName: companyMap[g.company_id]?.name ?? "—",
      children: [],
    });
  }

  // Wire up parent → children
  const roots: GoalWithMeta[] = [];
  for (const g of enriched.values()) {
    if (g.parent_id && enriched.has(g.parent_id)) {
      enriched.get(g.parent_id)!.children.push(g);
    } else {
      roots.push(g);
    }
  }

  return { roots, total };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; dot: string; label: string }
> = {
  active:    { bg: "bg-[#3fb950]/10",  text: "text-[#3fb950]",  dot: "bg-[#3fb950]",  label: "Active" },
  planned:   { bg: "bg-[#8b949e]/10",  text: "text-[#8b949e]",  dot: "bg-[#8b949e]",  label: "Planned" },
  completed: { bg: "bg-[#58a6ff]/10",  text: "text-[#58a6ff]",  dot: "bg-[#58a6ff]",  label: "Completed" },
  cancelled: { bg: "bg-[#f85149]/10",  text: "text-[#f85149]",  dot: "bg-[#f85149]",  label: "Cancelled" },
  paused:    { bg: "bg-[#d29922]/10",  text: "text-[#d29922]",  dot: "bg-[#d29922]",  label: "Paused" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    bg: "bg-[#21262d]",
    text: "text-[#8b949e]",
    dot: "bg-[#8b949e]",
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Level badge ──────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<string, { text: string; label: string }> = {
  company:    { text: "text-[#d29922]",  label: "Company" },
  team:       { text: "text-[#58a6ff]",  label: "Team" },
  individual: { text: "text-[#8b949e]",  label: "Individual" },
  milestone:  { text: "text-[#bc8cff]",  label: "Milestone" },
};

function LevelBadge({ level }: { level: string }) {
  const cfg = LEVEL_CONFIG[level] ?? { text: "text-[#8b949e]", label: level };
  return (
    <span className={`text-xs font-mono ${cfg.text}`}>{cfg.label}</span>
  );
}

// ─── Goal row (recursive) ─────────────────────────────────────────────────────

function GoalRow({
  goal,
  depth = 0,
}: {
  goal: GoalWithMeta;
  depth?: number;
}) {
  const hasChildren = goal.children.length > 0;
  const indent = depth * 20;

  return (
    <>
      <div
        className="grid grid-cols-[1fr_140px_120px_110px] gap-x-4 px-4 py-3 bg-[#161b22] hover:bg-[#1c2333] transition-colors items-center border-b border-[#21262d] last:border-b-0 cursor-pointer"
      >
        {/* Title + expand indicator */}
        <div className="min-w-0 flex items-start gap-2" style={{ paddingLeft: `${indent}px` }}>
          {hasChildren ? (
            <span className="mt-0.5 shrink-0 text-[#8b949e]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          ) : depth > 0 ? (
            <span className="mt-0.5 shrink-0 text-[#30363d]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#e6edf3] truncate">{goal.title}</p>
            {goal.description && (
              <p className="text-xs text-[#8b949e] mt-0.5 truncate">{goal.description}</p>
            )}
          </div>
        </div>

        {/* Company */}
        <div>
          <span className="inline-block px-1.5 py-0.5 text-xs font-mono rounded bg-[#0d1117] border border-[#30363d] text-[#8b949e] truncate max-w-full">
            {goal.companyName}
          </span>
        </div>

        {/* Level */}
        <div>
          <LevelBadge level={goal.level} />
        </div>

        {/* Status */}
        <div>
          <StatusBadge status={goal.status} />
        </div>
      </div>

      {/* Children — always expanded */}
      {hasChildren &&
        goal.children.map((child) => (
          <GoalRow key={child.id} goal={child} depth={depth + 1} />
        ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GoalsPage() {
  const { roots, total } = await getGoals();

  const flatGoals = (goals: GoalWithMeta[]): GoalWithMeta[] =>
    goals.flatMap((g) => [g, ...flatGoals(g.children)]);
  const all = flatGoals(roots);

  const activeCount = all.filter((g) => g.status === "active").length;
  const completedCount = all.filter((g) => g.status === "completed").length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Goals
          </h1>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-[#161b22] border border-[#30363d] text-[#8b949e]">
            {total}
          </span>
          {activeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-[#161b22] border border-[#30363d] text-[#3fb950]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
              {activeCount} active
            </span>
          )}
          {completedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-[#161b22] border border-[#30363d] text-[#58a6ff]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff]" />
              {completedCount} completed
            </span>
          )}
        </div>

        <Link
          href="/goals/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#00d4aa] text-[#00d4aa] text-sm font-medium hover:bg-[#00d4aa]/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Goal
        </Link>
      </div>

      {/* Table */}
      {roots.length === 0 ? (
        <div className="border border-[#30363d] bg-[#161b22] rounded-lg p-12 text-center">
          <div className="w-10 h-10 rounded-full bg-[#0d1117] border border-[#30363d] flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm text-[#8b949e]">No goals defined yet</p>
          <p className="text-xs text-[#484f58] mt-1">
            Create a goal to track company, team, or individual objectives.
          </p>
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_140px_120px_110px] gap-x-4 px-4 py-2.5 bg-[#0d1117] border-b border-[#30363d] text-xs font-medium text-[#8b949e] uppercase tracking-wide">
            <div>Title</div>
            <div>Company</div>
            <div>Level</div>
            <div>Status</div>
          </div>

          {/* Goal rows */}
          <div>
            {roots.map((goal) => (
              <GoalRow key={goal.id} goal={goal} depth={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
