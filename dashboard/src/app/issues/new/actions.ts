"use server";

import { createForgeClient } from "@/lib/supabase/forge-server";
import { redirect } from "next/navigation";

export async function createIssue(formData: FormData) {
  const supabase = await createForgeClient();

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const priority = (formData.get("priority") as string) || "medium";
  const status = (formData.get("status") as string) || "todo";
  const assignee_agent_id = (formData.get("assignee_agent_id") as string) || null;
  const project_id = (formData.get("project_id") as string) || null;
  const company_id = (formData.get("company_id") as string) || null;

  if (!title?.trim()) {
    throw new Error("Title is required");
  }

  let identifier: string | null = null;

  if (company_id) {
    // Atomically increment issue_counter and get the new value
    const { data: companyData, error: counterError } = await supabase.rpc(
      "increment_issue_counter",
      { company_id_input: company_id }
    );

    if (!counterError && companyData) {
      const counter = companyData as number;
      // Fetch the issue_prefix
      const { data: company } = await supabase
        .from("companies")
        .select("issue_prefix")
        .eq("id", company_id)
        .single();

      if (company?.issue_prefix) {
        identifier = `${company.issue_prefix}-${counter}`;
      }
    } else {
      // Fallback: fetch and manually increment
      const { data: company } = await supabase
        .from("companies")
        .select("issue_prefix, issue_counter")
        .eq("id", company_id)
        .single();

      if (company) {
        const newCounter = (company.issue_counter ?? 0) + 1;
        await supabase
          .from("companies")
          .update({ issue_counter: newCounter })
          .eq("id", company_id);

        if (company.issue_prefix) {
          identifier = `${company.issue_prefix}-${newCounter}`;
        }
      }
    }
  }

  const { data: issue, error } = await supabase
    .from("issues")
    .insert({
      title: title.trim(),
      description,
      priority,
      status,
      assignee_agent_id: assignee_agent_id || null,
      project_id: project_id || null,
      company_id: company_id || null,
      identifier,
      origin_kind: "manual",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create issue: ${error.message}`);
  }

  redirect(`/issues/${issue.id}`);
}

// Returns the new issue's id (no redirect) so callers can upload attachments first
export async function createIssueAndReturn(formData: FormData): Promise<string> {
  const supabase = await createForgeClient();

  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const priority = (formData.get("priority") as string) || "medium";
  const status = (formData.get("status") as string) || "todo";
  const assignee_agent_id = (formData.get("assignee_agent_id") as string) || null;
  const project_id = (formData.get("project_id") as string) || null;
  const company_id = (formData.get("company_id") as string) || null;

  if (!title?.trim()) {
    throw new Error("Title is required");
  }

  let identifier: string | null = null;

  if (company_id) {
    const { data: companyData, error: counterError } = await supabase.rpc(
      "increment_issue_counter",
      { company_id_input: company_id }
    );

    if (!counterError && companyData) {
      const counter = companyData as number;
      const { data: company } = await supabase
        .from("companies")
        .select("issue_prefix")
        .eq("id", company_id)
        .single();

      if (company?.issue_prefix) {
        identifier = `${company.issue_prefix}-${counter}`;
      }
    } else {
      const { data: company } = await supabase
        .from("companies")
        .select("issue_prefix, issue_counter")
        .eq("id", company_id)
        .single();

      if (company) {
        const newCounter = (company.issue_counter ?? 0) + 1;
        await supabase
          .from("companies")
          .update({ issue_counter: newCounter })
          .eq("id", company_id);

        if (company.issue_prefix) {
          identifier = `${company.issue_prefix}-${newCounter}`;
        }
      }
    }
  }

  const { data: issue, error } = await supabase
    .from("issues")
    .insert({
      title: title.trim(),
      description,
      priority,
      status,
      assignee_agent_id: assignee_agent_id || null,
      project_id: project_id || null,
      company_id: company_id || null,
      identifier,
      origin_kind: "manual",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create issue: ${error.message}`);
  }

  return issue.id;
}
