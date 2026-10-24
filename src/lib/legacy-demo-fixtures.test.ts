import { describe, expect, it } from "vitest";
import { legacyDemoId, makeLegacyAssignments, makeLegacyAttendanceFixtures, makeLegacyTimetableEntries } from "./legacy-demo-fixtures";

const offerings = [
  { id: "offering-cs101", subjectCode: "CS101" },
  { id: "offering-cs102", subjectCode: "CS102" },
];

describe("original demo account fixtures", () => {
  it("generates stable, conflict-free timetable rows for Teacher One's section", () => {
    const entries = makeLegacyTimetableEntries(offerings, "term-2026-fall", "admin-one");
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map(({ id }) => id)).size).toBe(2);
    expect(makeLegacyTimetableEntries(offerings, "term-2026-fall", "admin-one")).toEqual(entries);
    expect(entries.map(({ weekday, offering_id }) => [weekday, offering_id])).toEqual([[1, "offering-cs101"], [3, "offering-cs102"]]);
    expect(legacyDemoId("attendance-session:entry:2026-10-01")).toBe(legacyDemoId("attendance-session:entry:2026-10-01"));
  });

  it("creates past attendance only, for linked students, with varied deterministic outcomes", () => {
    const entries = makeLegacyTimetableEntries(offerings, "term-2026-fall", "admin-one");
    const fixtures = makeLegacyAttendanceFixtures({
      entries,
      students: [{ id: "student-one-record", index: 1 }, { id: "student-two-record", index: 2 }, { id: "admin-student-record", index: 3 }],
      teacherId: "teacher-one",
      today: "2026-10-24",
      termStartsOn: "2026-08-01",
      termEndsOn: "2026-12-15",
    });
    expect(fixtures.sessions.length).toBeGreaterThan(10);
    expect(fixtures.records).toHaveLength(fixtures.sessions.length * 3);
    expect(fixtures.sessions.every(({ session_date }) => session_date <= "2026-10-24")).toBe(true);
    expect(fixtures.records.every(({ status }) => ["present", "absent", "late"].includes(status))).toBe(true);
    expect(makeLegacyAttendanceFixtures({
      entries,
      students: [{ id: "student-one-record", index: 1 }, { id: "student-two-record", index: 2 }, { id: "admin-student-record", index: 3 }],
      teacherId: "teacher-one",
      today: "2026-10-24",
      termStartsOn: "2026-08-01",
      termEndsOn: "2026-12-15",
    })).toEqual(fixtures);
  });

  it("creates published and draft work with upcoming bounded dates", () => {
    const assignments = makeLegacyAssignments({ offerings, teacherId: "teacher-one", termEndsOn: "2026-12-15" });
    expect(assignments).toHaveLength(4);
    expect(assignments.filter(({ status }) => status === "published")).toHaveLength(2);
    expect(assignments.every(({ created_by }) => created_by === "teacher-one")).toBe(true);
    expect(assignments.every(({ due_at }) => due_at.slice(0, 10) > "2026-10-24" && due_at.slice(0, 10) <= "2026-12-15")).toBe(true);
    expect(makeLegacyAssignments({ offerings, teacherId: "teacher-one", termEndsOn: "2026-12-15" })).toEqual(assignments);
  });
});
