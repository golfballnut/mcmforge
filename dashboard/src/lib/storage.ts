import { createForgeBrowserClient } from "./supabase/forge-client";

const BUCKET = "issue-attachments";

export interface UploadedAttachment {
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
}

export async function uploadAttachment(
  issueId: string,
  file: File,
): Promise<UploadedAttachment> {
  // Use the base supabase client without forge schema override for storage
  const supabase = createForgeBrowserClient();
  const ext = file.name.split(".").pop() ?? "";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `issues/${issueId}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  return {
    filename: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    storage_path: storagePath,
  };
}

export function getAttachmentUrl(storagePath: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${url}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}
