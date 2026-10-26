// Pure, deterministic definitions of Sidharth's synthetic "S5" demo campus
// (moved unchanged from scripts/seed-synthetic-campus.ts so the same data is
// produced on MongoDB). No database access in this file.
import { createHash } from "node:crypto";

const FIXTURE_MARKER = "campus360-synthetic-s5-v1";
const UUID_NAMESPACE = "be9f5270-e566-5aa5-9f59-81b650a4d925";
export const SYNTHETIC_SCOPE = "synthetic-s5-demo";
export const SECTIONS = ["S5-A", "S5-B", "S5-C", "S5-D"] as const;
export type Section = (typeof SECTIONS)[number];

type SubjectSpec = { code: string; name: string; credits: number | null };
type ScheduleSpec = { subjectCode: string; weekday: number; start: string; end: string };
export type FixtureAccount = { email: string; displayName: string; role: "student" | "teacher"; section: Section; index?: number };
export type AcademicOffering = { id: string; subject_id: string; term_id: string; section_code: string; subjectCode: string };
export type SyntheticAssignment = { id: string; offeringId: string; sectionCode: string; teacherId: string | undefined; title: string; instructions: string; dueAt: string; status: "draft" | "published" };

export const SUBJECTS: SubjectSpec[] = [
  { code: "CS101", name: "Data Structures", credits: 4 },
  { code: "CS102", name: "Algorithms", credits: 4 },
  { code: "CS103", name: "Database Systems", credits: 4 },
  { code: "CS104", name: "Operating Systems", credits: 4 },
  { code: "CS105", name: "Computer Networks", credits: 3 },
  { code: "CS106", name: "Software Engineering", credits: 3 },
];

// ISO weekday numbers (Monday = 1).
export const WEEKLY_SCHEDULE: readonly ScheduleSpec[] = [
  { subjectCode: "CS101", weekday: 1, start: "09:00", end: "10:00" },
  { subjectCode: "CS103", weekday: 1, start: "10:15", end: "11:15" },
  { subjectCode: "CS105", weekday: 1, start: "11:30", end: "12:30" },
  { subjectCode: "CS102", weekday: 2, start: "09:00", end: "10:00" },
  { subjectCode: "CS104", weekday: 2, start: "10:15", end: "11:15" },
  { subjectCode: "CS106", weekday: 2, start: "11:30", end: "12:30" },
  { subjectCode: "CS101", weekday: 3, start: "09:00", end: "10:00" },
  { subjectCode: "CS103", weekday: 3, start: "10:15", end: "11:15" },
  { subjectCode: "CS105", weekday: 3, start: "11:30", end: "12:30" },
  { subjectCode: "CS106", weekday: 3, start: "13:30", end: "14:30" },
  { subjectCode: "CS102", weekday: 4, start: "09:00", end: "10:00" },
  { subjectCode: "CS103", weekday: 4, start: "10:15", end: "11:15" },
  { subjectCode: "CS104", weekday: 4, start: "11:30", end: "12:30" },
  { subjectCode: "CS106", weekday: 4, start: "13:30", end: "14:30" },
  { subjectCode: "CS101", weekday: 5, start: "09:00", end: "10:00" },
  { subjectCode: "CS102", weekday: 5, start: "10:15", end: "11:15" },
  { subjectCode: "CS104", weekday: 5, start: "11:30", end: "12:30" },
  { subjectCode: "CS105", weekday: 5, start: "13:30", end: "14:30" },
];

const ASSIGNMENT_TEMPLATES = [
  { slug: "problem-set-1", title: "Problem Set 1", instructions: "Solve the assigned problems and show the reasoning behind each answer.", dueAt: "2026-10-30T23:59:00.000Z", status: "published" as const },
  { slug: "implementation-project", title: "Implementation Project", instructions: "Submit a working implementation with a short explanation of the design choices and test cases.", dueAt: "2026-11-20T23:59:00.000Z", status: "published" as const },
  { slug: "review-exercises", title: "Review Exercises", instructions: "Use these exercises to review the term's core concepts. This item is a draft and is not visible to students.", dueAt: "2026-12-05T23:59:00.000Z", status: "draft" as const },
] as const;

export function stableSyntheticUuid(name: string): string {
  const namespace = Buffer.from(UUID_NAMESPACE.replaceAll("-", ""), "hex");
  const digest = createHash("sha1").update(namespace).update(`${FIXTURE_MARKER}:${name}`).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function makeSyntheticAssignments(
  offerings: readonly AcademicOffering[],
  teachersBySection: ReadonlyMap<string, string>,
): SyntheticAssignment[] {
  return offerings.flatMap((offering) => {
    const teacherId = teachersBySection.get(offering.section_code);
    return ASSIGNMENT_TEMPLATES.map((template) => ({
      id: stableSyntheticUuid(`assignment:${offering.id}:${template.slug}`),
      offeringId: offering.id,
      sectionCode: offering.section_code,
      teacherId,
      title: `${offering.subjectCode}: ${template.title}`,
      instructions: template.instructions,
      dueAt: template.dueAt,
      status: template.status,
    }));
  });
}

function statusForLimits(sectionIndex: number, studentIndex: number, occurrenceKey: string, limits: number[]): "present" | "absent" | "late" {
  const score = createHash("sha256").update(`${sectionIndex}|${studentIndex}|${occurrenceKey}`).digest().readUInt32BE(0) % 1000;
  if (score < limits[0]) return "present";
  if (score < limits[0] + limits[1]) return "late";
  return "absent";
}

export function syntheticAttendanceStatus(sectionIndex: number, studentIndex: number, occurrenceKey: string): "present" | "absent" | "late" {
  const band = studentIndex % 10;
  const limits = band === 0 ? [420, 80] : band <= 2 ? [920, 50] : band <= 7 ? [800, 90] : [620, 100];
  return statusForLimits(sectionIndex, studentIndex, occurrenceKey, limits);
}

export function makeAccounts(): FixtureAccount[] {
  const students = SECTIONS.flatMap((section) => Array.from({ length: 30 }, (_, index): FixtureAccount => {
    const number = index + 1;
    const shortSection = section.slice(-1);
    return {
      email: `campus360-demo-s5-${shortSection.toLowerCase()}-${String(number).padStart(3, "0")}@example.test`,
      displayName: `Synthetic Student ${section} ${String(number).padStart(3, "0")}`,
      role: "student",
      section,
      index: number,
    };
  }));
  const teachers = SECTIONS.map((section): FixtureAccount => ({
    email: `campus360-demo-s5-teacher-${section.slice(-1).toLowerCase()}@example.test`,
    displayName: `Synthetic Teacher ${section}`,
    role: "teacher",
    section,
  }));
  return [...students, ...teachers];
}

export function registrationFor(account: FixtureAccount): string {
  return `DEMO-S5-${account.section.slice(-1)}-${String(account.index).padStart(3, "0")}`;
}

export function roomFor(section: Section, subjectCode: string): string {
  return `CSE S5 Room ${100 + (SECTIONS.indexOf(section) + 1) * 100 + Number(subjectCode.slice(-1))}`;
}
