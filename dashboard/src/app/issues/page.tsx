import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import IssuesClient from "./IssuesClient";

export const revalidate = 0; // No ISR cache — client handles realtime

interface Issue {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_agent_id: string | null;
  company_id: string | null;
  project_id: string | null;
  origin_kind: string | null;
  created_at: string;
  completed_at: string | null;
  agent_name?: string | null;
}

async function getIssues(companyId: string): Promise<Issue[]> {
  const supabase = await createForgeClient();
  const { data: issues } = await supabase
    .from("issues")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (!issues || issues.length === 0) return [];

  // Collect unique assignee agent IDs
  const agentIds = [...new Set(issues.map((i) => i.assignee_agent_id).filter(Boolean))];

  let agentMap: Record<string, string> = {};
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name")
      .in("id", agentIds);
    if (agents) {
      agentMap = Object.fromEntries(agents.map((a) => [a.id, a.name]));
    }
  }

  return issues.map((issue) => ({
    ...issue,
    agent_name: issue.assignee_agent_id ? agentMap[issue.assignee_agent_id] ?? null : null,
  }));
}

export default async function IssuesPage() {
  const company = await getActiveCompany();
  const issues = await getIssues(company?.id ?? "");

  return <IssuesClient initialIssues={issues} />;
}
