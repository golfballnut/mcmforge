"use server";

import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import { revalidatePath } from "next/cache";

export async function ingestUrl(formData: FormData) {
  const url = formData.get("url") as string;
  const tagsRaw = formData.get("tags") as string;
  const customTitle = (formData.get("title") as string)?.trim() || "";

  if (!url?.trim()) return { error: "URL is required" };

  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
        .filter(Boolean)
    : [];

  if (tags.length === 0) return { error: "At least one tag is required — agents search by tags" };

  let title: string;
  let textContent: string;

  try {
    const urlObj = new URL(url);
    const isGitHub = urlObj.hostname === "github.com";
    const pathParts = urlObj.pathname.split("/").filter(Boolean);

    if (isGitHub && pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1];
      const section = pathParts[2]; // issues, releases, blob, etc.

      if (section === "issues" && !pathParts[3]) {
        // GitHub issues LIST — fetch via API
        const apiRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=20`,
          { headers: { "User-Agent": "MCMForge/1.0", Accept: "application/vnd.github.v3+json" } }
        );
        if (!apiRes.ok) return { error: `GitHub API error: ${apiRes.status}` };
        const issues = await apiRes.json();
        title = customTitle || `${owner}/${repo} — open issues`;
        textContent = (issues as { number: number; title: string; labels: { name: string }[]; created_at: string; body: string | null }[])
          .map((i) => `#${i.number}: ${i.title}\nLabels: ${i.labels.map((l) => l.name).join(", ") || "none"}\n${(i.body || "").slice(0, 300)}`)
          .join("\n\n---\n\n");

      } else if (section === "issues" && pathParts[3]) {
        // Single GitHub issue
        const apiRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues/${pathParts[3]}`,
          { headers: { "User-Agent": "MCMForge/1.0", Accept: "application/vnd.github.v3+json" } }
        );
        if (!apiRes.ok) return { error: `GitHub API error: ${apiRes.status}` };
        const issue = await apiRes.json() as { number: number; title: string; body: string | null; labels: { name: string }[]; state: string };
        title = customTitle || `${owner}/${repo}#${issue.number}: ${issue.title}`;
        textContent = `State: ${issue.state}\nLabels: ${issue.labels.map((l) => l.name).join(", ") || "none"}\n\n${issue.body || "(no body)"}`;

      } else if (section === "releases") {
        // GitHub releases
        const apiRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
          { headers: { "User-Agent": "MCMForge/1.0", Accept: "application/vnd.github.v3+json" } }
        );
        if (!apiRes.ok) return { error: `GitHub API error: ${apiRes.status}` };
        const releases = await apiRes.json();
        title = customTitle || `${owner}/${repo} — recent releases`;
        textContent = (releases as { tag_name: string; name: string; published_at: string; body: string | null }[])
          .map((r) => `## ${r.tag_name} — ${r.name || ""}\nPublished: ${r.published_at}\n\n${(r.body || "").slice(0, 1000)}`)
          .join("\n\n---\n\n");

      } else if (section === "blob" && pathParts.length > 3) {
        // Raw file on GitHub — fetch raw content
        const branch = pathParts[3];
        const filePath = pathParts.slice(4).join("/");
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
        const rawRes = await fetch(rawUrl, { headers: { "User-Agent": "MCMForge/1.0" } });
        if (!rawRes.ok) return { error: `Failed to fetch raw file: ${rawRes.status}` };
        textContent = (await rawRes.text()).slice(0, 10000);
        title = customTitle || `${owner}/${repo} — ${filePath}`;

      } else {
        // Generic GitHub page — fetch repo README as fallback
        const apiRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/readme`,
          { headers: { "User-Agent": "MCMForge/1.0", Accept: "application/vnd.github.v3+json" } }
        );
        if (apiRes.ok) {
          const readme = await apiRes.json() as { content: string };
          textContent = Buffer.from(readme.content, "base64").toString("utf-8").slice(0, 10000);
        } else {
          textContent = `Repository: ${owner}/${repo}\nURL: ${url}`;
        }
        title = customTitle || `${owner}/${repo}`;
      }
    } else {
      // Non-GitHub URL — fetch and strip HTML
      const res = await fetch(url, {
        headers: { "User-Agent": "MCMForge-KnowledgeSynthesizer/1.0" },
      });
      if (!res.ok) return { error: `Failed to fetch URL: ${res.status}` };
      const content = await res.text();
      textContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 10000);
      const pathTitle = urlObj.pathname.split("/").filter(Boolean).pop() || urlObj.hostname;
      title = customTitle || pathTitle.replace(/[-_]/g, " ").replace(/\.\w+$/, "");
    }
  } catch (e) {
    return { error: `Failed to fetch URL: ${e instanceof Error ? e.message : String(e)}` };
  }

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
