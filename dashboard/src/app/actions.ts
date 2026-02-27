"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleDispatcher(formData: FormData) {
  const currentStatus = formData.get("current_status") as string;
  const newStatus = currentStatus === "active" ? "paused" : "active";

  const supabase = await createClient();
  await supabase
    .from("system_config")
    .update({
      value: newStatus,
      updated_at: new Date().toISOString(),
      updated_by: "steve",
    })
    .eq("key", "dispatcher_status");

  revalidatePath("/");
}

export async function createTask(formData: FormData) {
  const supabase = await createClient();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const company_id = formData.get("company_id") as string;
  const priority = formData.get("priority") as string;
  const task_type = formData.get("task_type") as string;
  const cli_target = formData.get("cli_target") as string;

  if (!title) return { error: "Title is required" };

  // Collect attachment URLs passed from the client
  const attachmentUrls: string[] = [];
  for (const [key, val] of formData.entries()) {
    if (key === "attachment_url" && typeof val === "string" && val) {
      attachmentUrls.push(val);
    }
  }

  const { error } = await supabase.from("task_queue").insert({
    title,
    description: description || null,
    company_id: company_id || null,
    priority: priority || "medium",
    task_type: task_type || "code",
    cli_target: cli_target || "claude",
    status: "todo",
    assigned_to: "agent-executor",
    created_by: "steve",
    attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : [],
  });

  if (error) return { error: error.message };

  revalidatePath("/tasks");
  return { success: true };
}

export async function uploadAttachment(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File;
  if (!file) return { error: "No file provided" };

  const ext = file.name.split(".").pop() || "bin";
  const path = `task-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from("artifacts")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { error: error.message };

  const { data: urlData } = supabase.storage
    .from("artifacts")
    .getPublicUrl(path);

  return { success: true, url: urlData.publicUrl, name: file.name };
}

export async function updateTask(
  taskId: string,
  updates: Record<string, unknown>
) {
  const supabase = await createClient();

  const allowed = [
    "title",
    "description",
    "status",
    "priority",
    "assigned_to",
    "cli_target",
    "task_type",
    "company_id",
    "board",
    "cost_cap",
    "attachment_urls",
  ];
  const filtered: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  const { error } = await supabase
    .from("task_queue")
    .update(filtered)
    .eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath("/tasks");
  return { success: true };
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("task_queue")
    .delete()
    .eq("id", taskId);

  if (error) return { error: error.message };

  revalidatePath("/tasks");
  return { success: true };
}

export async function getDispatcherStatus(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "dispatcher_status")
    .single();

  return data?.value || "unknown";
}
