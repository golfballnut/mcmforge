import { NextRequest, NextResponse } from "next/server";
import { createForgeClient } from "@/lib/supabase/forge-server";

export async function GET(request: NextRequest) {
  const agentId = request.headers.get("x-forge-agent-id");
  if (!agentId) return NextResponse.json({ error: "Missing x-forge-agent-id" }, { status: 401 });

  const supabase = await createForgeClient();
  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, role, title, status, company_id, adapter_type, budget_monthly_cents, reports_to")
    .eq("id", agentId)
    .single();

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json(agent);
}
