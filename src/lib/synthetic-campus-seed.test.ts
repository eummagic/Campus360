import { describe, expect, it } from "vitest";
import { stableSyntheticUuid, syntheticAttendanceStatus, WEEKLY_SCHEDULE } from "../../scripts/seed-synthetic-campus";

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
