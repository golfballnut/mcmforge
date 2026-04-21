import { NextRequest, NextResponse } from "next/server";
import { createForgeClient } from "@/lib/supabase/forge-server";

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

  const { data, error } = await supabase
    .from("issue_comments")
    .insert({
      company_id: issue.company_id,
      issue_id: id,
      author_agent_id: agentId,
      body: body.body as string,
      created_by_run_id: runId || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
