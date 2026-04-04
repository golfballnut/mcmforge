"use server";

import { createForgeClient } from "@/lib/supabase/forge-server";
import { redirect } from "next/navigation";

function nextCronRun(cronExpr: string): string | null {
  // Simple next-run calculation for common patterns
  // Returns ISO string for next run, or null if can't parse
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    // Default: 1 hour from now as a safe fallback
    const next = new Date(Date.now() + 60 * 60 * 1000);
    return next.toISOString();
  } catch {
    return null;
  }
}

export async function createRoutine(formData: FormData) {
  const supabase = await createForgeClient();

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const company_id = formData.get("company_id") as string;
  const project_id = (formData.get("project_id") as string) || null;
  const assignee_agent_id = formData.get("assignee_agent_id") as string;
  const priority = (formData.get("priority") as string) || "medium";
  const cron_expression = formData.get("cron_expression") as string;
  const timezone = (formData.get("timezone") as string) || "America/New_York";
  const concurrency_policy = (formData.get("concurrency_policy") as string) || "skip_if_active";
  const catch_up_policy = (formData.get("catch_up_policy") as string) || "skip_missed";
  const prompt_template = (formData.get("prompt_template") as string) || null;

  if (!title?.trim()) throw new Error("Title is required");
  if (!cron_expression?.trim()) throw new Error("Cron expression is required");
  if (!company_id) throw new Error("Company is required");
  if (!assignee_agent_id) throw new Error("Assignee agent is required");

  const next_run_at = nextCronRun(cron_expression);

  const { data: routine, error } = await supabase
    .from("routines")
    .insert({
      title: title.trim(),
      description: description || null,
      company_id,
      project_id: project_id || null,
      assignee_agent_id,
      priority,
      cron_expression: cron_expression.trim(),
      timezone,
      concurrency_policy,
      catch_up_policy,
      prompt_template: prompt_template || null,
      status: "active",
      next_run_at,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create routine: ${error.message}`);
  }

  redirect(`/routines/${routine.id}`);
}
