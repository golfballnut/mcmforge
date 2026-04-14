"use server";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { revalidatePath } from "next/cache";
import { uploadAttachment } from "@/app/actions";

export async function updateIssueStatus(issueId: string, status: string) {
  const supabase = await createForgeClient();

  // Fetch previous status for the event log
  const { data: prev } = await supabase
    .from("issues")
    .select("status")
    .eq("id", issueId)
    .single();
  const oldStatus = prev?.status ?? null;

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "in_progress") updates.started_at = new Date().toISOString();
  if (status === "done") updates.completed_at = new Date().toISOString();
  if (status === "cancelled") updates.cancelled_at = new Date().toISOString();

  await supabase.from("issues").update(updates).eq("id", issueId);

  // Log status change event
  await supabase.from("issue_events").insert({
    issue_id: issueId,
    event_type: "status_change",
    actor_type: "user",
    actor_id: "steve",
    old_value: oldStatus,
    new_value: status,
  });

  revalidatePath(`/issues/${issueId}`);
}

export async function addComment(issueId: string, companyId: string, body: string) {
  const supabase = await createForgeClient();
  const { data } = await supabase.from("issue_comments").insert({
    company_id: companyId,
    issue_id: issueId,
    body,
    author_user_id: "steve",
  }).select("id").single();
  revalidatePath(`/issues/${issueId}`);
  return { commentId: data?.id ?? null };
}

export async function addCommentWithAttachments(
  issueId: string,
  companyId: string,
  body: string,
  formData: FormData,
) {
  const supabase = await createForgeClient();

  // 1. Create the comment
  const { data } = await supabase.from("issue_comments").insert({
    company_id: companyId,
    issue_id: issueId,
    body,
    author_user_id: "steve",
  }).select("id").single();

  const commentId = data?.id ?? null;
  if (!commentId) return { error: "Failed to create comment" };

  // 2. Upload each file and link to comment
  const files = formData.getAll("files") as File[];
  const categories = formData.getAll("categories") as string[];

  const errors: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || !(file instanceof File) || file.size === 0) continue;

    const singleFormData = new FormData();
    singleFormData.append("file", file);
    const cat = categories[i] ?? "user_upload";
    singleFormData.append("category", cat);

    const result = await uploadIssueAttachmentWithComment(issueId, commentId, singleFormData);
    if (result?.error) errors.push(`${file.name}: ${result.error}`);
  }

  revalidatePath(`/issues/${issueId}`);
  return { commentId, errors: errors.length > 0 ? errors : null };
}

async function uploadIssueAttachmentWithComment(issueId: string, commentId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file provided" };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Only PNG, JPG, GIF, WebP, or MP4/WebM/MOV videos are allowed" };
  }
  const limit = file.type.startsWith("video/") ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > limit) {
    return { error: `File exceeds ${limit / (1024 * 1024)}MB limit` };
  }

  const categoryRaw = (formData.get("category") as string | null) ?? "user_upload";
  const category = ALLOWED_CATEGORIES.includes(categoryRaw) ? categoryRaw : "user_upload";

  // Upload file directly to Supabase Storage (not via shared server action — can't call server actions from server actions on Vercel)
  const { createClient } = await import("@/lib/supabase/server");
  const storageClient = await createClient();
  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `task-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await storageClient.storage
    .from("artifacts")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) return { error: uploadError.message };

  const supabase = await createForgeClient();
  const { error } = await supabase.from("issue_attachments").insert({
    issue_id: issueId,
    comment_id: commentId,
    filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    storage_path: storagePath,
    category,
  });

  if (error) return { error: error.message };
  return { success: true };
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

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_CATEGORIES = ["user_upload", "testing", "comparison", "video", "pass", "fail"];

export async function uploadIssueAttachment(issueId: string, formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file provided" };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Only PNG, JPG, GIF, WebP, or MP4/WebM/MOV videos are allowed" };
  }
  const limit = file.type.startsWith("video/") ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > limit) {
    return { error: `File exceeds ${limit / (1024 * 1024)}MB limit` };
  }

  const categoryRaw = (formData.get("category") as string | null) ?? "user_upload";
  const category = ALLOWED_CATEGORIES.includes(categoryRaw) ? categoryRaw : "user_upload";

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
    category,
  });

  if (error) return { error: error.message };

  revalidatePath(`/issues/${issueId}`);
  return { success: true, url: upload.url, filename: file.name };
}

export async function toggleCriterion(issueId: string, index: number, verified: boolean) {
  const supabase = await createForgeClient();
  const { data: issue } = await supabase
    .from("issues")
    .select("acceptance_criteria")
    .eq("id", issueId)
    .single();

  if (!issue?.acceptance_criteria || !Array.isArray(issue.acceptance_criteria)) return;

  const criteria = [...issue.acceptance_criteria];
  if (index >= 0 && index < criteria.length) {
    criteria[index] = { ...criteria[index], verified };
  }

  await supabase.from("issues").update({
    acceptance_criteria: criteria,
    updated_at: new Date().toISOString(),
  }).eq("id", issueId);

  await supabase.from("issue_events").insert({
    issue_id: issueId,
    event_type: "criteria_verified",
    actor_type: "user",
    actor_id: "steve",
    new_value: criteria[index]?.criterion ?? `criterion ${index}`,
    metadata: { index, verified },
  });

  revalidatePath(`/issues/${issueId}`);
}
