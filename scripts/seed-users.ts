import { createClient, type User } from "@supabase/supabase-js";
import {
  makeLegacyAssignments,
  makeLegacyAttendanceFixtures,
  makeLegacyTimetableEntries,
  type LegacyOffering,
} from "../src/lib/legacy-demo-fixtures";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Set the local Supabase URL and service-role key in .env.local.");
const parsedUrl = new URL(url);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname) || parsedUrl.port !== "55321") {
  throw new Error("The original demo seed only runs against the configured local Supabase API at 127.0.0.1:55321.");
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
type DemoRole = "student" | "teacher" | "admin";
type SeedUser = { email: string; password: string; displayName: string; roles: Array<{ role: DemoRole; scope: string }> };

const users: SeedUser[] = [
  { email: "admin1@example.com", password: "password123", displayName: "Admin One", roles: [{ role: "admin", scope: "demo" }] },
  { email: "student1@example.com", password: "password123", displayName: "Student One", roles: [{ role: "student", scope: "demo" }] },
  { email: "student2@example.com", password: "password123", displayName: "Student Two", roles: [{ role: "student", scope: "demo" }] },
  { email: "student3@example.com", password: "password123", displayName: "Student Three (unlinked)", roles: [{ role: "student", scope: "demo" }] },
  { email: "student4@example.com", password: "password123", displayName: "Student Four (unlinked test)", roles: [{ role: "student", scope: "demo" }] },
  { email: "adminstudent1@example.com", password: "password123", displayName: "Admin Student (multi-role)", roles: [{ role: "admin", scope: "demo" }, { role: "student", scope: "demo" }] },
  { email: "teacher1@example.com", password: "password123", displayName: "Teacher One", roles: [{ role: "teacher", scope: "demo" }] },
  { email: "teacher2@example.com", password: "password123", displayName: "Teacher Two (unassigned)", roles: [{ role: "teacher", scope: "demo" }] },
];

function normalized(field: string, value: unknown): string {
  if (field === "due_at") {
    const date = value instanceof Date ? value : new Date(String(value));
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

async function ensureNaturalRow(
  table: string,
  key: Record<string, unknown>,
  values: Record<string, unknown>,
  compare: string[],
): Promise<Record<string, unknown>> {
  const read = async () => {
    const { data, error } = await supabase.from(table).select("*").match(key).maybeSingle();
    if (error) throw new Error(`Could not inspect original demo fixture ${table}.`);
    return data as Record<string, unknown> | null;
  };
  let row = await read();
  if (!row) {
    const { error } = await supabase.from(table).insert(values);
    if (error && error.code !== "23505") throw new Error(`Could not create original demo fixture ${table}.`);
    row = await read();
  }
  if (!row || compare.some((field) => normalized(field, row[field]) !== normalized(field, values[field]))) {
    throw new Error(`Existing ${table} fixture conflicts with the expected demo values. No existing row was overwritten.`);
  }
  return row;
}

async function ensureRowsById(table: string, rows: Array<Record<string, unknown>>, label: string): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`Could not add ${label}; an existing row may conflict. No existing row was updated.`);
  const { data, error: readError } = await supabase.from(table).select("*").in("id", rows.map((row) => String(row.id)));
  if (readError || !data || data.length !== rows.length) throw new Error(`Could not verify ${label}.`);
  const actualById = new Map(data.map((row) => [String(row.id), row as Record<string, unknown>]));
  for (const expected of rows) {
    const actual = actualById.get(String(expected.id));
    if (!actual || Object.keys(expected).some((key) => normalized(key, actual[key]) !== normalized(key, expected[key]))) {
      throw new Error(`A deterministic ${label} ID already contains different data. No existing row was overwritten.`);
    }
  }
}

async function ensureUser(user: SeedUser): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.displayName },
    app_metadata: { campus360_fixture: "campus360-original-demo-v1" },
  });
  let userId: string;
  if (!error) userId = data.user.id;
  else if (/already been registered|already exists/i.test(error.message)) {
    const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw new Error("Could not locate an existing original demo account.");
    const existing = listed.users.find((candidate: User) => candidate.email?.toLowerCase() === user.email);
    if (!existing) throw new Error("An account with this demo email exists but could not be safely identified.");
    userId = existing.id;
  } else throw new Error(`Could not create original demo account ${user.email}.`);

  await ensureNaturalRow("profiles", { id: userId }, { id: userId, display_name: user.displayName, contact_email: user.email }, ["display_name", "contact_email"]);
  for (const role of user.roles) {
    await ensureNaturalRow("user_roles", { user_id: userId, role: role.role, scope: role.scope }, { user_id: userId, role: role.role, scope: role.scope }, ["user_id", "role", "scope"]);
  }
  console.log(`Verified original demo account ${user.email}.`);
  return userId;
}

function localDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function seedOriginalAcademicData(ids: Map<string, string>): Promise<void> {
  const today = localDate();
  const department = await ensureNaturalRow("departments", { code: "CSE" }, { code: "CSE", name: "Computer Science", status: "active" }, ["name", "status"]);
  const program = await ensureNaturalRow("programs", { department_id: department.id, code: "BTECH_CSE" }, { department_id: department.id, code: "BTECH_CSE", name: "B.Tech Computer Science", status: "active" }, ["name", "status"]);
  const term = await ensureNaturalRow("academic_terms", { name: "2026 Fall" }, { name: "2026 Fall", starts_on: "2026-08-01", ends_on: "2026-12-15", status: "active" }, ["starts_on", "ends_on", "status"]);

  const offerings: LegacyOffering[] = [];
  for (const subject of [{ code: "CS101", name: "Data Structures", credits: 4 }, { code: "CS102", name: "Algorithms", credits: 4 }]) {
    const row = await ensureNaturalRow("subjects", { program_id: program.id, code: subject.code }, { ...subject, program_id: program.id, status: "active" }, ["name", "credits", "status"]);
    const offering = await ensureNaturalRow("course_offerings", { subject_id: row.id, term_id: term.id, section_code: "A" }, { subject_id: row.id, term_id: term.id, section_code: "A", status: "active" }, ["status"]);
    offerings.push({ id: String(offering.id), subjectCode: subject.code });
  }

  const teacherId = ids.get("teacher1@example.com")!;
  const adminId = ids.get("admin1@example.com")!;
  for (const offering of offerings) {
    await ensureNaturalRow("teaching_assignments", { teacher_user_id: teacherId, offering_id: offering.id }, { teacher_user_id: teacherId, offering_id: offering.id, assigned_by: adminId }, ["teacher_user_id", "offering_id"]);
  }

  const students = [
    { user_id: ids.get("student1@example.com")!, registration_number: "CSE2023001", index: 1 },
    { user_id: ids.get("student2@example.com")!, registration_number: "CSE2023002", index: 2 },
    { user_id: ids.get("adminstudent1@example.com")!, registration_number: "CSE2023099", index: 3 },
  ];
  const studentRecords: Array<{ id: string; index: number }> = [];
  for (const student of students) {
    const row = await ensureNaturalRow("student_records", { user_id: student.user_id }, { user_id: student.user_id, registration_number: student.registration_number, program_id: program.id, status: "active" }, ["registration_number", "program_id", "status"]);
    studentRecords.push({ id: String(row.id), index: student.index });
    for (const offering of offerings) {
      await ensureNaturalRow("enrolments", { student_record_id: row.id, offering_id: offering.id }, { student_record_id: row.id, offering_id: offering.id }, ["student_record_id", "offering_id"]);
    }
  }

  const entries = makeLegacyTimetableEntries(offerings, String(term.id), adminId);
  await ensureRowsById("timetable_entries", entries, "original demo timetable entries");
  const attendance = makeLegacyAttendanceFixtures({
    entries,
    students: studentRecords,
    teacherId,
    today,
    termStartsOn: "2026-08-01",
    termEndsOn: "2026-12-15",
  });
  await ensureRowsById("attendance_sessions", attendance.sessions, "original demo attendance sessions");
  await ensureRowsById("attendance_records", attendance.records, "original demo attendance marks");
  const assignments = makeLegacyAssignments({ offerings, teacherId, termEndsOn: "2026-12-15" });
  await ensureRowsById("assignments", assignments, "original demo assignments");

  console.log(`Original demo academics verified: ${offerings.length} offerings, ${entries.length} timetable entries, ${attendance.sessions.length} historical sessions, ${attendance.records.length} attendance marks, ${assignments.filter((row) => row.status === "published").length} published assignments.`);
  console.log("Student Three/Four are preserved for the unlinked-account workflow on a fresh seed; existing records are left untouched. Teacher Two remains intentionally unassigned.");
}

async function main(): Promise<void> {
  const ids = new Map<string, string>();
  for (const user of users) ids.set(user.email, await ensureUser(user));
  await seedOriginalAcademicData(ids);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Original demo seed failed.");
  process.exit(1);
});
