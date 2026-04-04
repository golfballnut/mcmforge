import { createForgeClient } from "@/lib/supabase/forge-server";
import Link from "next/link";

export const revalidate = 60;

type Agent = {
  id: string;
  name: string;
  role: string | null;
  title: string | null;
  icon: string | null;
  status: string;
  adapter_type: string | null;
  reports_to: string | null;
};

type AgentNode = Agent & {
  children: AgentNode[];
};

const STATUS_DOT: Record<string, string> = {
  idle:       "bg-[#3fb950]",
  running:    "bg-[#58a6ff] animate-pulse",
  paused:     "bg-[#d29922]",
  error:      "bg-[#f85149]",
  terminated: "bg-[#8b949e]",
};

function adapterLabel(type: string | null): string {
  if (!type) return "--";
  const map: Record<string, string> = {
    claude_local: "Claude",
    claude:       "Claude",
    gemini:       "Gemini",
    codex:        "Codex",
    openai:       "OpenAI",
  };
  return map[type.toLowerCase()] ?? type;
}

function adapterColor(type: string | null): string {
  if (!type) return "text-[#8b949e]";
  const t = type.toLowerCase();
  if (t.includes("claude")) return "text-[#d4a27f]";
  if (t.includes("gemini")) return "text-[#58a6ff]";
  if (t.includes("codex") || t.includes("openai")) return "text-[#3fb950]";
  return "text-[#8b949e]";
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function buildTree(agents: Agent[]): AgentNode[] {
  const nodeMap = new Map<string, AgentNode>();
  for (const a of agents) {
    nodeMap.set(a.id, { ...a, children: [] });
  }

  const roots: AgentNode[] = [];
  for (const node of nodeMap.values()) {
    if (!node.reports_to || !nodeMap.has(node.reports_to)) {
      roots.push(node);
    } else {
      nodeMap.get(node.reports_to)!.children.push(node);
    }
  }

  // Sort children alphabetically by name
  const sortNode = (node: AgentNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortNode);
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach(sortNode);

  return roots;
}

function AgentCard({ agent }: { agent: AgentNode }) {
  const dotColor = STATUS_DOT[agent.status] ?? "bg-[#8b949e]";
  const adapterText = adapterColor(agent.adapter_type);
  const adapterName = adapterLabel(agent.adapter_type);

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="block bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2.5 hover:bg-[#1c2333] hover:border-[#58a6ff]/40 transition-colors min-w-[180px] max-w-[240px]"
    >
      <div className="flex items-start gap-2.5">
        {/* Status dot */}
        <div className="flex items-center pt-1 shrink-0">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        </div>

        <div className="min-w-0 flex-1">
          {/* Icon + name */}
          <div className="flex items-center gap-1.5 mb-0.5">
            {agent.icon ? (
              <span className="text-sm leading-none">{agent.icon}</span>
            ) : (
              <span className="w-5 h-5 rounded-full bg-[#0d1117] border border-[#30363d] flex items-center justify-center text-[10px] font-mono text-[#8b949e] shrink-0">
                {initials(agent.name)}
              </span>
            )}
            <span className="text-sm font-medium text-[#e6edf3] truncate">
              {agent.name}
            </span>
          </div>

          {/* Role badge */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {agent.role && (
              <span className="text-xs bg-[#0d1117] border border-[#30363d] text-[#8b949e] px-1.5 py-0.5 rounded truncate max-w-[120px]">
                {agent.role}
              </span>
            )}
            <span className={`text-xs font-mono ${adapterText}`}>
              {adapterName}
            </span>
          </div>

          {/* Title */}
          {agent.title && (
            <p className="text-xs text-[#8b949e] mt-0.5 truncate leading-tight">
              {agent.title}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function TreeLevel({
  nodes,
  depth = 0,
}: {
  nodes: AgentNode[];
  depth?: number;
}) {
  if (nodes.length === 0) return null;

  return (
    <div
      className={`space-y-3 ${depth > 0 ? "ml-8 mt-2 pl-4 border-l border-[#30363d]" : ""}`}
    >
      {nodes.map((node) => (
        <div key={node.id}>
          <AgentCard agent={node} />
          {node.children.length > 0 && (
            <TreeLevel nodes={node.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

async function getAgents(): Promise<Agent[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("agents")
    .select("id, name, role, title, icon, status, adapter_type, reports_to")
    .order("name", { ascending: true });
  return (data as Agent[]) || [];
}

export default async function OrgPage() {
  const agents = await getAgents();
  const hasHierarchy = agents.some((a) => a.reports_to !== null);
  const tree = buildTree(agents);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-wide text-[#e6edf3] uppercase">
            Org Chart
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">
            Agent hierarchy and reporting structure.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-[#161b22] border border-[#30363d] text-[#8b949e]">
            {agents.length} agents
          </span>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-12 text-center text-[#8b949e] text-sm">
          No agents found.
        </div>
      ) : !hasHierarchy ? (
        <div>
          {/* No hierarchy defined — show flat grid with message */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3 mb-5 flex items-center gap-2.5">
            <svg
              className="w-4 h-4 text-[#d29922] shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-[#8b949e]">
              No hierarchy defined — set{" "}
              <code className="text-xs bg-[#0d1117] px-1 py-0.5 rounded border border-[#30363d] text-[#e6edf3]">
                reports_to
              </code>{" "}
              on agents to build the org tree. Showing all agents flat.
            </p>
          </div>

          {/* Flat grid */}
          <div className="flex flex-wrap gap-3">
            {agents.map((agent) => {
              const nodeAgent: AgentNode = { ...agent, children: [] };
              return <AgentCard key={agent.id} agent={nodeAgent} />;
            })}
          </div>
        </div>
      ) : (
        /* Tree view */
        <div className="overflow-x-auto">
          <div className="min-w-[300px]">
            <TreeLevel nodes={tree} depth={0} />
          </div>
        </div>
      )}
    </div>
  );
}
