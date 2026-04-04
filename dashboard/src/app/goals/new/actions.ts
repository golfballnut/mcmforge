"use server";

import { createForgeClient } from "@/lib/supabase/forge-server";
import { redirect } from "next/navigation";

export async function createGoal(formData: FormData) {
  const supabase = await createForgeClient();

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const level = (formData.get("level") as string) || "strategy";
  const company_id = formData.get("company_id") as string;
  const parent_id = (formData.get("parent_id") as string) || null;

  if (!title?.trim()) throw new Error("Title is required");
  if (!company_id) throw new Error("Company is required");

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({
      title: title.trim(),
      description: description || null,
      level,
      company_id,
      parent_id: parent_id || null,
      status: "planned",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create goal: ${error.message}`);
  }

  redirect(`/goals`);
}
