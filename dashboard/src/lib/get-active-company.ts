import { cookies } from "next/headers";
import { createForgeClient } from "@/lib/supabase/forge-server";

export async function getActiveCompany() {
  const cookieStore = await cookies();
  const slug =
    cookieStore.get("forge-active-company")?.value || "mcm-forge";

  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name, slug, issue_prefix, issue_counter")
    .eq("slug", slug)
    .single();

  // Fallback to mcm-forge if slug not found
  if (!data) {
    const { data: fallback } = await supabase
      .from("companies")
      .select("id, name, slug, issue_prefix, issue_counter")
      .eq("slug", "mcm-forge")
      .single();
    return fallback;
  }
  return data;
}
