"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timetableEntrySchema } from "@/lib/validation/campus";

export type TimetableActionResult = { ok: true } | { ok: false; message: string };

export async function createTimetableEntry(
  _previous: TimetableActionResult | null,
  formData: FormData,
): Promise<TimetableActionResult> {
  const { user, roles } = await requireUserWithProfile();
  if (!hasRole(roles, "admin")) return { ok: false, message: "Not authorized." };

  const parsed = timetableEntrySchema.safeParse({
    offeringId: formData.get("offeringId"),
    weekday: formData.get("weekday"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    location: formData.get("location"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid timetable entry." };

  const supabase = await createClient();
  const { data: offering, error: offeringError } = await supabase
    .from("course_offerings").select("term_id, term:academic_terms!inner(status)")
    .eq("id", parsed.data.offeringId).eq("status", "active").eq("term.status", "active").maybeSingle();
  if (offeringError || !offering) return { ok: false, message: "Select an available course offering." };

  const { error } = await supabase.from("timetable_entries").insert({
    offering_id: parsed.data.offeringId,
    term_id: offering.term_id,
    weekday: parsed.data.weekday,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    location: parsed.data.location,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    return { ok: false, message: error.code === "23P01" ? "That time conflicts with another class, room, or teacher." : "Could not save the timetable entry." };
  }

  revalidatePath("/timetable");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteTimetableEntry(formData: FormData): Promise<void> {
  const { roles } = await requireUserWithProfile();
  if (!hasRole(roles, "admin")) return;
  const id = formData.get("entryId");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return;

  const supabase = await createClient();
  const { count, error: sessionLookupError } = await supabase.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("timetable_entry_id", id);
  if (sessionLookupError) redirect("/timetable?error=remove");
  if ((count ?? 0) > 0) redirect("/timetable?error=attendance");
  const { error } = await supabase.from("timetable_entries").delete().eq("id", id);
  if (error) redirect("/timetable?error=remove");
  revalidatePath("/timetable");
  revalidatePath("/calendar");
  redirect("/timetable?removed=1");
}
