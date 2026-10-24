"use server";

import { revalidatePath } from "next/cache";
import { hasRole, requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attendanceSubmissionSchema } from "@/lib/validation/campus";

export type AttendanceActionResult = { ok: true } | { ok: false; message: string };

export async function markAttendance(
  _previous: AttendanceActionResult | null,
  formData: FormData,
): Promise<AttendanceActionResult> {
  const { roles } = await requireUserWithProfile();
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

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_attendance_for_session", {
    p_timetable_entry_id: parsed.data.timetableEntryId,
    p_session_date: parsed.data.sessionDate,
    p_records: parsed.data.records.map((record) => ({ student_record_id: record.studentRecordId, status: record.status })),
  });
  if (error) return { ok: false, message: "Could not save attendance. Confirm the class date and assigned roster." };

  revalidatePath("/attendance");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}
