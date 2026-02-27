import { createClient } from "@/lib/supabase/server";

export const revalidate = 30;

interface Company {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  github_repo: string | null;
  supabase_project_id: string | null;
  domain: string | null;
  deploy_target: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-50 text-green-700 border border-green-200",
    paused: "bg-amber-50 text-amber-700 border border-amber-200",
    archived: "bg-[#f1f3f4] text-[#5f6368] border border-[#dadce0]",
    planning: "bg-[#e8f0fe] text-[#1a73e8] border border-[#d3e3fd]",
  };

  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
        styles[status] || styles.archived
      }`}
    >
      {status}
    </span>
  );
}

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("company_registry")
    .select("*")
    .order("created_at", { ascending: false });

  const rows: Company[] = companies || [];

  return (
    <div>
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-medium text-[#202124]">Companies</h1>
        <p className="text-[#5f6368] mt-1">
          Registered companies in the MCM Forge network
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="text-[#5f6368] text-sm p-8 border border-[#dadce0] bg-white rounded-lg text-center">
          No companies registered yet
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((company) => (
            <div
              key={company.id}
              className="bg-white border border-[#dadce0] rounded-xl p-6 flex flex-col gap-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium text-[#202124]">
                    {company.name}
                  </h2>
                  {company.description && (
                    <p className="text-sm text-[#5f6368] mt-1">
                      {company.description}
                    </p>
                  )}
                </div>
                <StatusBadge status={company.status} />
              </div>

              {/* Meta */}
              <div className="space-y-2 text-sm">
                {company.domain && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#5f6368] w-20 sm:w-28 shrink-0">Domain</span>
                    <a
                      href={`https://${company.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1a73e8] hover:underline truncate"
                    >
                      {company.domain}
                    </a>
                  </div>
                )}
                {company.github_repo && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#5f6368] w-20 sm:w-28 shrink-0">GitHub</span>
                    <a
                      href={`https://github.com/${company.github_repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1a73e8] hover:underline truncate"
                    >
                      {company.github_repo}
                    </a>
                  </div>
                )}
                {company.supabase_project_id && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#5f6368] w-20 sm:w-28 shrink-0">
                      Supabase
                    </span>
                    <span className="text-[#202124] font-mono text-xs truncate">
                      {company.supabase_project_id}
                    </span>
                  </div>
                )}
                {company.deploy_target && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#5f6368] w-20 sm:w-28 shrink-0">Deploy</span>
                    <span className="text-[#1a73e8] text-xs">
                      {company.deploy_target}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="pt-2 border-t border-[#dadce0] text-xs text-[#5f6368]">
                Registered {formatDate(company.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
