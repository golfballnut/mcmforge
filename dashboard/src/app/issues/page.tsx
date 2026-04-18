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
  agent_skills?: string[] | null;
  comment_count?: number;
  attachment_count?: number;
  stage_comments?: Array<{ body: string }>;
  pr_url?: string | null;
}

async function getIssues(companyId: string): Promise<Issue[]> {
  const supabase = await createForgeClient();
  const { data: issues } = await supabase
    .from("issues")
    .select("*, issue_comments(count), issue_attachments(count)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (!issues || issues.length === 0) return [];

  // Collect unique assignee agent IDs
  const agentIds = [...new Set(issues.map((i) => i.assignee_agent_id).filter(Boolean))];

  let agentMap: Record<string, { name: string; skills: string[] | null }> = {};
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, skills")
      .in("id", agentIds);
    if (agents) {
      agentMap = Object.fromEntries(agents.map((a) => [a.id, { name: a.name, skills: a.skills }]));
    }
  }

  // Fetch up to 20 most-recent comment bodies per issue for stage derivation
  const issueIds = issues.map((i) => i.id);
  let commentsByIssue: Record<string, Array<{ body: string }>> = {};
  if (issueIds.length > 0) {
    const { data: recentComments } = await supabase
      .from("issue_comments")
      .select("issue_id, body")
      .in("issue_id", issueIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(issueIds.length * 20, 1000));
    if (recentComments) {
      for (const c of recentComments) {
        if (!commentsByIssue[c.issue_id]) commentsByIssue[c.issue_id] = [];
        if (commentsByIssue[c.issue_id].length < 20) {
          commentsByIssue[c.issue_id].push({ body: c.body });
        }
      }
    }
  }

  return issues.map((issue) => {
    // PostgREST returns nested arrays like: issue_comments: [{ count: 3 }]
    const rawComments = (issue as Record<string, unknown>).issue_comments;
    const rawAttachments = (issue as Record<string, unknown>).issue_attachments;
    const commentCount = Array.isArray(rawComments)
      ? ((rawComments as { count: number }[])[0]?.count ?? 0)
      : 0;
    const attachmentCount = Array.isArray(rawAttachments)
      ? ((rawAttachments as { count: number }[])[0]?.count ?? 0)
      : 0;

    return {
      ...issue,
      agent_name: issue.assignee_agent_id ? agentMap[issue.assignee_agent_id]?.name ?? null : null,
      agent_skills: issue.assignee_agent_id ? agentMap[issue.assignee_agent_id]?.skills ?? null : null,
      comment_count: commentCount,
      attachment_count: attachmentCount,
      stage_comments: commentsByIssue[issue.id] ?? [],
      pr_url: (issue as Record<string, unknown>).pr_url as string | null ?? null,
    };
  });
}

export default async function IssuesPage() {
  const company = await getActiveCompany();
  const issues = await getIssues(company?.id ?? "");

  return <IssuesClient initialIssues={issues} />;
}
