"use server";

import { createForgeClient } from "@/lib/supabase/forge-server";
import { redirect } from "next/navigation";

export async function createProject(formData: FormData) {
  const supabase = await createForgeClient();

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;
  const company_id = formData.get("company_id") as string;
  const repo_url = (formData.get("repo_url") as string) || null;
  const repo_branch = (formData.get("repo_branch") as string) || "main";
  const workspace_dir = (formData.get("workspace_dir") as string) || null;
  const color = (formData.get("color") as string) || null;
  const target_date = (formData.get("target_date") as string) || null;

  if (!name?.trim()) throw new Error("Name is required");
  if (!company_id) throw new Error("Company is required");

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name: name.trim(),
      description: description || null,
      company_id,
      repo_url: repo_url || null,
      repo_branch: repo_branch || "main",
      workspace_dir: workspace_dir || null,
      color: color || null,
      target_date: target_date || null,
      status: "planning",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }

  redirect(`/projects/${project.id}`);
}
