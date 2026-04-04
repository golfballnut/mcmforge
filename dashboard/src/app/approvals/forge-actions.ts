"use server";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { revalidatePath } from "next/cache";

export async function approveRequest(approvalId: string) {
  const supabase = await createForgeClient();
  await supabase.from("approvals").update({
    status: "approved",
    decided_at: new Date().toISOString(),
    decided_by_user_id: "steve",
  }).eq("id", approvalId);
  revalidatePath("/approvals");
}

export async function rejectRequest(approvalId: string) {
  const supabase = await createForgeClient();
  await supabase.from("approvals").update({
    status: "rejected",
    decided_at: new Date().toISOString(),
    decided_by_user_id: "steve",
  }).eq("id", approvalId);
  revalidatePath("/approvals");
}
