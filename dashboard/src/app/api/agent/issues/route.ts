import { NextRequest, NextResponse } from "next/server";
import { createForgeClient } from "@/lib/supabase/forge-server";

export async function GET(request: NextRequest) {
  const agentId = request.headers.get("x-forge-agent-id");
  if (!agentId) return NextResponse.json({ error: "Missing x-forge-agent-id" }, { status: 401 });

  const supabase = await createForgeClient();
  const { data: issues } = await supabase
    .from("issues")
    .select("id, identifier, title, description, status, priority, project_id")
    .eq("assignee_agent_id", agentId)
    .in("status", ["todo", "in_progress", "blocked"])
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  return NextResponse.json(issues || []);
}

// POST — create a new issue (for delegation/subtasks)
export async function POST(request: NextRequest) {
  const agentId = request.headers.get("x-forge-agent-id");
  const runId = request.headers.get("x-forge-run-id");
  if (!agentId) return NextResponse.json({ error: "Missing x-forge-agent-id" }, { status: 401 });

  const body = await request.json();
  const supabase = await createForgeClient();

  // Get agent's company
  const { data: agent } = await supabase.from("agents").select("company_id").eq("id", agentId).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  // Increment issue counter
  const { data: company } = await supabase
    .from("companies")
    .select("issue_prefix, issue_counter")
    .eq("id", agent.company_id)
    .single();

  const { data: updated } = await supabase
    .from("companies")
    .update({ issue_counter: (company?.issue_counter || 0) + 1 })
    .eq("id", agent.company_id)
    .select("issue_counter")
    .single();

  const issueNumber = updated?.issue_counter || 1;
  const identifier = `${company?.issue_prefix}-${issueNumber}`;

  const { data: issue, error } = await supabase.from("issues").insert({
    company_id: agent.company_id,
    title: body.title,
    description: body.description || null,
    status: body.status || "todo",
    priority: body.priority || "medium",
    assignee_agent_id: body.assigneeAgentId || null,
    parent_id: body.parentId || null,
    project_id: body.projectId || null,
    issue_number: issueNumber,
    identifier,
    origin_kind: "agent_created",
    origin_id: agentId,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(issue, { status: 201 });
}
