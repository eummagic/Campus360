import { describe, expect, it } from "vitest";
import { formatCampusTime, getSessionDisplayKind, layoutDayEntries, timeToMinutes } from "./timetable";

describe("campus timetable formatting", () => {
  it("parses stored wall-clock times without applying a timezone conversion", () => {
    expect(timeToMinutes("13:20:00")).toBe(800);
    expect(formatCampusTime("13:20:00")).toBe("1:20 PM");
  });

  it("keeps malformed times visible for diagnosis", () => {
    expect(Number.isNaN(timeToMinutes("25:70"))).toBe(true);
    expect(formatCampusTime("not-a-time")).toBe("not-a-time");
  });
});

describe("layoutDayEntries", () => {
  it("allocates separate lanes only for overlapping class times", () => {
    const result = layoutDayEntries([
      { id: "a", startMinute: 540, endMinute: 590 },
      { id: "b", startMinute: 560, endMinute: 620 },
      { id: "c", startMinute: 620, endMinute: 670 },
    ]);
    expect(result.map(({ entry, lane, laneCount }) => [entry.id, lane, laneCount])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 2],
    ]);
  });
});

describe("getSessionDisplayKind", () => {
  it("uses only distinctions recorded in subject names", () => {
    expect(getSessionDisplayKind("Machine Learning Lab")).toBe("Lab session");
    expect(getSessionDisplayKind("Web Application Project")).toBe("Project period");
    expect(getSessionDisplayKind("Algorithm Analysis and Design")).toBe("Class session");
  });
});
