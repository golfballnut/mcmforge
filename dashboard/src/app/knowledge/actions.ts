"use server";

import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import { revalidatePath } from "next/cache";

export async function ingestUrl(formData: FormData) {
  const url = formData.get("url") as string;
  const tagsRaw = formData.get("tags") as string;

  if (!url?.trim()) return { error: "URL is required" };

  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
        .filter(Boolean)
    : [];

  // Fetch the URL content
  let content: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MCMForge-KnowledgeSynthesizer/1.0" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return { error: `Failed to fetch URL: ${res.status}` };
    content = await res.text();
  } catch (e) {
    return { error: `Failed to fetch URL: ${e}` };
  }

  // Strip HTML tags for basic cleanup, keep text content
  const textContent = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000); // Cap at 10K chars

  // Extract title from URL path
  const urlObj = new URL(url);
  const pathTitle =
    urlObj.pathname.split("/").filter(Boolean).pop() || urlObj.hostname;
  const title = pathTitle.replace(/[-_]/g, " ").replace(/\.\w+$/, "");

  const company = await getActiveCompany();
  if (!company) return { error: "No active company" };

  const supabase = await createForgeClient();
  const { error } = await supabase.from("knowledge").insert({
    company_id: company.id,
    title: `[external] ${title}`,
    body: `## Source\n${url}\n\n## Content\n${textContent}`,
    tags,
    source_type: "manual",
    confidence: "suspected",
    source_issue_ids: [],
  });

  if (error) return { error: error.message };

  revalidatePath("/knowledge");
  return { success: true };
}
