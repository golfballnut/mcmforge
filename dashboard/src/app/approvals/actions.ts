"use server";

import { createForgeClient } from "@/lib/supabase/forge-server";
import { revalidatePath } from "next/cache";

export async function approveItem(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createForgeClient();
  await supabase
    .from("approvals")
    .update({
      status: "approved",
      decided_by_user_id: "steve",
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/approvals");
  revalidatePath("/");
}

export async function rejectItem(formData: FormData) {
  const id = formData.get("id") as string;
  const notes = formData.get("notes") as string;
  if (!id) return;

  const supabase = await createForgeClient();
  await supabase
    .from("approvals")
    .update({
      status: "rejected",
      decided_by_user_id: "steve",
      decided_at: new Date().toISOString(),
      decision_note: notes || null,
    })
    .eq("id", id);

  revalidatePath("/approvals");
  revalidatePath("/");
}
