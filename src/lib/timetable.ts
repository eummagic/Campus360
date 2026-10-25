export type TimetableDisplayEntry = {
  id: string;
  offeringId: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  startMinute: number;
  endMinute: number;
  location: string | null;
  sectionCode: string;
  subjectCode: string;
  subjectName: string;
};

export function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return Number.NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return Number.NaN;
  return hour * 60 + minute;
}

export function formatCampusTime(value: string): string {
  const minute = timeToMinutes(value);
  if (!Number.isFinite(minute)) return value;
  const hour24 = Math.floor(minute / 60);
  const hour = hour24 % 12 || 12;
  const suffix = hour24 < 12 ? "AM" : "PM";
  return `${hour}:${String(minute % 60).padStart(2, "0")} ${suffix}`;
}

export type SessionDisplayKind = "Lab session" | "Project period" | "Self-study" | "Class session";

export function getSessionDisplayKind(subjectName: string): SessionDisplayKind {
  if (/\b(lab|laboratory)\b/i.test(subjectName)) return "Lab session";
  if (/\b(project)\b/i.test(subjectName)) return "Project period";
  if (/\bself[ -]?study\b/i.test(subjectName)) return "Self-study";
  return "Class session";
}

export function layoutDayEntries<T extends { startMinute: number; endMinute: number }>(entries: readonly T[]) {
  const sorted = [...entries].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const laneEnds: number[] = [];
  const laidOut = sorted.map((entry) => {
    let lane = laneEnds.findIndex((end) => end <= entry.startMinute);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = entry.endMinute;
    return { entry, lane };
  });
  const laneCount = Math.max(1, laneEnds.length);
  return laidOut.map((item) => ({ ...item, laneCount }));
}
