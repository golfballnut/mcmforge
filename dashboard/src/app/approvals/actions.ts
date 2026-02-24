"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function approveItem(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("approval_queue")
    .update({
      status: "approved",
      decided_by: "steve",
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

  const supabase = await createClient();
  await supabase
    .from("approval_queue")
    .update({
      status: "rejected",
      decided_by: "steve",
      decided_at: new Date().toISOString(),
      decision_notes: notes || null,
    })
    .eq("id", id);

  revalidatePath("/approvals");
  revalidatePath("/");
}
