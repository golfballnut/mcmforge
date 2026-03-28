import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const revalidate = 30;

interface Agent {
  id: string;
  name: string;
  title: string | null;
  role: string;
  status: string;
  company_id: string | null;
  reports_to: string | null;
}

async function getAgents() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forge_agents")
    .select("id, name, title, role, status, company_id, reports_to")
    .order("name", { ascending: true });
  return (data || []) as Agent[];
}

async function getCompanies() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });
  return (data || []) as { id: string; name: string }[];
}

function statusDot(status: string): string {
  switch (status) {
    case "active":
      return "bg-[#34a853]";
    case "paused":
      return "bg-amber-400";
    case "budget_exceeded":
    case "terminated":
      return "bg-[#ea4335]";
    default:
      return "bg-[#5f6368]";
  }
}

interface TreeNode {
  agent: Agent;
  children: TreeNode[];
}

function buildTree(agents: Agent[]): TreeNode[] {
  const agentMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const agent of agents) {
    agentMap.set(agent.id, { agent, children: [] });
  }

  for (const agent of agents) {
    const node = agentMap.get(agent.id)!;
    if (agent.reports_to && agentMap.has(agent.reports_to)) {
      agentMap.get(agent.reports_to)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function TreeNodeComponent({ node, isLast }: { node: TreeNode; isLast: boolean }) {
  const dot = statusDot(node.agent.status);

  return (
    <div className="flex flex-col">
      <div className="flex items-start">
        {/* Connector line */}
        <div className="flex flex-col items-center mr-2 mt-0">
          <div className={`w-px h-3 ${isLast ? "bg-transparent" : "bg-[#dadce0]"}`} />
        </div>

        {/* Agent node */}
        <Link
          href={`/agents/${node.agent.id}`}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-[#dadce0] rounded-lg hover:border-[#1a73e8] hover:shadow-sm transition-all group"
        >
          <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#202124] group-hover:text-[#1a73e8] truncate">
              {node.agent.name}
            </p>
            {node.agent.title && (
              <p className="text-xs text-[#5f6368] truncate">{node.agent.title}</p>
            )}
          </div>
          <span className="ml-2 px-1.5 py-0.5 bg-[#f1f3f4] text-[#5f6368] text-[10px] rounded shrink-0">
            {node.agent.role}
          </span>
        </Link>
      </div>

      {/* Children */}
      {node.children.length > 0 && (
        <div className="ml-8 pl-4 border-l border-[#dadce0] mt-1 space-y-1">
          {node.children.map((child, i) => (
            <TreeNodeComponent
              key={child.agent.id}
              node={child}
              isLast={i === node.children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function ChainPage() {
  const [agents, companies] = await Promise.all([getAgents(), getCompanies()]);

  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  // Group agents by company
  const grouped = new Map<string, Agent[]>();
  for (const agent of agents) {
    const key = agent.company_id || "__unassigned__";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(agent);
  }

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-medium text-[#202124]">Chain of Command</h1>
        <p className="text-[#5f6368] mt-1">
          Organizational hierarchy across {grouped.size} {grouped.size === 1 ? "company" : "companies"} &middot; {agents.length} agents
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="text-[#5f6368] text-sm p-12 border border-[#dadce0] bg-white rounded-xl text-center">
          No agents registered
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([companyId, companyAgents]) => {
            const companyName =
              companyId === "__unassigned__"
                ? "Unassigned"
                : companyMap.get(companyId) || companyId;
            const tree = buildTree(companyAgents);

            return (
              <div
                key={companyId}
                className="bg-white border border-[#dadce0] rounded-xl p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-base font-medium text-[#202124]">{companyName}</h2>
                  <span className="px-2 py-0.5 bg-[#f1f3f4] text-[#5f6368] text-xs rounded-full">
                    {companyAgents.length} {companyAgents.length === 1 ? "agent" : "agents"}
                  </span>
                </div>

                <div className="space-y-1">
                  {tree.map((root, i) => (
                    <TreeNodeComponent
                      key={root.agent.id}
                      node={root}
                      isLast={i === tree.length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
