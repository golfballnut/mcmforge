import { NextRequest, NextResponse } from "next/server";
import { createForgeClient } from "@/lib/supabase/forge-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = request.headers.get("x-forge-agent-id");
  const runId = request.headers.get("x-forge-run-id");
  if (!agentId) return NextResponse.json({ error: "Missing x-forge-agent-id" }, { status: 401 });

  const supabase = await createForgeClient();

  // Atomic checkout — only succeeds if not already locked
  const { data, error } = await supabase
    .from("issues")
    .update({
      execution_run_id: runId,
      execution_locked_at: new Date().toISOString(),
      status: "in_progress",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("execution_run_id", null)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Issue already checked out by another agent" }, { status: 409 });
  }

  return NextResponse.json(data);
}
