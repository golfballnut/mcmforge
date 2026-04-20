import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import ChangelogsClient from "./ChangelogsClient";

export const revalidate = 0;

type ChangelogIssue = {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string[] | null;
  pr_url: string | null;
  created_at: string;
  updated_at: string;
};

async function getChangelogIssues(companyId: string): Promise<ChangelogIssue[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("issues")
    .select(
      "id, identifier, title, description, status, priority, tags, pr_url, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .or("tags.cs.{changelog},title.ilike.[changelog]%")
    .order("created_at", { ascending: false })
    .limit(200);

  return (data ?? []) as ChangelogIssue[];
}

export default async function ChangelogsPage() {
  const company = await getActiveCompany();
  const issues = await getChangelogIssues(company?.id ?? "");

  return <ChangelogsClient issues={issues} />;
}
