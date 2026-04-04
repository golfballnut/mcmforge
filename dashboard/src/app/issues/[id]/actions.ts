"use server";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { revalidatePath } from "next/cache";

export async function updateIssueStatus(issueId: string, status: string) {
  const supabase = await createForgeClient();
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "in_progress") updates.started_at = new Date().toISOString();
  if (status === "done") updates.completed_at = new Date().toISOString();
  if (status === "cancelled") updates.cancelled_at = new Date().toISOString();

  await supabase.from("issues").update(updates).eq("id", issueId);
  revalidatePath(`/issues/${issueId}`);
}

export async function addComment(issueId: string, companyId: string, body: string) {
  const supabase = await createForgeClient();
  await supabase.from("issue_comments").insert({
    company_id: companyId,
    issue_id: issueId,
    body,
    author_user_id: "steve",
  });
  revalidatePath(`/issues/${issueId}`);
}

export async function updateIssuePriority(issueId: string, priority: string) {
  const supabase = await createForgeClient();
  await supabase.from("issues").update({
    priority,
    updated_at: new Date().toISOString(),
  }).eq("id", issueId);
  revalidatePath(`/issues/${issueId}`);
}

export async function assignIssue(issueId: string, agentId: string | null) {
  const supabase = await createForgeClient();
  await supabase.from("issues").update({
    assignee_agent_id: agentId,
    updated_at: new Date().toISOString(),
  }).eq("id", issueId);
  revalidatePath(`/issues/${issueId}`);
}
