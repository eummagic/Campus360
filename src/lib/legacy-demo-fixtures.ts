import { createHash } from "node:crypto";

const ID_NAMESPACE = "e343f9d8-58ac-5e94-a9aa-caf89a03f782";
const WEEKLY_CLASSES = [
  { subjectCode: "CS101", weekday: 1, startTime: "09:00:00", endTime: "10:00:00", location: "CSE Room A101" },
  { subjectCode: "CS102", weekday: 3, startTime: "10:15:00", endTime: "11:15:00", location: "CSE Room A102" },
] as const;

export function legacyDemoId(name: string): string {
  const namespace = Buffer.from(ID_NAMESPACE.replaceAll("-", ""), "hex");
  const digest = createHash("sha1").update(namespace).update(`campus360-original-demo-v1:${name}`).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type LegacyOffering = { id: string; subjectCode: string };
export type LegacyClassEntry = {
  id: string;
  offering_id: string;
  term_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string;
  created_by: string;
  updated_by: string;
};

export function makeLegacyTimetableEntries(offerings: LegacyOffering[], termId: string, adminId: string): LegacyClassEntry[] {
  return WEEKLY_CLASSES.map((slot) => {
    const offering = offerings.find((candidate) => candidate.subjectCode === slot.subjectCode);
    if (!offering) throw new Error(`Missing original demo offering ${slot.subjectCode}.`);
    return {
      id: legacyDemoId(`timetable:${offering.id}:${slot.weekday}:${slot.startTime}`),
      offering_id: offering.id,
      term_id: termId,
      weekday: slot.weekday,
      start_time: slot.startTime,
      end_time: slot.endTime,
      location: slot.location,
      created_by: adminId,
      updated_by: adminId,
    };
  });
}

export type LegacyStudentRecord = { id: string; index: number };
export type LegacyAttendanceSession = {
  id: string;
  timetable_entry_id: string;
  offering_id: string;
  session_date: string;
  created_by: string;
};
export type LegacyAttendanceRecord = {
  id: string;
  session_id: string;
  offering_id: string;
  student_record_id: string;
  status: "present" | "absent" | "late";
  marked_by: string;
};

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function attendanceStatus(studentIndex: number, sessionId: string): "present" | "absent" | "late" {
  const score = createHash("sha256").update(`${studentIndex}:${sessionId}`).digest().readUInt32BE(0) % 100;
  const presentLimit = studentIndex === 1 ? 94 : studentIndex === 2 ? 76 : 87;
  const lateLimit = studentIndex === 1 ? 98 : studentIndex === 2 ? 88 : 94;
  return score < presentLimit ? "present" : score < lateLimit ? "late" : "absent";
}

export function makeLegacyAttendanceFixtures(args: {
  entries: LegacyClassEntry[];
  students: LegacyStudentRecord[];
  teacherId: string;
  today: string;
  termStartsOn: string;
  termEndsOn: string;
}): { sessions: LegacyAttendanceSession[]; records: LegacyAttendanceRecord[] } {
  const lastClassDate = args.today > args.termEndsOn ? args.termEndsOn : args.today;
  const firstClassDate = args.today < args.termStartsOn
    ? args.termStartsOn
    : [args.termStartsOn, addDays(lastClassDate, -55)].sort().at(-1)!;
  const sessions: LegacyAttendanceSession[] = [];
  const records: LegacyAttendanceRecord[] = [];

  for (let date = firstClassDate; date <= lastClassDate; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay() || 7;
    for (const entry of args.entries.filter((candidate) => candidate.weekday === weekday)) {
      const sessionId = legacyDemoId(`attendance-session:${entry.id}:${date}`);
      sessions.push({ id: sessionId, timetable_entry_id: entry.id, offering_id: entry.offering_id, session_date: date, created_by: args.teacherId });
      for (const student of args.students) {
        records.push({
          id: legacyDemoId(`attendance-record:${sessionId}:${student.id}`),
          session_id: sessionId,
          offering_id: entry.offering_id,
          student_record_id: student.id,
          status: attendanceStatus(student.index, sessionId),
          marked_by: args.teacherId,
        });
      }
    }
  }
  return { sessions, records };
}

export function makeLegacyAssignments(args: {
  offerings: LegacyOffering[];
  teacherId: string;
  termEndsOn: string;
}): Array<{ id: string; offering_id: string; title: string; instructions: string; due_at: string; status: "published" | "draft"; created_by: string }> {
  const specs = [
    { suffix: "practice", title: "Practice Set", instructions: "Work through the core problems for this subject.", dueDate: "2026-11-06", status: "published" as const },
    { suffix: "review", title: "Review Exercises", instructions: "Use these questions to review the topics covered this term.", dueDate: "2026-11-20", status: "draft" as const },
  ];
  return args.offerings.flatMap((offering, index) => specs.map((spec) => {
    const dueDate = addDays(spec.dueDate, index * 7);
    if (dueDate > args.termEndsOn) throw new Error("The original demo assignment date falls outside its academic term.");
    return {
      id: legacyDemoId(`assignment:${offering.id}:${spec.suffix}`),
      offering_id: offering.id,
      title: `${offering.subjectCode}: ${spec.title}`,
      instructions: spec.instructions,
      due_at: `${dueDate}T18:29:59.000Z`,
      status: spec.status,
      created_by: args.teacherId,
    };
  }));
}
