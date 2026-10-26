import { describe, expect, it } from "vitest";
import { getAssignmentDueState, summarizeAttendance } from "./attendance";
import { assignmentSchema, attendanceSubmissionSchema, timetableEntrySchema } from "./validation/campus";

const offeringId = "600000000000000000000001";
const studentRecordId = "700000000000000000000001";

describe("timetableEntrySchema", () => {
  it("accepts a same-day class and normalizes an empty location", () => {
    expect(timetableEntrySchema.parse({ offeringId, weekday: "1", startTime: "09:00", endTime: "10:30", location: " " })).toMatchObject({ weekday: 1, location: null });
  });

  it("rejects invalid weekday and end times not after start", () => {
    expect(timetableEntrySchema.safeParse({ offeringId, weekday: "8", startTime: "09:00", endTime: "10:00" }).success).toBe(false);
    expect(timetableEntrySchema.safeParse({ offeringId, weekday: "1", startTime: "10:00", endTime: "10:00" }).success).toBe(false);
  });
});

describe("attendanceSubmissionSchema", () => {
  it("accepts known marks and rejects duplicate student rows", () => {
    const valid = { timetableEntryId: offeringId, sessionDate: "2026-08-03", records: [{ studentRecordId, status: "late" }] };
    expect(attendanceSubmissionSchema.safeParse(valid).success).toBe(true);
    expect(attendanceSubmissionSchema.safeParse({ ...valid, records: [...valid.records, ...valid.records] }).success).toBe(false);
    expect(attendanceSubmissionSchema.safeParse({ ...valid, records: [{ studentRecordId, status: "excused" }] }).success).toBe(false);
  });
});

describe("attendance and assignment summaries", () => {
  it("uses present / recorded as the explicit attendance percentage and leaves empty data unreported", () => {
    expect(summarizeAttendance(["present", "absent", "late", "present"])).toEqual({ present: 2, absent: 1, late: 1, total: 4, percentage: 50 });
    expect(summarizeAttendance([]).percentage).toBeNull();
  });

  it("calculates upcoming, due-soon, and past-due from current time", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    expect(getAssignmentDueState("2026-08-04T00:00:00Z", now)).toBe("upcoming");
    expect(getAssignmentDueState("2026-08-02T00:00:00Z", now)).toBe("due-soon");
    expect(getAssignmentDueState("2026-07-31T23:59:00Z", now)).toBe("past-due");
  });

  it("accepts UTC form dates and rejects impossible due dates", () => {
    const assignment = { offeringId, title: "Lab", instructions: "", dueAt: "2026-08-03T12:00", status: "draft" };
    expect(assignmentSchema.safeParse(assignment).success).toBe(true);
    expect(assignmentSchema.safeParse({ ...assignment, dueAt: "2026-99-99T12:00" }).success).toBe(false);
  });
});
