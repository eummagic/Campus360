// Seeds Sidharth's original demo data into MongoDB:
//   1. the 8 original accounts + Section "A" academics (was scripts/seed-users.ts)
//   2. the 120-student / 4-teacher "S5" synthetic campus (was scripts/seed-synthetic-campus.ts)
// Idempotent: every row has a deterministic _id or natural key and is written with
// $setOnInsert, so re-running never overwrites or duplicates data.
// Usage: pnpm db:mongo:seed-demo
import { createHash } from "node:crypto";
import { ObjectId, type AnyBulkWriteOperation, type Document } from "mongodb";
import { getDb, getMongoClient } from "../../src/lib/mongo/connection";
import {
  makeLegacyAssignments,
  makeLegacyAttendanceFixtures,
  makeLegacyTimetableEntries,
  type LegacyOffering,
} from "../../src/lib/legacy-demo-fixtures";
import { ensureAuthUsers, LEGACY_USERS } from "./seed-auth-users";
import {
  SECTIONS,
  SUBJECTS,
  SYNTHETIC_SCOPE,
  WEEKLY_SCHEDULE,
  makeAccounts,
  makeSyntheticAssignments,
  registrationFor,
  roomFor,
  stableSyntheticUuid,
  syntheticAttendanceStatus,
  type AcademicOffering,
} from "./synthetic-fixture";

const TERM = { name: "2026 Fall", startsOn: "2026-08-01", endsOn: "2026-12-15" } as const;
const SYNTHETIC_PASSWORD = process.env.CAMPUS360_SYNTHETIC_TEST_PASSWORD || "password123";

/** Deterministic ObjectId from any stable key (e.g. the old fixture UUID). */
function oidFor(key: string): ObjectId {
  return new ObjectId(createHash("sha1").update(`campus360-mongo:${key}`).digest("hex").slice(0, 24));
}

function minutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function todayInKolkata(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

/** Upsert by natural key; returns the existing or new _id. Never overwrites. */
async function ensure(collection: string, key: Document, values: Document): Promise<ObjectId> {
  const now = new Date();
  const doc = await getDb().collection(collection).findOneAndUpdate(
    key,
    { $setOnInsert: { ...key, ...values, ...(collection === "teaching_assignments" || collection === "enrolments" ? {} : { created_at: now, updated_at: now }) } },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw new Error(`Could not ensure ${collection} ${JSON.stringify(key)}`);
  return doc._id as ObjectId;
}

/** Insert-if-missing by _id, in batches. */
async function insertMissing(collection: string, docs: Document[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < docs.length; i += 1000) {
    const ops: AnyBulkWriteOperation[] = docs.slice(i, i + 1000).map((doc) => ({
      updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true },
    }));
    const result = await getDb().collection(collection).bulkWrite(ops, { ordered: false });
    inserted += result.upsertedCount;
  }
  return inserted;
}

async function seedStructure() {
  const department = await ensure("departments", { code: "CSE" }, { name: "Computer Science", status: "active" });
  const program = await ensure("programs", { department_id: department, code: "BTECH_CSE" }, { name: "B.Tech Computer Science", status: "active" });
  const term = await ensure("academic_terms", { name: TERM.name }, { starts_on: TERM.startsOn, ends_on: TERM.endsOn, status: "active" });
  const subjects = new Map<string, ObjectId>();
  for (const subject of SUBJECTS) {
    subjects.set(subject.code, await ensure("subjects", { program_id: program, code: subject.code }, { name: subject.name, credits: subject.credits, status: "active" }));
  }
  return { program, term, subjects };
}

async function seedLegacy(ids: Map<string, ObjectId>, structure: Awaited<ReturnType<typeof seedStructure>>, today: string) {
  const db = getDb();
  const teacherId = ids.get("teacher1@example.com")!;
  const adminId = ids.get("admin1@example.com")!;
  const offerings: LegacyOffering[] = [];
  for (const code of ["CS101", "CS102"]) {
    const offering = await ensure("course_offerings", { subject_id: structure.subjects.get(code)!, term_id: structure.term, section_code: "A" }, { status: "active" });
    offerings.push({ id: offering.toHexString(), subjectCode: code });
    await ensure("teaching_assignments", { teacher_user_id: teacherId, offering_id: offering }, { assigned_at: new Date(), assigned_by: adminId });
  }
  const students = [
    { email: "student1@example.com", registration: "CSE2023001", index: 1 },
    { email: "student2@example.com", registration: "CSE2023002", index: 2 },
    { email: "adminstudent1@example.com", registration: "CSE2023099", index: 3 },
  ];
  const records: Array<{ id: string; index: number }> = [];
  for (const student of students) {
    const record = await ensure("student_records", { user_id: ids.get(student.email)! }, { registration_number: student.registration, program_id: structure.program, status: "active" });
    records.push({ id: record.toHexString(), index: student.index });
    for (const offering of offerings) {
      await ensure("enrolments", { student_record_id: record, offering_id: new ObjectId(offering.id) }, { enrolled_at: new Date() });
    }
  }

  const entries = makeLegacyTimetableEntries(offerings, structure.term.toHexString(), adminId.toHexString());
  const entryIds = new Map(entries.map((e) => [e.id, oidFor(e.id)]));
  const now = new Date();
  await insertMissing("timetable_entries", entries.map((e) => ({
    _id: entryIds.get(e.id)!,
    offering_id: new ObjectId(e.offering_id),
    term_id: structure.term,
    weekday: e.weekday,
    start_minute: minutes(e.start_time),
    end_minute: minutes(e.end_time),
    location: e.location,
    location_key: e.location.toLowerCase(),
    created_by: adminId,
    updated_by: adminId,
    created_at: now,
    updated_at: now,
  })));

  const attendance = makeLegacyAttendanceFixtures({ entries, students: records, teacherId: teacherId.toHexString(), today, termStartsOn: TERM.startsOn, termEndsOn: TERM.endsOn });
  await insertMissing("attendance_sessions", attendance.sessions.map((s) => ({
    _id: oidFor(s.id),
    timetable_entry_id: entryIds.get(s.timetable_entry_id)!,
    offering_id: new ObjectId(s.offering_id),
    session_date: s.session_date,
    created_by: teacherId,
    created_at: now,
  })));
  const marks = await insertMissing("attendance_records", attendance.records.map((r) => ({
    _id: oidFor(r.id),
    session_id: oidFor(r.session_id),
    offering_id: new ObjectId(r.offering_id),
    student_record_id: new ObjectId(r.student_record_id),
    status: r.status,
    marked_by: teacherId,
    created_at: now,
    updated_at: now,
  })));
  const assignments = makeLegacyAssignments({ offerings, teacherId: teacherId.toHexString(), termEndsOn: TERM.endsOn });
  await insertMissing("assignments", assignments.map((a) => ({
    _id: oidFor(a.id),
    offering_id: new ObjectId(a.offering_id),
    title: a.title,
    instructions: a.instructions,
    due_at: new Date(a.due_at),
    status: a.status,
    created_by: teacherId,
    created_at: now,
    updated_at: now,
  })));
  await db.collection<{ _id: string; version: number; updated_at: Date }>("locks").updateOne({ _id: "timetable" }, { $setOnInsert: { version: 0, updated_at: now } }, { upsert: true });
  console.log(`Original demo: ${offerings.length} offerings, ${entries.length} timetable entries, ${attendance.sessions.length} sessions, ${attendance.records.length} marks (${marks} new), ${assignments.length} assignments.`);
}

async function seedSynthetic(structure: Awaited<ReturnType<typeof seedStructure>>, today: string) {
  const accounts = makeAccounts();
  const ids = await ensureAuthUsers(accounts.map((a) => ({
    email: a.email,
    password: SYNTHETIC_PASSWORD,
    displayName: a.displayName,
    roles: [{ role: a.role, scope: SYNTHETIC_SCOPE }],
  })));
  const teacherBySection = new Map(SECTIONS.map((section) => [section, ids.get(accounts.find((a) => a.role === "teacher" && a.section === section)!.email)!]));

  const offerings: AcademicOffering[] = [];
  for (const section of SECTIONS) {
    for (const subject of SUBJECTS) {
      const id = await ensure("course_offerings", { subject_id: structure.subjects.get(subject.code)!, term_id: structure.term, section_code: section }, { status: "active" });
      offerings.push({ id: id.toHexString(), subject_id: structure.subjects.get(subject.code)!.toHexString(), term_id: structure.term.toHexString(), section_code: section, subjectCode: subject.code });
      await ensure("teaching_assignments", { teacher_user_id: teacherBySection.get(section)!, offering_id: id }, { assigned_at: new Date(), assigned_by: null });
    }
  }
  const offeringBy = new Map(offerings.map((o) => [`${o.section_code}|${o.subjectCode}`, o]));

  const recordByEmail = new Map<string, ObjectId>();
  for (const account of accounts.filter((a) => a.role === "student")) {
    const record = await ensure("student_records", { user_id: ids.get(account.email)! }, { registration_number: registrationFor(account), program_id: structure.program, status: "active" });
    recordByEmail.set(account.email, record);
  }
  const enrolmentOps: Document[] = [];
  for (const account of accounts.filter((a) => a.role === "student")) {
    const record = recordByEmail.get(account.email)!;
    for (const subject of SUBJECTS) {
      const offering = offeringBy.get(`${account.section}|${subject.code}`)!;
      enrolmentOps.push({ student_record_id: record, offering_id: new ObjectId(offering.id), enrolled_at: new Date() });
    }
  }
  // Natural-key unique index (student_record_id, offering_id) also protects against duplicates.
  for (const doc of enrolmentOps) {
    await getDb().collection("enrolments").updateOne(
      { student_record_id: doc.student_record_id, offering_id: doc.offering_id },
      { $setOnInsert: { student_record_id: doc.student_record_id, offering_id: doc.offering_id, enrolled_at: doc.enrolled_at } },
      { upsert: true },
    );
  }

  const adminId = (await getDb().collection("user").findOne({ email: "admin1@example.com" }))?._id as ObjectId;
  const now = new Date();
  const entries = SECTIONS.flatMap((section) => WEEKLY_SCHEDULE.map((slot) => {
    const offering = offeringBy.get(`${section}|${slot.subjectCode}`)!;
    const location = roomFor(section, slot.subjectCode);
    return {
      key: stableSyntheticUuid(`timetable:${offering.id}:${slot.weekday}:${slot.start}`),
      section,
      offering,
      slot,
      doc: {
        offering_id: new ObjectId(offering.id),
        term_id: structure.term,
        weekday: slot.weekday,
        start_minute: minutes(slot.start),
        end_minute: minutes(slot.end),
        location,
        location_key: location.toLowerCase(),
        created_by: adminId,
        updated_by: adminId,
        created_at: now,
        updated_at: now,
      },
    };
  }));
  await insertMissing("timetable_entries", entries.map((e) => ({ _id: oidFor(e.key), ...e.doc })));

  const startDate = addDays(today, -55);
  const sessions: Document[] = [];
  const marks: Document[] = [];
  const students = accounts.filter((a) => a.role === "student");
  for (const entry of entries) {
    const sectionIndex = SECTIONS.indexOf(entry.section);
    const entryId = oidFor(entry.key);
    const teacherId = teacherBySection.get(entry.section)!;
    for (let date = startDate < TERM.startsOn ? TERM.startsOn : startDate; date <= today && date <= TERM.endsOn; date = addDays(date, 1)) {
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay() || 7;
      if (weekday !== entry.slot.weekday) continue;
      const sessionId = oidFor(`attendance-session:${entry.key}:${date}`);
      sessions.push({ _id: sessionId, timetable_entry_id: entryId, offering_id: new ObjectId(entry.offering.id), session_date: date, created_by: teacherId, created_at: now });
      for (const student of students.filter((s) => s.section === entry.section)) {
        const record = recordByEmail.get(student.email)!;
        const occurrenceKey = `${date}|${entry.offering.subjectCode}|${entry.slot.weekday}|${entry.slot.start}`;
        marks.push({
          _id: oidFor(`attendance-record:${sessionId.toHexString()}:${record.toHexString()}`),
          session_id: sessionId,
          offering_id: new ObjectId(entry.offering.id),
          student_record_id: record,
          status: syntheticAttendanceStatus(sectionIndex, student.index!, occurrenceKey),
          marked_by: teacherId,
          created_at: now,
          updated_at: now,
        });
      }
    }
  }
  await insertMissing("attendance_sessions", sessions);
  const newMarks = await insertMissing("attendance_records", marks);

  const assignments = makeSyntheticAssignments(offerings, new Map([...teacherBySection].map(([s, id]) => [s, id.toHexString()])));
  await insertMissing("assignments", assignments.map((a) => ({
    _id: oidFor(a.id),
    offering_id: new ObjectId(a.offeringId),
    title: a.title,
    instructions: a.instructions,
    due_at: new Date(a.dueAt),
    status: a.status,
    created_by: new ObjectId(a.teacherId!),
    created_at: now,
    updated_at: now,
  })));
  console.log(`Synthetic S5: ${students.length} students, ${SECTIONS.length} teachers, ${offerings.length} offerings, ${entries.length} timetable entries, ${sessions.length} sessions, ${marks.length} marks (${newMarks} new), ${assignments.length} assignments (${startDate} → ${today}).`);
}

async function main() {
  const today = todayInKolkata();
  try {
    const ids = await ensureAuthUsers(LEGACY_USERS);
    const structure = await seedStructure();
    await seedLegacy(ids, structure, today);
    await seedSynthetic(structure, today);
    console.log("Demo seed complete.");
  } finally {
    await getMongoClient().close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
