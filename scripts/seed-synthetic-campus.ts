import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_PNPM_DIR = path.join(ROOT, "node_modules", ".pnpm");
const SUPABASE_PACKAGE_DIR = readdirSync(SUPABASE_PNPM_DIR).find((name) =>
  name.startsWith("supabase@") && existsSync(path.join(SUPABASE_PNPM_DIR, name, "node_modules", "supabase", "dist", "supabase.js")),
);
if (!SUPABASE_PACKAGE_DIR) throw new Error("The locally installed Supabase CLI JavaScript entry point is unavailable.");
const SUPABASE_CLI_JS = path.join(SUPABASE_PNPM_DIR, SUPABASE_PACKAGE_DIR, "node_modules", "supabase", "dist", "supabase.js");
const FIXTURE_MARKER = "campus360-synthetic-s5-v1";
const SYNTHETIC_SCOPE = "synthetic-s5-demo";
const UUID_NAMESPACE = "be9f5270-e566-5aa5-9f59-81b650a4d925";
const TARGET_URL = "http://127.0.0.1:55321";
const SECTIONS = ["S5-A", "S5-B", "S5-C", "S5-D"] as const;
const DEPARTMENT = { code: "CSE", name: "Computer Science" } as const;
const PROGRAM = { code: "BTECH_CSE", name: "B.Tech Computer Science" } as const;
const TERM = { name: "2026 Fall", startsOn: "2026-08-01", endsOn: "2026-12-15" } as const;
const ROLE_ADMIN_EMAIL = "admin1@example.com";

type SubjectSpec = { code: string; name: string; credits: number | null };
type ScheduleSpec = { subjectCode: string; weekday: number; start: string; end: string };
type FixtureAccount = { email: string; displayName: string; role: "student" | "teacher"; section?: (typeof SECTIONS)[number]; index?: number };
type AcademicOffering = { id: string; subject_id: string; term_id: string; section_code: string; subjectCode: string };
export type SyntheticAssignment = { id: string; offeringId: string; sectionCode: string; teacherId: string | undefined; title: string; instructions: string; dueAt: string; status: "draft" | "published" };
type Entry = { id: string; offeringId: string; teacherId: string; section: (typeof SECTIONS)[number]; weekday: number; start: string; end: string; location: string };
type Mark = { id: string; sessionId: string; offeringId: string; studentRecordId: string; status: "present" | "absent" | "late"; legacyStatus: "present" | "absent" | "late"; teacherId: string };

const SUBJECTS: SubjectSpec[] = [
  { code: "CS101", name: "Data Structures", credits: 4 },
  { code: "CS102", name: "Algorithms", credits: 4 },
  { code: "CS103", name: "Database Systems", credits: 4 },
  { code: "CS104", name: "Operating Systems", credits: 4 },
  { code: "CS105", name: "Computer Networks", credits: 3 },
  { code: "CS106", name: "Software Engineering", credits: 3 },
];

// ISO weekday numbers. The schema has no session-type field, so every entry is
// represented as a class session without fabricating lecture/lab distinctions.
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

export function makeSyntheticAssignments(
  offerings: readonly AcademicOffering[],
  teachersBySection: ReadonlyMap<string, string>,
): SyntheticAssignment[] {
  return offerings.flatMap((offering) => {
    const teacherId = teachersBySection.get(offering.section_code);
    return ASSIGNMENT_TEMPLATES.map((template) => ({
      id: uuidFromName(`assignment:${offering.id}:${template.slug}`),
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

export function stableSyntheticUuid(name: string): string {
  const namespace = Buffer.from(UUID_NAMESPACE.replaceAll("-", ""), "hex");
  const digest = createHash("sha1").update(namespace).update(`${FIXTURE_MARKER}:${name}`).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const uuidFromName = stableSyntheticUuid;

function statusForLimits(sectionIndex: number, studentIndex: number, occurrenceKey: string, limits: number[]): "present" | "absent" | "late" {
  const score = createHash("sha256").update(`${sectionIndex}|${studentIndex}|${occurrenceKey}`).digest().readUInt32BE(0) % 1000;
  if (score < limits[0]) return "present";
  if (score < limits[0] + limits[1]) return "late";
  return "absent";
}

function legacySyntheticAttendanceStatus(sectionIndex: number, studentIndex: number, occurrenceKey: string): "present" | "absent" | "late" {
  const band = studentIndex % 10;
  const limits = band <= 2 ? [920, 50] : band <= 7 ? [800, 90] : band <= 9 ? [620, 100] : [420, 80];
  return statusForLimits(sectionIndex, studentIndex, occurrenceKey, limits);
}

export function syntheticAttendanceStatus(sectionIndex: number, studentIndex: number, occurrenceKey: string): "present" | "absent" | "late" {
  const band = studentIndex % 10;
  const limits = band === 0 ? [420, 80] : band <= 2 ? [920, 50] : band <= 7 ? [800, 90] : [620, 100];
  return statusForLimits(sectionIndex, studentIndex, occurrenceKey, limits);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function jsonSql(value: unknown): string {
  return quote(JSON.stringify(value));
}

function getLocalDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function runLocalSupabase(args: string[], expectedJson = false): string {
  const result = spawnSync(process.execPath, [SUPABASE_CLI_JS, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DO_NOT_TRACK: "1" },
  });
  if (result.error || result.status !== 0) {
    const operation = args[0] === "status" ? "status check" : "local database transaction";
    const safeLines = `${result.stderr ?? ""}\n${result.stdout ?? ""}`
      .split(/\r?\n/)
      .filter((line) => /error|failed|fatal|hint|detail/i.test(line))
      .slice(-5)
      .map((line) => line
        .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[redacted]@")
        .replace(/(?:service[_ -]?role|publishable|anon)[_ -]?key\s*[:=]\s*[^,\s]+/gi, "[credential redacted]")
        .slice(0, 500));
    throw new Error(`Local Supabase ${operation} failed${result.status === null ? " to start" : ` (exit ${result.status})`}${safeLines.length ? `: ${safeLines.join(" | ")}` : "."}`);
  }
  const stdout = result.stdout ?? "";
  return expectedJson ? stdout : "";
}

async function verifyLocalTarget(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.origin !== TARGET_URL || parsed.pathname !== "" && parsed.pathname !== "/") {
    throw new Error(`Refusing to write: configured Supabase URL must be exactly ${TARGET_URL}.`);
  }
  const output = runLocalSupabase(["status", "--output", "json"], true);
  const statusStart = output.indexOf("{");
  const status = JSON.parse(output.slice(statusStart)) as { linked_project?: string | null; API_URL?: string; DB_URL?: string };
  const linked = status.linked_project !== null && status.linked_project !== undefined && status.linked_project.trim() !== "";
  if (linked || status.API_URL !== TARGET_URL || !status.DB_URL?.includes("127.0.0.1:55322")) {
    const linkedDescription = linked ? "yes" : "no";
    const apiMatches = status.API_URL === TARGET_URL;
    const dbMatches = Boolean(status.DB_URL?.includes("127.0.0.1:55322"));
    throw new Error(`Refusing to write: local Supabase identity check failed (linked=${linkedDescription}, apiMatches=${apiMatches}, databaseMatches=${dbMatches}).`);
  }
}

async function listAllAuthUsers(client: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Unable to inspect local Auth users; no data changes were made.");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new Error("Local Auth user pagination exceeded the safety bound; no data changes were made.");
}

function exactSingle<T>(rows: T[], description: string): T {
  if (rows.length !== 1) throw new Error(`Expected exactly one existing ${description}; found ${rows.length}.`);
  return rows[0];
}

async function assertNoQueryError<T>(result: { data: T | null; error: { message: string } | null }, label: string): Promise<T> {
  if (result.error || result.data === null) throw new Error(`Local preflight failed while checking ${label}.`);
  return result.data;
}

function makeAccounts(): FixtureAccount[] {
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

async function preflight(client: SupabaseClient, accountSpecs: FixtureAccount[], authUsers: User[]) {
  const markerUsers = new Map<string, User>();
  const accountByEmail = new Map(authUsers.map((user) => [user.email?.toLowerCase() ?? "", user]));
  for (const spec of accountSpecs) {
    const existing = accountByEmail.get(spec.email);
    if (existing && existing.app_metadata?.campus360_fixture !== FIXTURE_MARKER) {
      throw new Error("A reserved synthetic account email is already in use by an untagged Auth user. No data changes were made.");
    }
    if (existing) markerUsers.set(spec.email, existing);
  }

  const departmentResult = await client.from("departments").select("id,code,name,status").eq("code", DEPARTMENT.code);
  const departments = await assertNoQueryError(departmentResult, "department");
  const department = exactSingle(departments, "CSE department");
  if (department.name !== DEPARTMENT.name || department.status !== "active") throw new Error("Existing CSE department differs from the expected active seed structure.");

  const programResult = await client.from("programs").select("id,department_id,code,name,status").eq("department_id", department.id).eq("code", PROGRAM.code);
  const programs = await assertNoQueryError(programResult, "program");
  const program = exactSingle(programs, "BTECH_CSE program");
  if (program.name !== PROGRAM.name || program.status !== "active") throw new Error("Existing BTECH_CSE program differs from the expected active seed structure.");

  const termResult = await client.from("academic_terms").select("id,name,starts_on,ends_on,status").eq("name", TERM.name);
  const terms = await assertNoQueryError(termResult, "academic term");
  const term = exactSingle(terms, "2026 Fall term");
  if (term.starts_on !== TERM.startsOn || term.ends_on !== TERM.endsOn || term.status !== "active") throw new Error("Existing 2026 Fall term does not match the expected active dates.");

  const today = getLocalDate();
  const startDate = addDays(today, -55);
  if (startDate < TERM.startsOn || today > TERM.endsOn) throw new Error("The current eight-week range falls outside the configured 2026 Fall term; no data changes were made.");

  const subjectResult = await client.from("subjects").select("id,program_id,code,name,credits,status").eq("program_id", program.id).in("code", SUBJECTS.map(({ code }) => code));
  const existingSubjects = await assertNoQueryError(subjectResult, "subjects");
  const subjectMap = new Map<string, { id: string; program_id: string; code: string; name: string; credits: number | null; status: string }>();
  for (const expected of SUBJECTS) {
    const matches = existingSubjects.filter((subject) => subject.code === expected.code);
    if (matches.length > 1) throw new Error(`Duplicate subject code ${expected.code}; no data changes were made.`);
    if (matches[0]) {
      const subject = matches[0];
      if (subject.name !== expected.name || subject.status !== "active" || (expected.code.startsWith("CS10") && Number(expected.code.slice(-1)) >= 3 && subject.credits !== expected.credits)) {
        throw new Error(`Existing ${expected.code} subject conflicts with the synthetic dataset; no data changes were made.`);
      }
      subjectMap.set(expected.code, subject);
    } else {
      subjectMap.set(expected.code, {
        id: uuidFromName(`subject:${PROGRAM.code}:${expected.code}`),
        program_id: program.id,
        code: expected.code,
        name: expected.name,
        credits: expected.credits,
        status: "active",
      });
    }
  }

  const sections = [...SECTIONS];
  const subjectIds = [...subjectMap.values()].map(({ id }) => id);
  const offeringResult = await client.from("course_offerings").select("id,subject_id,term_id,section_code,status").eq("term_id", term.id).in("subject_id", subjectIds).in("section_code", sections);
  const existingOfferings = await assertNoQueryError(offeringResult, "target course offerings");
  const offerings: AcademicOffering[] = [];
  for (const section of SECTIONS) {
    for (const subject of SUBJECTS) {
      const subjectRow = subjectMap.get(subject.code)!;
      const existing = existingOfferings.filter((row) => row.subject_id === subjectRow.id && row.section_code === section);
      if (existing.length > 1) throw new Error(`Duplicate offering ${subject.code} ${section}; no data changes were made.`);
      const id = uuidFromName(`offering:${subject.code}:${term.id}:${section}`);
      if (existing[0] && (existing[0].id !== id || existing[0].status !== "active")) {
        throw new Error(`Existing offering ${subject.code} ${section} is not owned by this generator namespace; no data changes were made.`);
      }
      offerings.push({ id, subject_id: subjectRow.id, term_id: term.id, section_code: section, subjectCode: subject.code });
    }
  }

  const syntheticTeachersBySection = new Map(SECTIONS.flatMap((section) => {
    const teacher = accountSpecs.find((spec) => spec.role === "teacher" && spec.section === section)!;
    const existing = markerUsers.get(teacher.email);
    return existing ? [[section, existing.id] as const] : [];
  }));
  const expectedAssignments = makeSyntheticAssignments(offerings, syntheticTeachersBySection);
  const assignmentResult = await client.from("assignments")
    .select("id,offering_id,title,instructions,due_at,status,created_by")
    .in("id", expectedAssignments.map(({ id }) => id));
  const existingAssignments = await assertNoQueryError(assignmentResult, "synthetic assignments");
  for (const existing of existingAssignments) {
    const expected = expectedAssignments.find((assignment) => assignment.id === existing.id);
    if (!expected || expected.teacherId !== existing.created_by || expected.offeringId !== existing.offering_id
      || expected.title !== existing.title || expected.instructions !== existing.instructions
      || Date.parse(expected.dueAt) !== Date.parse(existing.due_at) || expected.status !== existing.status) {
      throw new Error("A synthetic assignment identity is already in use or has been manually changed; no data changes were made.");
    }
  }

  const registrationNumbers = accountSpecs.filter((spec) => spec.role === "student").map((spec) => `DEMO-S5-${spec.section!.slice(-1)}-${String(spec.index).padStart(3, "0")}`);
  const accountIds = [...markerUsers.values()].map(({ id }) => id);
  const recordQuery = client.from("student_records").select("id,user_id,registration_number,program_id,status");
  const recordResult = await (accountIds.length
    ? recordQuery.or(`registration_number.in.(${registrationNumbers.join(",")}),user_id.in.(${accountIds.join(",")})`)
    : recordQuery.in("registration_number", registrationNumbers));
  const existingRecords = await assertNoQueryError(recordResult, "synthetic student records");
  for (const record of existingRecords) {
    const owner = accountSpecs.find((spec) => markerUsers.get(spec.email)?.id === record.user_id);
    const expectedRegistration = owner && owner.role === "student" ? `DEMO-S5-${owner.section!.slice(-1)}-${String(owner.index).padStart(3, "0")}` : "";
    if (!owner || record.registration_number !== expectedRegistration || record.program_id !== program.id || record.status !== "active" || record.id !== uuidFromName(`student-record:${expectedRegistration}`)) {
      throw new Error("A generated student registration or account is already linked to a different record; no data changes were made.");
    }
  }

  // Reading these protected tables with the local service key is only used for
  // collision checks. The actual timetable/attendance writes are authenticated.
  const scheduleResult = await client.from("timetable_entries").select("id,offering_id,term_id,weekday,start_time,end_time,location,created_by,updated_by").eq("term_id", term.id).limit(1000);
  const existingSchedule = await assertNoQueryError(scheduleResult, "term timetable entries");
  if (existingSchedule.length === 1000) throw new Error("The active term timetable exceeds the safe preflight limit; no data changes were made.");

  const existingProfiles = new Map<string, { id: string; display_name: string; contact_email: string | null }>();
  const existingRoles = new Map<string, Array<{ user_id: string; role: string; scope: string | null }>>();
  if (accountIds.length) {
    const profileResult = await client.from("profiles").select("id,display_name,contact_email").in("id", accountIds);
    for (const profile of await assertNoQueryError(profileResult, "synthetic account profiles")) existingProfiles.set(profile.id, profile);
    const rolesResult = await client.from("user_roles").select("user_id,role,scope").in("user_id", accountIds);
    for (const role of await assertNoQueryError(rolesResult, "synthetic account roles")) {
      existingRoles.set(role.user_id, [...(existingRoles.get(role.user_id) ?? []), role]);
    }
  }
  return { department, program, term, today, startDate, subjectMap, offerings, existingOfferings, existingRecords, existingSchedule, existingAssignments, markerUsers, existingProfiles, existingRoles };
}

async function provisionAccounts(admin: SupabaseClient, accountSpecs: FixtureAccount[], markerUsers: Map<string, User>, profiles: Map<string, { id: string; display_name: string; contact_email: string | null }>, roles: Map<string, Array<{ user_id: string; role: string; scope: string | null }>>, syntheticPassword: string | undefined): Promise<Map<string, User>> {
  const users = new Map(markerUsers);
  for (const spec of accountSpecs) {
    let user = users.get(spec.email);
    if (!user) {
      if (!syntheticPassword) throw new Error("Set CAMPUS360_SYNTHETIC_TEST_PASSWORD in this shell before creating missing local fixture accounts.");
      const { data, error } = await admin.auth.admin.createUser({
        email: spec.email,
        password: syntheticPassword,
        email_confirm: true,
        app_metadata: { campus360_fixture: FIXTURE_MARKER },
        user_metadata: { full_name: spec.displayName },
      });
      if (error || !data.user) throw new Error("Local Auth account provisioning failed. Rerun is safe; existing accounts were not modified.");
      user = data.user;
      users.set(spec.email, user);
    }

    const existingProfile = profiles.get(user.id);
    if (existingProfile && (existingProfile.display_name !== spec.displayName || existingProfile.contact_email !== spec.email)) {
      throw new Error("A tagged synthetic profile has been changed outside the generator; refusing to overwrite it.");
    }
    if (!existingProfile) {
      const { error } = await admin.from("profiles").insert({ id: user.id, display_name: spec.displayName, contact_email: spec.email });
      if (error) throw new Error("Local profile provisioning failed. Rerun is safe; tagged Auth accounts are retained.");
      profiles.set(user.id, { id: user.id, display_name: spec.displayName, contact_email: spec.email });
    }

    const existingUserRoles = roles.get(user.id) ?? [];
    const unexpectedRole = existingUserRoles.some((role) => role.role !== spec.role || role.scope !== SYNTHETIC_SCOPE);
    if (unexpectedRole) throw new Error("A tagged synthetic account has unexpected roles; refusing to alter authorization data.");
    const hasRole = existingUserRoles.some((role) => role.role === spec.role && role.scope === SYNTHETIC_SCOPE);
    if (!hasRole) {
      const { error } = await admin.from("user_roles").insert({ user_id: user.id, role: spec.role, scope: SYNTHETIC_SCOPE });
      if (error) throw new Error("Local role provisioning failed. Rerun is safe; tagged Auth accounts are retained.");
      roles.set(user.id, [...existingUserRoles, { user_id: user.id, role: spec.role, scope: SYNTHETIC_SCOPE }]);
    }
  }
  return users;
}

function getSqlValueTuple(values: Array<string | number | null>, types: string[]): string {
  if (values.length !== types.length) throw new Error("Internal SQL tuple type mismatch.");
  return `(${values.map((value, index) => `${value === null ? "null" : typeof value === "number" ? String(value) : quote(value)}::${types[index]}`).join(",")})`;
}

function assertExpectedRows(table: string, columns: string[], rows: string[], identityColumn: string, message: string): string {
  if (!rows.length) return "";
  const aliases = columns.join(", ");
  const differences = columns
    .filter((column) => column !== identityColumn)
    .map((column) => `actual.${column} is distinct from expected.${column}`)
    .join(" or ");
  return `if exists (
      select 1 from (values ${rows.join(",\n")}) as expected(${aliases})
      left join ${table} actual on actual.${identityColumn} = expected.${identityColumn}
      where actual.${identityColumn} is null or ${differences}
    ) then raise exception ${quote(message)}; end if;`;
}

function makeDatabaseSql(args: {
  adminId: string;
  accountSpecs: FixtureAccount[];
  users: Map<string, User>;
  programId: string;
  termId: string;
  subjectMap: Map<string, { id: string; program_id: string; code: string; name: string; credits: number | null; status: string }>;
  offerings: AcademicOffering[];
  today: string;
  startDate: string;
}): { sql: string; expectedMarkCounts: Record<string, number> } {
  const { adminId, accountSpecs, users, programId, termId, subjectMap, offerings, today, startDate } = args;
  const statements: string[] = [
    "perform set_config('role', 'authenticated', true);",
    `perform set_config('request.jwt.claims', ${jsonSql({ sub: adminId, role: "authenticated" })}, true);`,
    "if not public.is_admin() then raise exception 'Synthetic generation requires the existing admin role'; end if;",
  ];

  const subjectRows = SUBJECTS.map((subject) => getSqlValueTuple([
    subjectMap.get(subject.code)!.id, programId, subject.code, subject.name, subjectMap.get(subject.code)!.credits, subjectMap.get(subject.code)!.status,
  ], ["uuid", "uuid", "text", "text", "integer", "text"]));
  statements.push(`insert into public.subjects (id, program_id, code, name, credits, status) values ${subjectRows.join(",\n")} on conflict (id) do nothing;`);
  statements.push(assertExpectedRows("public.subjects", ["id", "program_id", "code", "name", "credits", "status"], subjectRows, "id", "Synthetic subject identity differs from the preflighted academic structure."));
  statements.push(`insert into public.course_offerings (id, subject_id, term_id, section_code, status) values ${offerings.map((offering) => getSqlValueTuple([offering.id, offering.subject_id, offering.term_id, offering.section_code, "active"], ["uuid", "uuid", "uuid", "text", "text"])).join(",\n")} on conflict (id) do nothing;`);
  const offeringRows = offerings.map((offering) => getSqlValueTuple([offering.id, offering.subject_id, offering.term_id, offering.section_code, "active"], ["uuid", "uuid", "uuid", "text", "text"]));
  statements.push(assertExpectedRows("public.course_offerings", ["id", "subject_id", "term_id", "section_code", "status"], offeringRows, "id", "Synthetic offering identity differs from the preflighted academic structure."));

  const studentSpecs = accountSpecs.filter((spec) => spec.role === "student");
  const recordIds = new Map<string, string>();
  const registrationByAccount = new Map<string, string>();
  const studentRows = studentSpecs.map((spec) => {
    const userId = users.get(spec.email)!.id;
    const registration = `DEMO-S5-${spec.section!.slice(-1)}-${String(spec.index).padStart(3, "0")}`;
    const recordId = uuidFromName(`student-record:${registration}`);
    recordIds.set(spec.email, recordId);
    registrationByAccount.set(spec.email, registration);
    return getSqlValueTuple([recordId, userId, registration, programId], ["uuid", "uuid", "text", "uuid"]);
  });
  statements.push(`insert into public.student_records (id, user_id, registration_number, program_id) values ${studentRows.join(",\n")} on conflict do nothing;`);
  const verifiedStudentRows = studentSpecs.map((spec) => getSqlValueTuple([
    recordIds.get(spec.email)!, users.get(spec.email)!.id, registrationByAccount.get(spec.email)!, programId, "active",
  ], ["uuid", "uuid", "text", "uuid", "text"]));
  statements.push(assertExpectedRows("public.student_records", ["id", "user_id", "registration_number", "program_id", "status"], verifiedStudentRows, "id", "Synthetic student record conflicts with an existing row."));

  const offeringBySectionSubject = new Map(offerings.map((offering) => [`${offering.section_code}|${offering.subjectCode}`, offering]));
  const enrolmentRows: string[] = [];
  for (const spec of studentSpecs) {
    const recordId = recordIds.get(spec.email)!;
    for (const subject of SUBJECTS) {
      const offering = offeringBySectionSubject.get(`${spec.section}|${subject.code}`)!;
      enrolmentRows.push(getSqlValueTuple([uuidFromName(`enrolment:${recordId}:${offering.id}`), recordId, offering.id], ["uuid", "uuid", "uuid"]));
    }
  }
  statements.push(`insert into public.enrolments (id, student_record_id, offering_id) values ${enrolmentRows.join(",\n")} on conflict do nothing;`);
  statements.push(assertExpectedRows("public.enrolments", ["id", "student_record_id", "offering_id"], enrolmentRows, "id", "Synthetic enrolment conflicts with an existing row."));

  const teacherBySection = new Map(SECTIONS.map((section) => {
    const teacher = accountSpecs.find((spec) => spec.role === "teacher" && spec.section === section)!;
    return [section, users.get(teacher.email)!.id] as const;
  }));
  const syntheticAssignments = makeSyntheticAssignments(offerings, teacherBySection);
  const teachingAssignmentRows = offerings.map((offering) => getSqlValueTuple([
    teacherBySection.get(offering.section_code as (typeof SECTIONS)[number])!, offering.id,
  ], ["uuid", "uuid"]));
  statements.push(`insert into public.teaching_assignments (teacher_user_id, offering_id) values ${teachingAssignmentRows.join(",\n")} on conflict (teacher_user_id, offering_id) do nothing;`);
  statements.push(`if exists (select 1 from (values ${teachingAssignmentRows.join(",\n")}) expected(teacher_user_id, offering_id)
      left join public.teaching_assignments actual using (teacher_user_id, offering_id)
      where actual.offering_id is null) then raise exception 'Synthetic teaching assignment verification failed'; end if;`);

  const entries: Entry[] = [];
  for (const section of SECTIONS) {
    for (const schedule of WEEKLY_SCHEDULE) {
      const offering = offeringBySectionSubject.get(`${section}|${schedule.subjectCode}`)!;
      const room = 100 + (SECTIONS.indexOf(section) + 1) * 100 + Number(schedule.subjectCode.slice(-1));
      entries.push({
        id: uuidFromName(`timetable:${offering.id}:${schedule.weekday}:${schedule.start}`),
        offeringId: offering.id,
        teacherId: teacherBySection.get(section)!,
        section,
        weekday: schedule.weekday,
        start: schedule.start,
        end: schedule.end,
        location: `CSE S5 Room ${room}`,
      });
    }
  }
  const entryRows = entries.map((entry) => getSqlValueTuple([entry.id, entry.offeringId, termId, entry.weekday, entry.start, entry.end, entry.location, adminId, adminId], ["uuid", "uuid", "uuid", "smallint", "time", "time", "text", "uuid", "uuid"]));
  statements.push(`insert into public.timetable_entries (id, offering_id, term_id, weekday, start_time, end_time, location, created_by, updated_by) values ${entryRows.join(",\n")} on conflict (id) do nothing;`);
  statements.push(assertExpectedRows("public.timetable_entries", ["id", "offering_id", "term_id", "weekday", "start_time", "end_time", "location", "created_by", "updated_by"], entryRows, "id", "Synthetic timetable entry conflicts with an existing row."));

  const sessionsBySection = new Map<(typeof SECTIONS)[number], Array<{ id: string; entry: Entry; date: string }>>();
  const marksBySection = new Map<(typeof SECTIONS)[number], Mark[]>();
  const expectedMarkCounts: Record<string, number> = { present: 0, late: 0, absent: 0 };
  for (const section of SECTIONS) {
    const sectionIndex = SECTIONS.indexOf(section);
    const sectionEntries = entries.filter((entry) => entry.section === section);
    const sessions: Array<{ id: string; entry: Entry; date: string }> = [];
    const marks: Mark[] = [];
    for (let date = startDate; date <= today; date = addDays(date, 1)) {
      const dateUtc = new Date(`${date}T00:00:00.000Z`);
      const weekday = dateUtc.getUTCDay() === 0 ? 7 : dateUtc.getUTCDay();
      for (const entry of sectionEntries.filter((candidate) => candidate.weekday === weekday)) {
        const sessionId = uuidFromName(`attendance-session:${entry.id}:${date}`);
        sessions.push({ id: sessionId, entry, date });
        const offering = offerings.find((item) => item.id === entry.offeringId)!;
        for (const student of studentSpecs.filter((spec) => spec.section === section)) {
          const recordId = recordIds.get(student.email)!;
          const occurrenceKey = `${date}|${offering.subjectCode}|${entry.weekday}|${entry.start}`;
          const status = syntheticAttendanceStatus(sectionIndex, student.index!, occurrenceKey);
          expectedMarkCounts[status] += 1;
          marks.push({
            id: uuidFromName(`attendance-record:${sessionId}:${recordId}`),
            sessionId,
            offeringId: entry.offeringId,
            studentRecordId: recordId,
            status,
            legacyStatus: legacySyntheticAttendanceStatus(sectionIndex, student.index!, occurrenceKey),
            teacherId: entry.teacherId,
          });
        }
      }
    }
    sessionsBySection.set(section, sessions);
    marksBySection.set(section, marks);
  }

  for (const section of SECTIONS) {
    const teacherId = teacherBySection.get(section)!;
    statements.push(`perform set_config('request.jwt.claims', ${jsonSql({ sub: teacherId, role: "authenticated" })}, true);`);
    const sectionAssignments = syntheticAssignments.filter((assignment) => assignment.sectionCode === section);
    const assignmentRows = sectionAssignments.map((assignment) => {
      if (!assignment.teacherId) throw new Error(`No synthetic teacher is assigned to section ${section}.`);
      return getSqlValueTuple([
        assignment.id, assignment.offeringId, assignment.title, assignment.instructions,
        assignment.dueAt, assignment.status, assignment.teacherId,
      ], ["uuid", "uuid", "text", "text", "timestamptz", "text", "uuid"]);
    });
    statements.push(`insert into public.assignments (id, offering_id, title, instructions, due_at, status, created_by) values ${assignmentRows.join(",\n")} on conflict (id) do nothing;`);
    statements.push(assertExpectedRows("public.assignments", ["id", "offering_id", "title", "instructions", "due_at", "status", "created_by"], assignmentRows, "id", "Synthetic assignment conflicts with a different or manually changed row."));
    const sessions = sessionsBySection.get(section)!;
    const sessionRows = sessions.map(({ id, entry, date }) => getSqlValueTuple([id, entry.id, entry.offeringId, date, teacherId], ["uuid", "uuid", "uuid", "date", "uuid"]));
    if (sessionRows.length) statements.push(`insert into public.attendance_sessions (id, timetable_entry_id, offering_id, session_date, created_by) values ${sessionRows.join(",\n")} on conflict (id) do nothing;`);
    statements.push(assertExpectedRows("public.attendance_sessions", ["id", "timetable_entry_id", "offering_id", "session_date", "created_by"], sessionRows, "id", "Synthetic attendance session conflicts with an existing row."));
    const marks = marksBySection.get(section)!;
    const markRows = marks.map((mark) => getSqlValueTuple([mark.id, mark.sessionId, mark.offeringId, mark.studentRecordId, mark.status, mark.teacherId], ["uuid", "uuid", "uuid", "uuid", "text", "uuid"]));
    if (markRows.length) statements.push(`insert into public.attendance_records (id, session_id, offering_id, student_record_id, status, marked_by) values ${markRows.join(",\n")} on conflict (id) do nothing;`);
    const legacyMarkRows = marks.map((mark) => getSqlValueTuple([mark.id, mark.sessionId, mark.offeringId, mark.studentRecordId, mark.legacyStatus, mark.teacherId], ["uuid", "uuid", "uuid", "uuid", "text", "uuid"]));
    if (markRows.length) statements.push(`update public.attendance_records actual set status = expected.status
      from (values ${markRows.join(",\n")}) expected(id, session_id, offering_id, student_record_id, status, marked_by)
      join (values ${legacyMarkRows.join(",\n")}) legacy(id, session_id, offering_id, student_record_id, status, marked_by) using (id)
      where actual.id = expected.id and actual.session_id = expected.session_id and actual.offering_id = expected.offering_id
        and actual.student_record_id = expected.student_record_id and actual.marked_by = expected.marked_by
        and actual.session_id = legacy.session_id and actual.offering_id = legacy.offering_id
        and actual.student_record_id = legacy.student_record_id and actual.marked_by = legacy.marked_by
        and actual.status = legacy.status and actual.created_at = actual.updated_at
        and actual.status is distinct from expected.status;`);
    statements.push(assertExpectedRows("public.attendance_records", ["id", "session_id", "offering_id", "student_record_id", "status", "marked_by"], markRows, "id", "Synthetic attendance mark conflicts with an existing row."));
  }

  statements.push(`perform set_config('request.jwt.claims', ${jsonSql({ sub: adminId, role: "authenticated" })}, true);`);
  statements.push(`if (select count(*) from public.student_records where registration_number like 'DEMO-S5-%') <> 120 then raise exception 'Synthetic student record count does not match the expected 120'; end if;`);
  statements.push(`if (select count(*) from public.course_offerings where term_id = ${quote(termId)} and section_code in ('S5-A','S5-B','S5-C','S5-D') and subject_id in (${SUBJECTS.map((subject) => quote(subjectMap.get(subject.code)!.id)).join(",")})) <> 24 then raise exception 'Synthetic offering count does not match the expected 24'; end if;`);
  statements.push(`if (select count(*) from public.timetable_entries where term_id = ${quote(termId)} and id in (${entries.map((entry) => quote(entry.id)).join(",")})) <> 72 then raise exception 'Synthetic timetable count does not match the expected 72'; end if;`);
  statements.push(`if (select count(*) from public.assignments where id in (${syntheticAssignments.map(({ id }) => quote(id)).join(",")})) <> ${syntheticAssignments.length} then raise exception 'Synthetic assignment count does not match the expected ${syntheticAssignments.length}'; end if;`);
  statements.push(`if (select count(*) from public.attendance_sessions where id in (${[...sessionsBySection.values()].flat().map(({ id }) => quote(id)).join(",")})) <> ${[...sessionsBySection.values()].flat().length} then raise exception 'Synthetic attendance session count verification failed'; end if;`);
  statements.push(`if (select count(*) from public.attendance_records where id in (${[...marksBySection.values()].flat().map(({ id }) => quote(id)).join(",")})) <> ${Object.values(expectedMarkCounts).reduce((sum, count) => sum + count, 0)} then raise exception 'Synthetic attendance mark count verification failed'; end if;`);
  return { sql: `DO $campus360$ BEGIN\n${statements.join("\n\n")}\nEND $campus360$;`, expectedMarkCounts };
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const adminPassword = process.env.CAMPUS360_ADMIN_PASSWORD;
  const syntheticPassword = process.env.CAMPUS360_SYNTHETIC_TEST_PASSWORD;
  if (!url || !serviceKey || !publishableKey) throw new Error("Missing required local Supabase environment variables; no data changes were made.");
  if (!adminPassword) throw new Error("Set CAMPUS360_ADMIN_PASSWORD in this shell to authenticate the existing local admin; no data changes were made.");
  await verifyLocalTarget(url);

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const accounts = makeAccounts();
  const authUsers = await listAllAuthUsers(admin);
  const snapshot = await preflight(admin, accounts, authUsers);
  if (accounts.some((spec) => !snapshot.markerUsers.has(spec.email)) && !syntheticPassword) {
    throw new Error("Set CAMPUS360_SYNTHETIC_TEST_PASSWORD in this shell before creating missing local fixture accounts.");
  }

  const existingAdmin = authUsers.find((user) => user.email?.toLowerCase() === ROLE_ADMIN_EMAIL);
  if (!existingAdmin) throw new Error("The existing local admin fixture is unavailable; no data changes were made.");
  const adminRole = snapshot.existingRoles.get(existingAdmin.id) ?? [];
  if (!adminRole.some((role) => role.role === "admin")) {
    const { data: roleData, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", existingAdmin.id).eq("role", "admin").limit(1);
    if (roleError || !roleData?.length) throw new Error("The existing local admin role could not be verified; no data changes were made.");
  }
  const adminUserClient = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: adminLogin, error: adminLoginError } = await adminUserClient.auth.signInWithPassword({ email: ROLE_ADMIN_EMAIL, password: adminPassword });
  if (adminLoginError || !adminLogin.user || adminLogin.user.id !== existingAdmin.id) {
    throw new Error("The existing local admin could not authenticate with the configured demo account; no data changes were made.");
  }

  // Ensure Phase 2C's tables are visible through the configured local API before
  // creating accounts. A missing migration fails here without modifying data.
  const migrationProbe = await admin.from("attendance_records").select("id").limit(0);
  if (migrationProbe.error) throw new Error("The required timetable/attendance schema is unavailable through the local Supabase API; no accounts were created.");

  const users = await provisionAccounts(admin, accounts, snapshot.markerUsers, snapshot.existingProfiles, snapshot.existingRoles, syntheticPassword);
  const verifiedUsers = new Map(users);
  for (const spec of accounts) {
    const user = verifiedUsers.get(spec.email);
    if (!user || user.app_metadata?.campus360_fixture !== FIXTURE_MARKER) throw new Error("A synthetic Auth account lost its ownership marker; refusing database writes.");
  }

  const sql = makeDatabaseSql({
    adminId: adminLogin.user.id,
    accountSpecs: accounts,
    users: verifiedUsers,
    programId: snapshot.program.id,
    termId: snapshot.term.id,
    subjectMap: snapshot.subjectMap,
    offerings: snapshot.offerings,
    today: snapshot.today,
    startDate: snapshot.startDate,
  });

  const generatedFolder = path.join(ROOT, "supabase", ".temp");
  await mkdir(generatedFolder, { recursive: true });
  const sqlFile = path.join(generatedFolder, `synthetic-s5-${randomUUID()}.sql`);
  let transactionCompleted = false;
  try {
    await writeFile(sqlFile, sql.sql, { encoding: "utf8", flag: "wx" });
    // Final target guard immediately before the only SQL-writing operation.
    await verifyLocalTarget(url);
    runLocalSupabase(["db", "query", "--local", "--file", sqlFile]);
    transactionCompleted = true;
  } finally {
    if (transactionCompleted) await rm(sqlFile, { force: true });
    else console.error("The failed transaction's generated SQL is retained under ignored supabase/.temp for safe diagnosis.");
  }

  const createdStudents = accounts.filter((spec) => spec.role === "student" && !snapshot.markerUsers.has(spec.email)).length;
  const createdTeachers = accounts.filter((spec) => spec.role === "teacher" && !snapshot.markerUsers.has(spec.email)).length;
  const rosterCounts = await Promise.all(SECTIONS.map(async (section) => {
    const { count, error } = await admin.from("student_records").select("id", { count: "exact", head: true }).like("registration_number", `DEMO-S5-${section.slice(-1)}-%`);
    if (error) throw new Error("Post-generation count verification failed.");
    return count ?? 0;
  }));
  console.log(`Local synthetic fixture complete for ${snapshot.startDate} through ${snapshot.today}.`);
  console.log(`Auth users: ${createdStudents + createdTeachers} created (${createdStudents} students, ${createdTeachers} teachers); ${accounts.length - createdStudents - createdTeachers} generator-owned accounts reused.`);
  console.log(`Student records: 120; sections: ${SECTIONS.map((section, index) => `${section}=${rosterCounts[index]}`).join(", ")}; offerings: 24; enrolments: 720; timetable entries: 72; assignments: 72 (48 published, 24 draft).`);
  console.log(`Attendance sessions: ${[...WEEKLY_SCHEDULE].length * 4 * 8} planned per complete 8-week term window; marks by status: ${JSON.stringify(sql.expectedMarkCounts)}.`);
  console.log("Existing seed accounts, unrelated records, and generator-owned rows on repeat runs are preserved; the SQL phase commits atomically.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Synthetic fixture generation failed.");
    process.exitCode = 1;
  });
}
