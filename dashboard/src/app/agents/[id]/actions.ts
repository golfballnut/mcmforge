"use server";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function pauseAgent(agentId: string) {
  const supabase = await createForgeClient();
  await supabase.from("agents").update({
    status: "paused",
    paused_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", agentId);
  revalidatePath(`/agents/${agentId}`);
}

export async function resumeAgent(agentId: string) {
  const supabase = await createForgeClient();
  await supabase.from("agents").update({
    status: "idle",
    paused_at: null,
    pause_reason: null,
    updated_at: new Date().toISOString(),
  }).eq("id", agentId);
  revalidatePath(`/agents/${agentId}`);
}

export async function deleteAgent(agentId: string) {
  const supabase = await createForgeClient();
  await supabase.from("agents").update({
    status: "terminated",
    updated_at: new Date().toISOString(),
  }).eq("id", agentId);
  revalidatePath("/agents");
  redirect("/agents");
}

export async function triggerHeartbeat(agentId: string, companyId: string) {
  const supabase = await createForgeClient();
  await supabase.from("runs").insert({
    company_id: companyId,
    agent_id: agentId,
    status: "queued",
    invocation_source: "on_demand",
    trigger_detail: "manual",
    context_snapshot: { wakeReason: "manual_heartbeat" },
  });
  revalidatePath(`/agents/${agentId}`);
}
