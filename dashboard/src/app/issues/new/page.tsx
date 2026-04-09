import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import Link from "next/link";
import { NewIssueForm } from "./NewIssueForm";

async function getFormData(companyId: string) {
  const supabase = await createForgeClient();

  const [{ data: agents }, { data: projects }] =
    await Promise.all([
      supabase.from("agents").select("id, name, icon").eq("company_id", companyId).order("name"),
      supabase.from("projects").select("id, name").eq("company_id", companyId).order("name"),
    ]);

  return {
    agents: agents ?? [],
    projects: projects ?? [],
  };
}

export default async function NewIssuePage() {
  const company = await getActiveCompany();
  const companyId = company?.id ?? "";
  const { agents, projects } = await getFormData(companyId);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#e6edf3] tracking-wide uppercase">
            New Issue
          </h1>
          <p className="text-sm text-[#8b949e] mt-0.5">Create a new issue</p>
        </div>
        <Link
          href="/issues"
          className="text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          Cancel
        </Link>
      </div>

      <NewIssueForm
        companyId={companyId}
        companyName={company?.name ?? ""}
        companyPrefix={company?.issue_prefix ?? null}
        agents={agents}
        projects={projects}
      />
    </div>
  );
}
