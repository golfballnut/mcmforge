"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleDispatcher(formData: FormData) {
  const currentStatus = formData.get("current_status") as string;
  const newStatus = currentStatus === "active" ? "paused" : "active";

  const supabase = await createClient();
  await supabase
    .from("system_config")
    .update({
      value: newStatus,
      updated_at: new Date().toISOString(),
      updated_by: "steve",
    })
    .eq("key", "dispatcher_status");

  revalidatePath("/");
}

export async function getDispatcherStatus(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "dispatcher_status")
    .single();

  return data?.value || "unknown";
}
