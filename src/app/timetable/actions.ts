"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { getAccess, isObjectIdString } from "@/lib/data/core";
import { createTimetableEntry as insertTimetableEntry, deleteTimetableEntry as removeTimetableEntry } from "@/lib/data/campus";
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

  const result = await insertTimetableEntry(await getAccess(user.id), parsed.data);
  if (!result.ok) {
    if (result.reason === "offering") return { ok: false, message: "Select an available course offering." };
    return { ok: false, message: result.reason === "conflict" ? "That time conflicts with another class, room, or teacher." : "Could not save the timetable entry." };
  }

  revalidatePath("/timetable");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteTimetableEntry(formData: FormData): Promise<void> {
  const { user, roles } = await requireUserWithProfile();
  if (!hasRole(roles, "admin")) return;
  const id = formData.get("entryId");
  if (!isObjectIdString(id)) return;

  const outcome = await removeTimetableEntry(await getAccess(user.id), id);
  if (outcome === "attendance") redirect("/timetable?error=attendance");
  if (outcome === "error") redirect("/timetable?error=remove");
  revalidatePath("/timetable");
  revalidatePath("/calendar");
  redirect("/timetable?removed=1");
}
