"use server";
import { createForgeClient } from "@/lib/supabase/forge-server";
import { revalidatePath } from "next/cache";

export async function toggleRoutineStatus(routineId: string, currentStatus: string) {
  const supabase = await createForgeClient();
  const newStatus = currentStatus === "active" ? "paused" : "active";
  await supabase.from("routines").update({
    status: newStatus,
    updated_at: new Date().toISOString(),
  }).eq("id", routineId);
  revalidatePath("/routines");
}
