import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

// Matches: "Closes #FORGE-256", "closes #FORGE-1", "CLOSES #ABC-123"
// Does NOT match: "closes bug", "Closes #123" (no prefix), plain text
const CLOSES_RE = /Closes #([A-Z]+-\d+)/i;

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: { action?: string; pull_request?: { merged?: boolean; body?: string | null; html_url?: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (payload.action !== "closed" || !payload.pull_request?.merged) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const prBody = payload.pull_request.body ?? "";
  const match = CLOSES_RE.exec(prBody);
  if (!match) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const identifier = match[1].toUpperCase();
  const prUrl = payload.pull_request.html_url ?? "";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "forge" } }
  );

  const { error } = await supabase
    .from("issues")
    .update({ status: "done", pr_url: prUrl, completed_at: new Date().toISOString() })
    .eq("identifier", identifier);

  if (error) {
    console.error("[github/webhook] supabase update failed", error);
    return NextResponse.json({ error: "db update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, closed: identifier });
}
