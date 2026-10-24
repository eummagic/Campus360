export type CalendarSchedule = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  term: { name: string; status: string; starts_on: string | null; ends_on: string | null };
  offering: { id: string; section_code: string; subject: { code: string; name: string } };
};

export type CalendarEvent = {
  id: string;
  date: string;
  kind: "class" | "assignment";
  title: string;
  description: string;
  time?: string;
  href: string;
};

export function normalizeMonth(value: string | undefined, now = new Date()): string {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthDates(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

export function buildScheduleEvents(schedules: readonly CalendarSchedule[], month: string, isTeacher: boolean): CalendarEvent[] {
  return schedules.flatMap((schedule) => {
    if (schedule.term.status !== "active") return [];
    return monthDates(month).filter((date) => {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
      return weekday === schedule.weekday
        && (!schedule.term.starts_on || date >= schedule.term.starts_on)
        && (!schedule.term.ends_on || date <= schedule.term.ends_on);
    }).map((date) => ({
      id: `${schedule.id}-${date}`,
      date,
      kind: "class" as const,
      title: `${schedule.offering.subject.code} · section ${schedule.offering.section_code}`,
      description: `${schedule.offering.subject.name} · ${schedule.term.name}${schedule.location ? ` · ${schedule.location}` : ""}`,
      time: `${schedule.start_time.slice(0, 5)}–${schedule.end_time.slice(0, 5)}`,
      href: isTeacher ? `/attendance?entry=${schedule.id}&date=${date}` : "/timetable",
    }));
  });
}

export function buildAssignmentEvents(assignments: readonly { id: string; title: string; due_at: string; status: string; offering: { subject: { code: string }; section_code: string } }[]): CalendarEvent[] {
  return assignments.filter((assignment) => assignment.status === "published").map((assignment) => {
    const due = new Date(assignment.due_at);
    const date = `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, "0")}-${String(due.getUTCDate()).padStart(2, "0")}`;
    return {
      id: assignment.id,
      date,
      kind: "assignment" as const,
      title: assignment.title,
      description: `${assignment.offering.subject.code} · section ${assignment.offering.section_code} · due ${due.toISOString().slice(11, 16)} UTC`,
      href: `/assignments#${assignment.id}`,
    };
  });
}
