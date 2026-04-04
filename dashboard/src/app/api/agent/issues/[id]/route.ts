import { NextRequest, NextResponse } from "next/server";
import { createForgeClient } from "@/lib/supabase/forge-server";

// PATCH — update issue status/comment
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = request.headers.get("x-forge-agent-id");
  const runId = request.headers.get("x-forge-run-id");
  if (!agentId) return NextResponse.json({ error: "Missing x-forge-agent-id" }, { status: 401 });

  const body = await request.json();
  const supabase = await createForgeClient();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) {
    updates.status = body.status;
    if (body.status === "in_progress") updates.started_at = new Date().toISOString();
    if (body.status === "done") updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from("issues").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add comment if provided
  if (body.comment) {
    await supabase.from("issue_comments").insert({
      company_id: data.company_id,
      issue_id: id,
      author_agent_id: agentId,
      body: body.comment,
      created_by_run_id: runId || null,
    });
  }

  return NextResponse.json(data);
}
