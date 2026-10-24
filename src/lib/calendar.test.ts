import { describe, expect, it } from "vitest";
import { buildAssignmentEvents, buildScheduleEvents, monthDates, normalizeMonth, type CalendarSchedule } from "./calendar";

const schedule: CalendarSchedule = {
  id: "entry-1", weekday: 1, start_time: "09:00:00", end_time: "10:00:00", location: "Room 2",
  offering: { id: "offering-1", section_code: "A", term: { name: "Fall", status: "active", starts_on: "2026-08-01", ends_on: "2026-08-31" }, subject: { code: "CS101", name: "Data Structures" } },
};

describe("calendar event construction", () => {
  it("normalizes month input and creates valid month date ranges", () => {
    expect(normalizeMonth("2026-02")).toBe("2026-02");
    expect(normalizeMonth("2026-13", new Date("2026-08-03T00:00:00Z"))).toBe("2026-08");
    expect(monthDates("2026-02")).toHaveLength(28);
  });

  it("creates recurring events only within the active term and uses role-appropriate links", () => {
    const events = buildScheduleEvents([schedule, { ...schedule, id: "closed", offering: { ...schedule.offering, term: { ...schedule.offering.term, status: "closed" } } }], "2026-08", "teacher");
    expect(events).toHaveLength(5);
    expect(events[0]).toMatchObject({ date: "2026-08-03", kind: "class", href: "/attendance?entry=entry-1&date=2026-08-03" });
    expect(buildScheduleEvents([schedule], "2026-08", "student")[0]?.href).toBe("/subjects/offering-1");
    expect(buildScheduleEvents([schedule], "2026-08", "admin")[0]?.href).toBe("/timetable?section=A");
  });

  it("includes published assignment deadlines only", () => {
    const events = buildAssignmentEvents([
      { id: "published", title: "Lab", due_at: "2026-08-03T12:30:00Z", status: "published", offering: { subject: { code: "CS101" }, section_code: "A" } },
      { id: "draft", title: "Draft", due_at: "2026-08-03T12:30:00Z", status: "draft", offering: { subject: { code: "CS101" }, section_code: "A" } },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: "2026-08-03", title: "Lab", kind: "assignment" });
  });
});
