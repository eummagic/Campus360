import { describe, expect, it } from "vitest";
import { makeSyntheticAssignments, stableSyntheticUuid, syntheticAttendanceStatus, WEEKLY_SCHEDULE } from "../../scripts/mongo/synthetic-fixture";

describe("synthetic Campus360 schedule fixture", () => {
  it("uses a stable version-5 UUID namespace for deterministic records", () => {
    const first = stableSyntheticUuid("student-record:DEMO-S5-A-001");
    expect(first).toBe(stableSyntheticUuid("student-record:DEMO-S5-A-001"));
    expect(first).not.toBe(stableSyntheticUuid("student-record:DEMO-S5-A-002"));
    expect(first[14]).toBe("5");
  });

  it("schedules each subject three times per week without group time conflicts", () => {
    expect(WEEKLY_SCHEDULE).toHaveLength(18);
    for (const code of ["CS101", "CS102", "CS103", "CS104", "CS105", "CS106"]) {
      expect(WEEKLY_SCHEDULE.filter((entry) => entry.subjectCode === code)).toHaveLength(3);
    }
    for (let weekday = 1; weekday <= 5; weekday += 1) {
      const day = WEEKLY_SCHEDULE.filter((entry) => entry.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start));
      for (let index = 1; index < day.length; index += 1) {
        expect(day[index - 1].end <= day[index].start).toBe(true);
      }
    }
  });

  it("keeps attendance outcomes deterministic and includes all supported statuses", () => {
    const sample = Array.from({ length: 600 }, (_, index) => syntheticAttendanceStatus(index % 4, (index % 30) + 1, `2026-09-${String((index % 28) + 1).padStart(2, "0")}|CS101`));
    expect(sample).toEqual(Array.from({ length: 600 }, (_, index) => syntheticAttendanceStatus(index % 4, (index % 30) + 1, `2026-09-${String((index % 28) + 1).padStart(2, "0")}|CS101`)));
    expect(new Set(sample)).toEqual(new Set(["present", "absent", "late"]));
  });

  it("preserves distinct high, regular, inconsistent, and low attendance tendencies", () => {
    const presentRate = (studentNumber: number) => {
      const statuses = Array.from({ length: 1000 }, (_, index) => syntheticAttendanceStatus(0, studentNumber, `occurrence-${index}`));
      return statuses.filter((status) => status === "present").length / statuses.length;
    };
    expect(presentRate(1)).toBeGreaterThan(0.88);
    expect(presentRate(3)).toBeGreaterThan(0.75);
    expect(presentRate(3)).toBeLessThan(0.85);
    expect(presentRate(8)).toBeGreaterThan(0.57);
    expect(presentRate(8)).toBeLessThan(0.67);
    expect(presentRate(10)).toBeGreaterThan(0.37);
    expect(presentRate(10)).toBeLessThan(0.47);
  });
});

describe("synthetic Campus360 assignments", () => {
  it("creates three stable assignments per offering with published and draft states", () => {
    const offerings = Array.from({ length: 24 }, (_, index) => ({
      id: `offering-${index}`,
      subject_id: `subject-${index % 6}`,
      term_id: "term-2026-fall",
      section_code: `S5-${String.fromCharCode(65 + Math.floor(index / 6))}`,
      subjectCode: `CS10${(index % 6) + 1}`,
    }));
    const teachers = new Map(["S5-A", "S5-B", "S5-C", "S5-D"].map((section) => [section, `teacher-${section}`]));
    const assignments = makeSyntheticAssignments(offerings, teachers);

    expect(assignments).toHaveLength(72);
    expect(assignments.filter((assignment) => assignment.status === "published")).toHaveLength(48);
    expect(assignments.filter((assignment) => assignment.status === "draft")).toHaveLength(24);
    expect(new Set(assignments.map((assignment) => assignment.id)).size).toBe(72);
    expect(makeSyntheticAssignments(offerings, teachers)).toEqual(assignments);
    for (const offering of offerings) {
      const offeringAssignments = assignments.filter((assignment) => assignment.offeringId === offering.id);
      expect(offeringAssignments).toHaveLength(3);
      expect(offeringAssignments.every((assignment) => assignment.teacherId === teachers.get(offering.section_code))).toBe(true);
    }
  });
});
