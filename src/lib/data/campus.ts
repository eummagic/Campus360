import "server-only";
import { ObjectId, type Document } from "mongodb";
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  attempt,
  audit,
  db,
  displayNames,
  enrolledInOffering,
  hex,
  inTransaction,
  iso,
  isoWeekday,
  loadOfferings,
  minutesToTime,
  oid,
  readableOfferingIds,
  teachesOffering,
  timeToMinuteValue,
  type Access,
} from "@/lib/data/core";
import { buildDirectoryRows } from "@/lib/academics";

type Status = "present" | "absent" | "late";

// ---------------------------------------------------------------------------
// Terms, offerings, counts
// ---------------------------------------------------------------------------
export function listActiveTerms() {
  return attempt("listActiveTerms", [] as Array<{ id: string; name: string; starts_on: string | null; ends_on: string | null }>, async () =>
    (await db().collection("academic_terms").find({ status: "active" }).sort({ starts_on: 1 }).toArray()).map((t) => ({
      id: hex(t._id as ObjectId),
      name: String(t.name),
      starts_on: (t.starts_on as string | null) ?? null,
      ends_on: (t.ends_on as string | null) ?? null,
    })));
}

export function countEnrolmentsByOffering(offeringIds: readonly string[]) {
  return attempt("countEnrolmentsByOffering", {} as Record<string, number>, async () => {
    const ids = offeringIds.flatMap((value) => oid(value) ?? []);
    if (!ids.length) return {};
    const rows = await db().collection("enrolments").aggregate<{ _id: ObjectId; count: number }>([
      { $match: { offering_id: { $in: ids } } },
      { $group: { _id: "$offering_id", count: { $sum: 1 } } },
    ]).toArray();
    return Object.fromEntries(rows.map((row) => [hex(row._id), row.count]));
  });
}

export function adminCounts(access: Access) {
  return attempt("adminCounts", null as null | Record<string, number>, async () => {
    if (!access.isAdmin) throw new AccessDeniedError("Admin only.");
    const database = db();
    const [departments, programs, subjects, offerings, teaching, records, active, inactive, graduated] = await Promise.all([
      database.collection("departments").countDocuments(),
      database.collection("programs").countDocuments(),
      database.collection("subjects").countDocuments(),
      database.collection("course_offerings").countDocuments(),
      database.collection("teaching_assignments").countDocuments(),
      database.collection("student_records").countDocuments(),
      database.collection("student_records").countDocuments({ status: "active" }),
      database.collection("student_records").countDocuments({ status: "inactive" }),
      database.collection("student_records").countDocuments({ status: "graduated" }),
    ]);
    return { departments, programs, subjects, offerings, teaching, records, active, inactive, graduated };
  });
}

/** Admin academic-structure page (admin only). */
export function adminAcademicStructure(access: Access) {
  return attempt("adminAcademicStructure", null as null | {
    departments: Array<{ id: string; code: string; name: string; status: string }>;
    programs: Array<{ id: string; code: string; name: string; status: string; department: { code: string } | null }>;
    terms: Array<{ id: string; name: string; status: string; starts_on: string | null; ends_on: string | null }>;
    subjects: Array<{ id: string; code: string; name: string; credits: number | null; status: string; program: { code: string } | null }>;
    offerings: Array<{ id: string; section_code: string; status: string; term: { name: string }; subject: { code: string; name: string } }>;
    assignments: Array<{ id: string; teacher_user_id: string; offering: { section_code: string; subject: { code: string } } }>;
    teacherProfiles: Array<{ id: string; display_name: string }>;
  }, async () => {
    if (!access.isAdmin) throw new AccessDeniedError("Admin only.");
    const database = db();
    const [departments, programs, terms, subjects, offeringRows, teaching] = await Promise.all([
      database.collection("departments").find().sort({ code: 1 }).toArray(),
      database.collection("programs").find().sort({ code: 1 }).toArray(),
      database.collection("academic_terms").find().sort({ name: 1 }).toArray(),
      database.collection("subjects").find().sort({ code: 1 }).toArray(),
      database.collection("course_offerings").find().sort({ section_code: 1 }).toArray(),
      database.collection("teaching_assignments").find().toArray(),
    ]);
    const offerings = await loadOfferings(offeringRows.map((o) => o._id as ObjectId));
    const departmentById = new Map(departments.map((d) => [hex(d._id as ObjectId), d]));
    const programById = new Map(programs.map((p) => [hex(p._id as ObjectId), p]));
    const names = await displayNames(teaching.map((t) => t.teacher_user_id as ObjectId));
    return {
      departments: departments.map((d) => ({ id: hex(d._id as ObjectId), code: String(d.code), name: String(d.name), status: String(d.status) })),
      programs: programs.map((p) => {
        const department = departmentById.get(hex(p.department_id as ObjectId));
        return { id: hex(p._id as ObjectId), code: String(p.code), name: String(p.name), status: String(p.status), department: department ? { code: String(department.code) } : null };
      }),
      terms: terms.map((t) => ({ id: hex(t._id as ObjectId), name: String(t.name), status: String(t.status), starts_on: (t.starts_on as string | null) ?? null, ends_on: (t.ends_on as string | null) ?? null })),
      subjects: subjects.map((s) => {
        const program = programById.get(hex(s.program_id as ObjectId));
        return { id: hex(s._id as ObjectId), code: String(s.code), name: String(s.name), credits: (s.credits as number | null) ?? null, status: String(s.status), program: program ? { code: String(program.code) } : null };
      }),
      offerings: offeringRows.flatMap((row) => {
        const o = offerings.get(hex(row._id as ObjectId));
        return o ? [{ id: o.id, section_code: o.section_code, status: o.status, term: { name: o.term.name }, subject: { code: o.subject.code, name: o.subject.name } }] : [];
      }),
      assignments: teaching.flatMap((t) => {
        const o = offerings.get(hex(t.offering_id as ObjectId));
        return o ? [{ id: hex(t._id as ObjectId), teacher_user_id: hex(t.teacher_user_id as ObjectId), offering: { section_code: o.section_code, subject: { code: o.subject.code } } }] : [];
      }),
      teacherProfiles: [...names.entries()].map(([id, display_name]) => ({ id, display_name })),
    };
  });
}

export function listPrograms() {
  return attempt("listPrograms", [] as Array<{ id: string; code: string; name: string }>, async () =>
    (await db().collection("programs").find().sort({ code: 1 }).toArray()).map((p) => ({ id: hex(p._id as ObjectId), code: String(p.code), name: String(p.name) })));
}

/** Admin only. Returns false when the user is not an eligible unlinked student. */
export async function createStudentRecord(access: Access, input: { userId: string; registrationNumber: string; programId: string }): Promise<{ ok: boolean }> {
  if (!access.isAdmin) return { ok: false };
  const userId = oid(input.userId);
  const programId = oid(input.programId);
  if (!userId || !programId) return { ok: false };
  try {
    await inTransaction(async (session) => {
      const database = db();
      const [isStudent, existing, program] = await Promise.all([
        database.collection("user_roles").findOne({ user_id: userId, role: "student" }, { session }),
        database.collection("student_records").findOne({ user_id: userId }, { session }),
        database.collection("programs").findOne({ _id: programId }, { session }),
      ]);
      if (!isStudent || existing || !program) throw new ValidationError("Not eligible.");
      const now = new Date();
      const inserted = await database.collection("student_records").insertOne(
        { user_id: userId, registration_number: input.registrationNumber, program_id: programId, status: "active", created_at: now, updated_at: now },
        { session },
      );
      await audit(session, access.userId, "student_records.created", "student_records", inserted.insertedId);
    });
    return { ok: true };
  } catch (error) {
    console.error("[data] createStudentRecord failed", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export function getOwnProfile(access: Access) {
  return attempt("getOwnProfile", null as null | { id: string; display_name: string; contact_email: string | null; created_at: string; updated_at: string }, async () => {
    const p = await db().collection("profiles").findOne({ _id: access.userId });
    return p ? { id: hex(p._id as ObjectId), display_name: String(p.display_name), contact_email: (p.contact_email as string | null) ?? null, created_at: iso(p.created_at), updated_at: iso(p.updated_at) } : null;
  });
}

export async function updateMyDisplayName(access: Access, displayName: string): Promise<{ ok: boolean }> {
  const value = displayName.trim();
  if (!value || value.length > 120) return { ok: false };
  try {
    await inTransaction(async (session) => {
      const result = await db().collection("profiles").updateOne({ _id: access.userId }, { $set: { display_name: value, updated_at: new Date() } }, { session });
      if (result.matchedCount !== 1) throw new ValidationError("Profile not found.");
      await audit(session, access.userId, "profile.display_name.updated", "profile", access.userId, { display_name: value });
    });
    return { ok: true };
  } catch (error) {
    console.error("[data] updateMyDisplayName failed", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------
export type ScheduleView = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  offering: {
    id: string;
    section_code: string;
    subject: { code: string; name: string };
    term: { name: string; status: string; starts_on: string | null; ends_on: string | null };
  };
};

/** Old RLS: admin all; teacher assigned offerings; student enrolled offerings. */
export function listVisibleSchedule(access: Access, options: { offeringIds?: readonly string[] } = {}) {
  return attempt("listVisibleSchedule", [] as ScheduleView[], async () => {
    const readable = readableOfferingIds(access);
    const filter: Document = {};
    if (readable !== null) filter.offering_id = { $in: readable };
    if (options.offeringIds) {
      const requested = options.offeringIds.flatMap((value) => oid(value) ?? []);
      const allowed = readable === null ? requested : requested.filter((id) => readable.some((r) => r.equals(id)));
      filter.offering_id = { $in: allowed };
    }
    const rows = await db().collection("timetable_entries").find(filter).sort({ weekday: 1, start_minute: 1, _id: 1 }).limit(5000).toArray();
    const offerings = await loadOfferings(rows.map((r) => r.offering_id as ObjectId));
    return rows.flatMap((row) => {
      const o = offerings.get(hex(row.offering_id as ObjectId));
      if (!o) return [];
      return [{
        id: hex(row._id as ObjectId),
        weekday: Number(row.weekday),
        start_time: minutesToTime(Number(row.start_minute)),
        end_time: minutesToTime(Number(row.end_minute)),
        location: (row.location as string | null) ?? null,
        offering: {
          id: o.id,
          section_code: o.section_code,
          subject: { code: o.subject.code, name: o.subject.name },
          term: { name: o.term.name, status: o.term.status, starts_on: o.term.starts_on, ends_on: o.term.ends_on },
        },
      }];
    });
  });
}

export function listActiveOfferingsForAdmin(access: Access) {
  return attempt("listActiveOfferingsForAdmin", [] as Array<{ id: string; section_code: string; term: { name: string; status: string }; subject: { code: string; name: string } }>, async () => {
    if (!access.isAdmin) return [];
    const activeTerms = await db().collection("academic_terms").find({ status: "active" }, { projection: { _id: 1 } }).toArray();
    const rows = await db().collection("course_offerings")
      .find({ status: "active", term_id: { $in: activeTerms.map((t) => t._id as ObjectId) } })
      .sort({ section_code: 1 }).toArray();
    const offerings = await loadOfferings(rows.map((r) => r._id as ObjectId));
    return rows.flatMap((row) => {
      const o = offerings.get(hex(row._id as ObjectId));
      return o ? [{ id: o.id, section_code: o.section_code, term: { name: o.term.name, status: o.term.status }, subject: { code: o.subject.code, name: o.subject.name } }] : [];
    });
  });
}

const TIMETABLE_LOCK = "timetable";

/**
 * Serializes all timetable / teacher-assignment conflict checks: every writer
 * increments the same lock document inside its transaction, so two concurrent
 * transactions write-conflict and one retries after the other commits
 * (replaces pg_advisory_xact_lock).
 */
async function takeTimetableLock(session: import("mongodb").ClientSession) {
  await db().collection<{ _id: string; version: number; updated_at: Date }>("locks").updateOne(
    { _id: TIMETABLE_LOCK },
    { $inc: { version: 1 }, $set: { updated_at: new Date() } },
    { upsert: true, session },
  );
}

export async function createTimetableEntry(
  access: Access,
  input: { offeringId: string; weekday: number; startTime: string; endTime: string; location: string | null },
): Promise<{ ok: true } | { ok: false; reason: "offering" | "conflict" | "error" }> {
  if (!access.isAdmin) return { ok: false, reason: "error" };
  const offeringId = oid(input.offeringId);
  if (!offeringId) return { ok: false, reason: "offering" };
  const start = timeToMinuteValue(input.startTime);
  const end = timeToMinuteValue(input.endTime);
  if (!(end > start)) return { ok: false, reason: "error" };
  const location = input.location?.trim() || null;
  const locationKey = location ? location.toLowerCase() : null;
  try {
    await inTransaction(async (session) => {
      const database = db();
      await takeTimetableLock(session);
      const offering = await database.collection("course_offerings").findOne({ _id: offeringId, status: "active" }, { session });
      const term = offering ? await database.collection("academic_terms").findOne({ _id: offering.term_id, status: "active" }, { session }) : null;
      if (!offering || !term) throw new ValidationError("offering");
      const overlapping = await database.collection("timetable_entries").find({
        term_id: offering.term_id,
        weekday: input.weekday,
        start_minute: { $lt: end },
        end_minute: { $gt: start },
      }, { session }).toArray();
      const teachers = await database.collection("teaching_assignments").find({ offering_id: offeringId }, { session }).toArray();
      const teacherIds = teachers.map((t) => t.teacher_user_id as ObjectId);
      const otherOfferingIds = overlapping.map((o) => o.offering_id as ObjectId);
      const teacherClash = teacherIds.length && otherOfferingIds.length
        ? await database.collection("teaching_assignments").findOne({ offering_id: { $in: otherOfferingIds }, teacher_user_id: { $in: teacherIds } }, { session })
        : null;
      const clash = overlapping.some((other) =>
        (other.offering_id as ObjectId).equals(offeringId) || (locationKey !== null && other.location_key === locationKey)) || Boolean(teacherClash);
      if (clash) throw new ConflictError("conflict");
      const now = new Date();
      const inserted = await database.collection("timetable_entries").insertOne({
        offering_id: offeringId,
        term_id: offering.term_id,
        weekday: input.weekday,
        start_minute: start,
        end_minute: end,
        location,
        location_key: locationKey,
        created_by: access.userId,
        updated_by: access.userId,
        created_at: now,
        updated_at: now,
      }, { session });
      await audit(session, access.userId, "timetable_entries.created", "timetable_entries", inserted.insertedId);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ConflictError) return { ok: false, reason: "conflict" };
    if (error instanceof ValidationError) return { ok: false, reason: "offering" };
    console.error("[data] createTimetableEntry failed", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "error" };
  }
}

export async function deleteTimetableEntry(access: Access, entryId: string): Promise<"removed" | "attendance" | "error"> {
  if (!access.isAdmin) return "error";
  const id = oid(entryId);
  if (!id) return "error";
  try {
    return await inTransaction(async (session) => {
      const database = db();
      await takeTimetableLock(session);
      const sessions = await database.collection("attendance_sessions").countDocuments({ timetable_entry_id: id }, { session });
      if (sessions > 0) return "attendance" as const;
      const result = await database.collection("timetable_entries").deleteOne({ _id: id }, { session });
      if (result.deletedCount !== 1) return "error" as const;
      await audit(session, access.userId, "timetable_entries.deleted", "timetable_entries", id);
      return "removed" as const;
    });
  } catch (error) {
    console.error("[data] deleteTimetableEntry failed", { message: error instanceof Error ? error.message : String(error) });
    return "error";
  }
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export type AttendanceSummaryRow = {
  offering_id: string;
  subject_code: string;
  subject_name: string;
  section_code: string;
  recorded_sessions: number;
  recorded_marks: number;
  present_count: number;
  absent_count: number;
  late_count: number;
};

async function summarize(match: Document): Promise<AttendanceSummaryRow[]> {
  const rows = await db().collection("attendance_records").aggregate<{ _id: ObjectId; total: number; present: number; absent: number; late: number }>([
    { $match: match },
    {
      $group: {
        _id: "$offering_id",
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
      },
    },
  ]).toArray();
  const offerings = await loadOfferings(rows.map((r) => r._id));
  return rows.flatMap((row) => {
    const o = offerings.get(hex(row._id));
    return o ? [{
      offering_id: o.id,
      subject_code: o.subject.code,
      subject_name: o.subject.name,
      section_code: o.section_code,
      recorded_sessions: row.total,
      recorded_marks: row.total,
      present_count: row.present,
      absent_count: row.absent,
      late_count: row.late,
    }] : [];
  }).sort((a, b) => a.subject_code.localeCompare(b.subject_code) || a.section_code.localeCompare(b.section_code));
}

/** Teacher: own offerings. Admin: all offerings. */
export function scopedAttendanceSummary(access: Access) {
  return attempt("scopedAttendanceSummary", [] as AttendanceSummaryRow[], async () => {
    if (access.isAdmin) return summarize({});
    if (access.isTeacher) return summarize({ offering_id: { $in: access.teacherOfferingIds } });
    return [];
  });
}

export function myAttendanceSummary(access: Access) {
  return attempt("myAttendanceSummary", [] as AttendanceSummaryRow[], async () =>
    access.studentRecordId ? summarize({ student_record_id: access.studentRecordId }) : []);
}

export function myAttendanceHistory(access: Access, limit: number, offset: number) {
  return attempt("myAttendanceHistory", [] as Array<{ id: string; status: Status; session_date: string; subject_code: string; subject_name: string; section_code: string }>, async () => {
    if (!access.studentRecordId) return [];
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);
    const rows = await db().collection("attendance_records").aggregate<{ _id: ObjectId; status: Status; offering_id: ObjectId; session: { session_date: string } }>([
      { $match: { student_record_id: access.studentRecordId } },
      { $lookup: { from: "attendance_sessions", localField: "session_id", foreignField: "_id", as: "session" } },
      { $unwind: "$session" },
      { $sort: { "session.session_date": -1, _id: 1 } },
      { $skip: safeOffset },
      { $limit: safeLimit },
      { $project: { status: 1, offering_id: 1, "session.session_date": 1 } },
    ]).toArray();
    const offerings = await loadOfferings(rows.map((r) => r.offering_id));
    return rows.flatMap((row) => {
      const o = offerings.get(hex(row.offering_id));
      return o ? [{ id: hex(row._id), status: row.status, session_date: row.session.session_date, subject_code: o.subject.code, subject_name: o.subject.name, section_code: o.section_code }] : [];
    });
  });
}

/** Admin or assigned teacher only. */
export function offeringAttendanceByStudent(access: Access, offeringId: string) {
  return attempt("offeringAttendanceByStudent", [] as Array<{ student_record_id: string; registration_number: string; display_name: string; recorded_sessions: number; present_count: number; absent_count: number; late_count: number }>, async () => {
    const id = oid(offeringId);
    if (!id || !(access.isAdmin || teachesOffering(access, id))) return [];
    const enrolled = await db().collection("enrolments").find({ offering_id: id }, { projection: { student_record_id: 1 } }).toArray();
    const recordIds = enrolled.map((e) => e.student_record_id as ObjectId);
    const [directory, marks] = await Promise.all([
      buildDirectoryRows({ _id: { $in: recordIds } }, 5000),
      db().collection("attendance_records").aggregate<{ _id: ObjectId; total: number; present: number; absent: number; late: number }>([
        { $match: { offering_id: id, student_record_id: { $in: recordIds } } },
        {
          $group: {
            _id: "$student_record_id",
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
            late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
          },
        },
      ]).toArray(),
    ]);
    const byStudent = new Map(marks.map((m) => [hex(m._id), m]));
    return directory.map((row) => {
      const m = byStudent.get(row.student_record_id);
      return {
        student_record_id: row.student_record_id,
        registration_number: row.registration_number,
        display_name: row.display_name,
        recorded_sessions: m?.total ?? 0,
        present_count: m?.present ?? 0,
        absent_count: m?.absent ?? 0,
        late_count: m?.late ?? 0,
      };
    });
  });
}

/** Roster + saved marks for one class session (assigned teacher only). */
export async function loadAttendanceRoster(access: Access, timetableEntryId: string, sessionDate: string): Promise<
  { ok: true; roster: Array<{ studentRecordId: string; registrationNumber: string; displayName: string; status: Status | "" }> } | { ok: false; reason: "limit" | "error" }
> {
  try {
    const entryId = oid(timetableEntryId);
    if (!entryId) return { ok: false, reason: "error" };
    const database = db();
    const entry = await database.collection("timetable_entries").findOne({ _id: entryId });
    if (!entry || !teachesOffering(access, entry.offering_id as ObjectId)) return { ok: false, reason: "error" };
    const enrolled = await database.collection("enrolments").find({ offering_id: entry.offering_id }, { projection: { student_record_id: 1 } }).limit(201).toArray();
    if (enrolled.length > 200) return { ok: false, reason: "limit" };
    const session = await database.collection("attendance_sessions").findOne({ timetable_entry_id: entryId, session_date: sessionDate });
    const [directory, marks] = await Promise.all([
      buildDirectoryRows({ _id: { $in: enrolled.map((e) => e.student_record_id as ObjectId) } }, 200),
      session ? database.collection("attendance_records").find({ session_id: session._id }).toArray() : Promise.resolve([]),
    ]);
    const saved = new Map(marks.map((m) => [hex(m.student_record_id as ObjectId), m.status as Status]));
    return {
      ok: true,
      roster: directory.map((s) => ({ studentRecordId: s.student_record_id, registrationNumber: s.registration_number, displayName: s.display_name, status: saved.get(s.student_record_id) ?? "" })),
    };
  } catch (error) {
    console.error("[data] loadAttendanceRoster failed", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "error" };
  }
}

/**
 * Replaces mark_attendance_for_session(): one transaction creates the session
 * (unique on timetable_entry_id + session_date) and upserts each mark (unique on
 * session_id + student_record_id), so concurrent submissions cannot duplicate.
 */
export async function markAttendanceForSession(
  access: Access,
  input: { timetableEntryId: string; sessionDate: string; records: Array<{ studentRecordId: string; status: Status }> },
): Promise<{ ok: boolean }> {
  const entryId = oid(input.timetableEntryId);
  if (!entryId || !access.isTeacher) return { ok: false };
  if (input.records.length < 1 || input.records.length > 200) return { ok: false };
  const recordIds = input.records.map((r) => oid(r.studentRecordId));
  if (recordIds.some((id) => id === null)) return { ok: false };
  if (new Set(input.records.map((r) => r.studentRecordId)).size !== input.records.length) return { ok: false };
  try {
    await inTransaction(async (session) => {
      const database = db();
      const entry = await database.collection("timetable_entries").findOne({ _id: entryId }, { session });
      if (!entry) throw new ValidationError("entry");
      const offeringId = entry.offering_id as ObjectId;
      if (!teachesOffering(access, offeringId)) throw new AccessDeniedError("Not assigned.");
      const term = await database.collection("academic_terms").findOne({ _id: entry.term_id }, { session });
      const day = input.sessionDate;
      if (!term || isoWeekday(day) !== Number(entry.weekday)
        || (term.starts_on && day < String(term.starts_on))
        || (term.ends_on && day > String(term.ends_on))) {
        throw new ValidationError("date");
      }
      const enrolled = await database.collection("enrolments").countDocuments(
        { offering_id: offeringId, student_record_id: { $in: recordIds as ObjectId[] } },
        { session },
      );
      if (enrolled !== recordIds.length) throw new ValidationError("roster");
      const now = new Date();
      const upserted = await database.collection("attendance_sessions").findOneAndUpdate(
        { timetable_entry_id: entryId, session_date: day },
        { $setOnInsert: { timetable_entry_id: entryId, offering_id: offeringId, session_date: day, created_by: access.userId, created_at: now } },
        { upsert: true, returnDocument: "after", session },
      );
      const sessionId = upserted?._id as ObjectId | undefined;
      if (!sessionId) throw new Error("Attendance session was not created.");
      for (const [index, record] of input.records.entries()) {
        await database.collection("attendance_records").updateOne(
          { session_id: sessionId, student_record_id: recordIds[index] as ObjectId },
          {
            $set: { status: record.status, marked_by: access.userId, updated_at: now },
            $setOnInsert: { session_id: sessionId, offering_id: offeringId, student_record_id: recordIds[index] as ObjectId, created_at: now },
          },
          { upsert: true, session },
        );
      }
      await audit(session, access.userId, "attendance_records.marked", "attendance_sessions", sessionId, { count: input.records.length });
    });
    return { ok: true };
  } catch (error) {
    console.error("[data] markAttendanceForSession failed", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------
export type AssignmentView = {
  id: string;
  offering_id: string;
  title: string;
  instructions: string;
  due_at: string;
  status: "draft" | "published";
  created_by: string;
  offering: { id: string; section_code: string; subject: { code: string; name: string }; term: { name: string } };
};

/** Old RLS: admin all; teacher own-created in assigned offerings; student published in enrolled offerings. */
function assignmentScope(access: Access): Document | null {
  if (access.isAdmin) return {};
  const clauses: Document[] = [];
  if (access.isTeacher && access.teacherOfferingIds.length) clauses.push({ created_by: access.userId, offering_id: { $in: access.teacherOfferingIds } });
  if (access.enrolledOfferingIds.length) clauses.push({ status: "published", offering_id: { $in: access.enrolledOfferingIds } });
  return clauses.length ? { $or: clauses } : null;
}

export function listVisibleAssignments(access: Access, extra: Document = {}, limit = 500) {
  return attempt("listVisibleAssignments", [] as AssignmentView[], async () => {
    const scope = assignmentScope(access);
    if (scope === null) return [];
    const rows = await db().collection("assignments").find({ $and: [scope, extra] }).sort({ due_at: 1 }).limit(limit).toArray();
    const offerings = await loadOfferings(rows.map((r) => r.offering_id as ObjectId));
    return rows.flatMap((row) => {
      const o = offerings.get(hex(row.offering_id as ObjectId));
      return o ? [{
        id: hex(row._id as ObjectId),
        offering_id: o.id,
        title: String(row.title),
        instructions: String(row.instructions),
        due_at: iso(row.due_at),
        status: row.status as "draft" | "published",
        created_by: hex(row.created_by as ObjectId),
        offering: { id: o.id, section_code: o.section_code, subject: { code: o.subject.code, name: o.subject.name }, term: { name: o.term.name } },
      }] : [];
    });
  });
}

export async function createAssignment(access: Access, input: { offeringId: string; title: string; instructions: string; dueAt: Date; status: "draft" | "published" }): Promise<{ ok: boolean }> {
  const offeringId = oid(input.offeringId);
  if (!offeringId || !access.isTeacher || !teachesOffering(access, offeringId)) return { ok: false };
  try {
    await inTransaction(async (session) => {
      const now = new Date();
      const inserted = await db().collection("assignments").insertOne({
        offering_id: offeringId,
        title: input.title,
        instructions: input.instructions,
        due_at: input.dueAt,
        status: input.status,
        created_by: access.userId,
        created_at: now,
        updated_at: now,
      }, { session });
      await audit(session, access.userId, "assignments.created", "assignments", inserted.insertedId);
    });
    return { ok: true };
  } catch (error) {
    console.error("[data] createAssignment failed", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false };
  }
}

export async function updateAssignment(access: Access, input: { assignmentId: string; offeringId: string; title: string; instructions: string; dueAt: Date; status: "draft" | "published" }): Promise<{ ok: boolean }> {
  const id = oid(input.assignmentId);
  const offeringId = oid(input.offeringId);
  if (!id || !offeringId || !access.isTeacher || !teachesOffering(access, offeringId)) return { ok: false };
  try {
    await inTransaction(async (session) => {
      const result = await db().collection("assignments").updateOne(
        { _id: id, created_by: access.userId, offering_id: { $in: access.teacherOfferingIds } },
        { $set: { offering_id: offeringId, title: input.title, instructions: input.instructions, due_at: input.dueAt, status: input.status, updated_at: new Date() } },
        { session },
      );
      if (result.matchedCount !== 1) throw new AccessDeniedError("Not your assignment.");
      await audit(session, access.userId, "assignments.updated", "assignments", id);
    });
    return { ok: true };
  } catch (error) {
    console.error("[data] updateAssignment failed", { message: error instanceof Error ? error.message : String(error) });
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Subject offering page
// ---------------------------------------------------------------------------
export function canReadOffering(access: Access, offeringId: ObjectId): boolean {
  return access.isAdmin || teachesOffering(access, offeringId) || enrolledInOffering(access, offeringId);
}

export function getOfferingDetail(access: Access, offeringId: string) {
  return attempt("getOfferingDetail", null as null | {
    id: string;
    section_code: string;
    status: string;
    subject: { id: string; code: string; name: string; credits: number | null; program: { code: string; name: string; department: { code: string; name: string } } };
    term: { name: string; status: string; starts_on: string | null; ends_on: string | null };
  }, async () => {
    const id = oid(offeringId);
    if (!id || !canReadOffering(access, id)) return null;
    const o = (await loadOfferings([id])).get(offeringId);
    if (!o) return null;
    const program = await db().collection("programs").findOne({ _id: new ObjectId(o.subject.program_id) });
    const department = program ? await db().collection("departments").findOne({ _id: program.department_id }) : null;
    if (!program || !department) return null;
    return {
      id: o.id,
      section_code: o.section_code,
      status: o.status,
      subject: {
        id: o.subject.id, code: o.subject.code, name: o.subject.name, credits: o.subject.credits,
        program: { code: String(program.code), name: String(program.name), department: { code: String(department.code), name: String(department.name) } },
      },
      term: { name: o.term.name, status: o.term.status, starts_on: o.term.starts_on, ends_on: o.term.ends_on },
    };
  });
}

export function listOfferingFaculty(access: Access, offeringId: string) {
  return attempt("listOfferingFaculty", [] as Array<{ id: string; display_name: string }>, async () => {
    const id = oid(offeringId);
    if (!id || !(access.isAdmin || access.isTeacher) || !canReadOffering(access, id)) return [];
    const rows = await db().collection("teaching_assignments").find({ offering_id: id }).toArray();
    const names = await displayNames(rows.map((r) => r.teacher_user_id as ObjectId));
    return [...names.entries()].map(([userId, display_name]) => ({ id: userId, display_name })).sort((a, b) => a.display_name.localeCompare(b.display_name));
  });
}

/** Student's own marks for one offering, newest session first. */
export function listMyOfferingMarks(access: Access, offeringId: string) {
  return attempt("listMyOfferingMarks", [] as Array<{ id: string; session_id: string; session_date: string; status: Status }>, async () => {
    const id = oid(offeringId);
    if (!id || !access.studentRecordId) return [];
    const sessions = await db().collection("attendance_sessions").find({ offering_id: id }).sort({ session_date: -1 }).limit(501).toArray();
    const dates = new Map(sessions.map((s) => [hex(s._id as ObjectId), String(s.session_date)]));
    const marks = await db().collection("attendance_records").find({
      student_record_id: access.studentRecordId,
      offering_id: id,
      session_id: { $in: sessions.map((s) => s._id as ObjectId) },
    }).toArray();
    return marks
      .map((m) => ({ id: hex(m._id as ObjectId), session_id: hex(m.session_id as ObjectId), session_date: dates.get(hex(m.session_id as ObjectId)) ?? "", status: m.status as Status }))
      .sort((a, b) => b.session_date.localeCompare(a.session_date));
  });
}
