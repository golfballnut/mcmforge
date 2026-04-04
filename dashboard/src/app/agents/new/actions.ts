"use server";

import { createForgeClient } from "@/lib/supabase/forge-server";
import { redirect } from "next/navigation";

export async function createAgent(formData: FormData) {
  const supabase = await createForgeClient();

  const name = formData.get("name") as string;
  const title = (formData.get("title") as string) || null;
  const role = (formData.get("role") as string) || "engineer";
  const company_id = formData.get("company_id") as string;
  const adapter_type = (formData.get("adapter_type") as string) || "claude";
  const model = (formData.get("model") as string) || null;
  const max_turns = parseInt((formData.get("max_turns") as string) || "10", 10);
  const timeout_sec = parseInt((formData.get("timeout_sec") as string) || "300", 10);
  const skip_permissions = formData.get("skip_permissions") === "on";
  const instructions_file = (formData.get("instructions_file") as string) || null;
  const reports_to = (formData.get("reports_to") as string) || null;
  const icon = (formData.get("icon") as string) || null;

  if (!name?.trim()) {
    throw new Error("Name is required");
  }
  if (!company_id) {
    throw new Error("Company is required");
  }

  const adapter_config: Record<string, unknown> = {};
  if (model) adapter_config.model = model;
  adapter_config.maxTurns = max_turns;
  adapter_config.timeoutSec = timeout_sec;
  adapter_config.dangerouslySkipPermissions = skip_permissions;
  if (instructions_file) adapter_config.instructionsFile = instructions_file;

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      name: name.trim(),
      title: title || null,
      role,
      company_id,
      adapter_type,
      adapter_config,
      reports_to: reports_to || null,
      icon: icon || null,
      status: "idle",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create agent: ${error.message}`);
  }

  redirect(`/agents/${agent.id}`);
}
