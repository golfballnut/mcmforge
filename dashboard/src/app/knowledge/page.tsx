import { createForgeClient } from "@/lib/supabase/forge-server";
import { getActiveCompany } from "@/lib/get-active-company";
import KnowledgeClient from "./KnowledgeClient";

export const revalidate = 0;

async function getKnowledge(companyId: string) {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from("knowledge")
    .select("*")
    .eq("company_id", companyId)
    .is("superseded_by", null)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export default async function KnowledgePage() {
  const company = await getActiveCompany();
  const knowledge = await getKnowledge(company?.id ?? "");

  return <KnowledgeClient initialData={knowledge} />;
}
