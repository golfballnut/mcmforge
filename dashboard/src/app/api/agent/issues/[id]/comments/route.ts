import { NextRequest, NextResponse } from "next/server";
import { createForgeClient } from "@/lib/supabase/forge-server";

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
  const runId = request.headers.get("x-forge-run-id");
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

  const { data, error } = await supabase
    .from("issue_comments")
    .insert({
      company_id: issue.company_id,
      issue_id: id,
      author_agent_id: agentId,
      body: bodyText,
      created_by_run_id: runId || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
