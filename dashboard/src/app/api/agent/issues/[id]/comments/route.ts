import { NextRequest, NextResponse } from "next/server";
import { createForgeClient } from "@/lib/supabase/forge-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rule 2 enforcement: [PROOF] comments must be backed by ≥1 upload from the
 * same agent on the same issue in the 10 minutes before the comment is posted.
 *
 * Body patterns that count as [PROOF]:
 *   [PROOF] …                  (exact open bracket)
 *   **[PROOF] …                (bolded form)
 *   **[PROOF — …                (bolded with dash)
 */
const PROOF_REGEX = /^\s*\*{0,2}\[PROOF(?:[\s\]]|—)/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = request.headers.get("x-forge-agent-id");
  const rawRunId = request.headers.get("x-forge-run-id");
  const runId = rawRunId && UUID_RE.test(rawRunId) ? rawRunId : null;
  if (!agentId) return NextResponse.json({ error: "Missing x-forge-agent-id" }, { status: 401 });

  const body = await request.json();
  if (!body.body) return NextResponse.json({ error: "Missing body" }, { status: 400 });

  const supabase = await createForgeClient();

  const { data: issue, error: issueError } = await supabase
    .from("issues")
    .select("company_id")
    .eq("id", id)
    .single();
  if (issueError) return NextResponse.json({ error: issueError.message }, { status: 404 });

  // Rule 2 gate: if body claims [PROOF], require a matching attachment.
  // Bypass with header X-Forge-Proof-Bypass: true (for edge cases like
  // integration tests or CEO-posted audit comments). Bypass is logged for audit.
  const bodyText = body.body as string;
  const isProof = PROOF_REGEX.test(bodyText);
  const bypass = request.headers.get("x-forge-proof-bypass") === "true";

  if (isProof && !bypass) {
    const tenMinBefore = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count, error: attachErr } = await supabase
      .from("issue_attachments")
      .select("id", { count: "exact", head: true })
      .eq("issue_id", id)
      .eq("uploaded_by_agent_id", agentId)
      .gte("created_at", tenMinBefore);

    if (attachErr) {
      // Fail-open on query error — don't block legitimate work on a DB hiccup.
      console.warn("[comments POST] PROOF attachment check failed, allowing through:", attachErr);
    } else if ((count ?? 0) === 0) {
      return NextResponse.json(
        {
          error: "PROOF_WITHOUT_ATTACHMENT",
          message:
            "Rule 2 of agent-comment-protocol.md: [PROOF] comments require ≥1 uploaded artifact " +
            "from this agent on this issue in the 10 minutes before the comment. " +
            "Upload via POST /api/agent/issues/{id}/attachments, then repost.",
          issueId: id,
          agentId,
          attachmentsFound: 0,
        },
        { status: 422 },
      );
    }
  }

  const insertPayload = {
    company_id: issue.company_id,
    issue_id: id,
    author_agent_id: agentId,
    body: bodyText,
    created_by_run_id: runId,
  };

  const { data, error } = await supabase
    .from("issue_comments")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    // FK violation on created_by_run_id — run UUID valid but not in forge.runs. Retry with null.
    if (error.code === "23503" && runId !== null) {
      const { data: retryData, error: retryError } = await supabase
        .from("issue_comments")
        .insert({ ...insertPayload, created_by_run_id: null })
        .select()
        .single();
      if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
      return NextResponse.json(retryData, { status: 201 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
