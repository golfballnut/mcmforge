import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_MIMES = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
  "text/plain", "text/markdown", "application/json",
];

function getSizeCap(mimeType: string): number {
  if (mimeType.startsWith("video/")) return 50 * 1024 * 1024;
  if (mimeType.startsWith("image/")) return 10 * 1024 * 1024;
  return 2 * 1024 * 1024;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "forge" } },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = request.headers.get("x-forge-agent-id");
  if (!agentId) return NextResponse.json({ error: "Missing x-forge-agent-id" }, { status: 401 });

  let body: {
    filename?: string;
    mimeType?: string;
    base64?: string;
    category?: string;
    commentId?: string;
    caption?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { filename, mimeType, base64: b64, category, commentId, caption } = body;
  if (!filename || !mimeType || !b64) {
    return NextResponse.json({ error: "Missing required fields: filename, mimeType, base64" }, { status: 400 });
  }

  if (!ALLOWED_MIMES.includes(mimeType)) {
    return NextResponse.json({ error: `Unsupported mimeType: ${mimeType}` }, { status: 400 });
  }

  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) {
    return NextResponse.json({ error: "invalid base64" }, { status: 400 });
  }
  const buffer = Buffer.from(b64, "base64");

  const cap = getSizeCap(mimeType);
  if (buffer.byteLength > cap) {
    return NextResponse.json({ error: `File exceeds ${cap / (1024 * 1024)}MB limit` }, { status: 413 });
  }

  const ext = filename.split(".").pop() || "bin";
  const storagePath = `agent-proof/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = getServiceClient();

  const { error: uploadError } = await supabase.storage
    .from("artifacts")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data, error } = await supabase
    .from("issue_attachments")
    .insert({
      issue_id: id,
      comment_id: commentId ?? null,
      filename,
      mime_type: mimeType,
      size_bytes: buffer.byteLength,
      storage_path: storagePath,
      uploaded_by_agent_id: agentId,
      category: category ?? "agent_proof",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${storagePath}`;

  return NextResponse.json(
    {
      id: data.id,
      storagePath,
      publicUrl,
      sizeBytes: buffer.byteLength,
      category: category ?? "agent_proof",
      caption: caption ?? null,
    },
    { status: 201 },
  );
}
