import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * One-shot agent attachment upload — FORGE-275.
 *
 * Agents post a base64 payload + metadata; route does the storage upload + DB row
 * insert atomically. Unblocks Rule 2 of agent-comment-protocol (every [PROOF]
 * comment needs ≥1 uploaded artifact).
 *
 * Auth: x-forge-agent-id header (same as comments endpoint).
 * Uses service role because agents write to `forge.issue_attachments` without
 * a logged-in supabase session.
 */

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "text/plain",
  "text/markdown",
  "application/json",
]);

const ALLOWED_CATEGORIES = new Set([
  "user_upload",
  "testing",
  "comparison",
  "video",
  "pass",
  "fail",
  "agent_proof",
]);

const MAX_BY_TYPE: Record<string, number> = {
  image: 10 * 1024 * 1024, // 10 MB
  video: 50 * 1024 * 1024, // 50 MB
  text: 2 * 1024 * 1024, // 2 MB (covers text/plain, text/markdown, application/json)
};

function maxBytesFor(mimeType: string): number {
  if (mimeType.startsWith("image/")) return MAX_BY_TYPE.image;
  if (mimeType.startsWith("video/")) return MAX_BY_TYPE.video;
  return MAX_BY_TYPE.text;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: issueId } = await params;

  const agentId = request.headers.get("x-forge-agent-id");
  const runId = request.headers.get("x-forge-run-id");
  if (!agentId) {
    return NextResponse.json({ error: "Missing x-forge-agent-id header" }, { status: 401 });
  }

  let body: {
    filename?: string;
    mimeType?: string;
    base64?: string;
    category?: string;
    caption?: string;
    commentId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.filename || !body.mimeType || !body.base64) {
    return NextResponse.json(
      { error: "filename, mimeType, and base64 are required" },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIMES.has(body.mimeType)) {
    return NextResponse.json(
      { error: `mimeType ${body.mimeType} not allowed. Allowed: ${[...ALLOWED_MIMES].join(", ")}` },
      { status: 415 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.base64, "base64");
    if (buffer.length === 0) throw new Error("empty");
  } catch {
    return NextResponse.json({ error: "Invalid base64 payload" }, { status: 400 });
  }

  const maxBytes = maxBytesFor(body.mimeType);
  if (buffer.byteLength > maxBytes) {
    return NextResponse.json(
      {
        error: `File exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit for ${body.mimeType}`,
        sizeBytes: buffer.byteLength,
        maxBytes,
      },
      { status: 413 },
    );
  }

  const category = body.category && ALLOWED_CATEGORIES.has(body.category) ? body.category : "agent_proof";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server storage client not configured" }, { status: 500 });
  }

  // Service role client — agents write to storage + forge schema without user session
  const supabaseForge = createClient(url, serviceKey, { db: { schema: "forge" } });
  const supabaseStorage = createClient(url, serviceKey); // default (public) schema for storage calls

  const ext = body.filename.split(".").pop()?.toLowerCase() || "bin";
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `agent-proof/${issueId}/${timestamp}-${rand}.${ext}`;

  const { error: uploadError } = await supabaseStorage.storage
    .from("artifacts")
    .upload(storagePath, buffer, {
      contentType: body.mimeType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: attachment, error: dbError } = await supabaseForge
    .from("issue_attachments")
    .insert({
      issue_id: issueId,
      comment_id: body.commentId ?? null,
      filename: body.filename,
      mime_type: body.mimeType,
      size_bytes: buffer.byteLength,
      storage_path: storagePath,
      uploaded_by_agent_id: agentId,
      category,
    })
    .select("id, storage_path, size_bytes, category, created_at")
    .single();

  if (dbError) {
    // Best-effort cleanup: remove the orphaned storage object
    await supabaseStorage.storage.from("artifacts").remove([storagePath]).catch(() => {});
    return NextResponse.json(
      { error: `DB insert failed: ${dbError.message}` },
      { status: 500 },
    );
  }

  const publicUrl = `${url}/storage/v1/object/public/artifacts/${storagePath}`;

  return NextResponse.json(
    {
      id: attachment.id,
      storagePath: attachment.storage_path,
      publicUrl,
      sizeBytes: attachment.size_bytes,
      category: attachment.category,
      caption: body.caption ?? null,
      runId: runId ?? null,
    },
    { status: 201 },
  );
}
