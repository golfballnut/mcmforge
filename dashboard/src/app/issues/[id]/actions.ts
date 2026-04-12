"use server";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { revalidatePath } from "next/cache";
import { uploadAttachment } from "@/app/actions";

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

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadIssueAttachment(issueId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file provided" };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Only PNG, JPG, GIF, or WebP images are allowed" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "File exceeds 10MB limit" };
  }

  const upload = await uploadAttachment(formData);
  if ("error" in upload && upload.error) return { error: upload.error };
  if (!("url" in upload) || !upload.url) return { error: "Upload failed" };

  const storagePath = new URL(upload.url).pathname.split("/artifacts/").pop() ?? upload.url;

  const supabase = await createForgeClient();
  const { error } = await supabase.from("issue_attachments").insert({
    issue_id: issueId,
    filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    storage_path: storagePath,
  });

  if (error) return { error: error.message };

  revalidatePath(`/issues/${issueId}`);
  return { success: true, url: upload.url, filename: file.name };
}
