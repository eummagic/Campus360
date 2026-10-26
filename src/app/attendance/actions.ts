"use server";

import { revalidatePath } from "next/cache";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { getAccess } from "@/lib/data/core";
import { markAttendanceForSession } from "@/lib/data/campus";
import { attendanceSubmissionSchema } from "@/lib/validation/campus";

export type AttendanceActionResult = { ok: true } | { ok: false; message: string };

export async function markAttendance(
  _previous: AttendanceActionResult | null,
  formData: FormData,
): Promise<AttendanceActionResult> {
  const { user, roles } = await requireUserWithProfile();
  if (!hasRole(roles, "teacher")) return { ok: false, message: "Only assigned teachers can mark attendance." };

  let submittedRecords: unknown;
  try {
    submittedRecords = JSON.parse(String(formData.get("records") ?? ""));
  } catch {
    return { ok: false, message: "Attendance list is invalid." };
  }
  const parsed = attendanceSubmissionSchema.safeParse({
    timetableEntryId: formData.get("timetableEntryId"),
    sessionDate: formData.get("sessionDate"),
    records: submittedRecords,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check each attendance status." };

  const result = await markAttendanceForSession(await getAccess(user.id), parsed.data);
  if (!result.ok) return { ok: false, message: "Could not save attendance. Confirm the class date and assigned roster." };

  revalidatePath("/attendance");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}
