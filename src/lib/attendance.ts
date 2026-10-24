export type AttendanceStatus = "present" | "absent" | "late";

export function summarizeAttendance(statuses: readonly AttendanceStatus[]) {
  return summarizeAttendanceCounts(
    statuses.filter((status) => status === "present").length,
    statuses.filter((status) => status === "absent").length,
    statuses.filter((status) => status === "late").length,
  );
}

export function summarizeAttendanceCounts(present: number, absent: number, late: number) {
  const total = present + absent + late;

  return {
    present,
    absent,
    late,
    total,
    // Percentage is strictly present / recorded marks. Late marks remain
    // visible in their own count and are not silently treated as present.
    percentage: total === 0 ? null : Math.round((present / total) * 100),
  };
}

export type AssignmentDueState = "upcoming" | "due-soon" | "past-due";

const DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

export function getAssignmentDueState(dueAt: string, now = new Date()): AssignmentDueState {
  const dueTime = new Date(dueAt).getTime();
  const nowTime = now.getTime();
  if (!Number.isFinite(dueTime) || dueTime < nowTime) return "past-due";
  return dueTime - nowTime <= DUE_SOON_WINDOW_MS ? "due-soon" : "upcoming";
}
