"use server";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { revalidatePath } from "next/cache";

export interface SavedAttachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
}

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

export async function addComment(
  issueId: string,
  companyId: string,
  body: string,
): Promise<string | null> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("issue_comments")
    .insert({
      company_id: companyId,
      issue_id: issueId,
      body,
      author_user_id: "steve",
    })
    .select("id")
    .single();
  revalidatePath(`/issues/${issueId}`);
  return data?.id ?? null;
}

export async function saveAttachments(
  issueId: string,
  commentId: string | null,
  attachments: Omit<SavedAttachment, "id">[],
): Promise<void> {
  if (!attachments.length) return;
  const supabase = await createForgeClient();
  await supabase.from("issue_attachments").insert(
    attachments.map((a) => ({
      issue_id: issueId,
      comment_id: commentId,
      uploaded_by_user_id: "steve",
      filename: a.filename,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      storage_path: a.storage_path,
    })),
  );
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
