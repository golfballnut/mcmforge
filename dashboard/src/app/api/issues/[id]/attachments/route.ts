import { NextRequest, NextResponse } from "next/server";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { createClient } from "@supabase/supabase-js";

// Service role client for storage operations (bypasses RLS)
function createStorageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createForgeClient();

  const { data, error } = await supabase
    .from("issue_attachments")
    .select("*")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const maxSize = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxSize) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }

  const storage = createStorageClient();
  const supabase = await createForgeClient();

  // Build a unique storage path
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await storage.storage
    .from("issue-attachments")
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = storage.storage
    .from("issue-attachments")
    .getPublicUrl(storagePath);

  // Verify the issue exists and get company_id
  const { data: issue } = await supabase
    .from("issues")
    .select("id, company_id")
    .eq("id", id)
    .single();

  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const { data: attachment, error: dbError } = await supabase
    .from("issue_attachments")
    .insert({
      issue_id: id,
      file_name: file.name,
      file_url: publicUrl,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(attachment, { status: 201 });
}
