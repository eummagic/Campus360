import "server-only";
import type { Document, ObjectId } from "mongodb";
import {
  attempt,
  db,
  hex,
  iso,
  loadOfferings,
  oid,
  readableStudentRecordIds,
  type Access,
  type DataError,
} from "@/lib/data/core";

export type DirectoryFilters = {
  q?: string;
  programId?: string;
  status?: "active" | "inactive" | "graduated";
  offeringId?: string;
};

export type DirectoryRow = {
  student_record_id: string;
  user_id: string;
  registration_number: string;
  record_status: "active" | "inactive" | "graduated";
  display_name: string;
  contact_email: string | null;
  program_id: string;
  program_code: string;
  program_name: string;
  department_id: string;
  department_code: string;
  department_name: string;
};

/** Equivalent of the old student_directory view, already scoped by the caller. */
export async function buildDirectoryRows(filter: Document, limit = 500): Promise<DirectoryRow[]> {
  const database = db();
  const records = await database.collection("student_records").find(filter).sort({ registration_number: 1 }).limit(limit).toArray();
  if (!records.length) return [];
  const [profiles, programs] = await Promise.all([
    database.collection("profiles").find({ _id: { $in: records.map((r) => r.user_id as ObjectId) } }).toArray(),
    database.collection("programs").find({ _id: { $in: records.map((r) => r.program_id as ObjectId) } }).toArray(),
  ]);
  const departments = await database.collection("departments").find({ _id: { $in: programs.map((p) => p.department_id as ObjectId) } }).toArray();
  const profileById = new Map(profiles.map((p) => [hex(p._id as ObjectId), p]));
  const programById = new Map(programs.map((p) => [hex(p._id as ObjectId), p]));
  const departmentById = new Map(departments.map((d) => [hex(d._id as ObjectId), d]));
  return records.flatMap((record) => {
    const profile = profileById.get(hex(record.user_id as ObjectId));
    const program = programById.get(hex(record.program_id as ObjectId));
    const department = program ? departmentById.get(hex(program.department_id as ObjectId)) : undefined;
    if (!profile || !program || !department) return [];
    return [{
      student_record_id: hex(record._id as ObjectId),
      user_id: hex(record.user_id as ObjectId),
      registration_number: String(record.registration_number),
      record_status: record.status as DirectoryRow["record_status"],
      display_name: String(profile.display_name),
      contact_email: (profile.contact_email as string | null) ?? null,
      program_id: hex(program._id as ObjectId),
      program_code: String(program.code),
      program_name: String(program.name),
      department_id: hex(department._id as ObjectId),
      department_code: String(department.code),
      department_name: String(department.name),
    }];
  });
}

async function scopedRecordFilter(access: Access): Promise<Document> {
  const ids = await readableStudentRecordIds(access);
  return ids === null ? {} : { _id: { $in: ids } };
}

export async function listDirectory(access: Access, filters: DirectoryFilters): Promise<{ rows: DirectoryRow[]; error: DataError | null }> {
  const result = await attempt("listDirectory", [] as DirectoryRow[], async () => {
    const filter: Document = await scopedRecordFilter(access);
    if (filters.programId) {
      const programId = oid(filters.programId);
      if (!programId) return [];
      filter.program_id = programId;
    }
    if (filters.status) filter.status = filters.status;
    if (filters.offeringId) {
      const offeringId = oid(filters.offeringId);
      if (!offeringId) return [];
      const enrolled = await db().collection("enrolments").find({ offering_id: offeringId }, { projection: { student_record_id: 1 } }).limit(500).toArray();
      const allowed = enrolled.map((row) => hex(row.student_record_id as ObjectId));
      const scoped = filter._id?.$in as ObjectId[] | undefined;
      const ids = enrolled.map((row) => row.student_record_id as ObjectId).filter((id) => !scoped || scoped.some((s) => s.equals(id)));
      if (!allowed.length || !ids.length) return [];
      filter._id = { $in: ids };
    }
    const rows = await buildDirectoryRows(filter, filters.q ? 2000 : 200);
    const q = filters.q?.trim().toLocaleLowerCase();
    const matched = q
      ? rows.filter((row) => `${row.display_name} ${row.registration_number}`.toLocaleLowerCase().includes(q))
      : rows;
    return matched.slice(0, 200);
  });
  return { rows: result.data, error: result.error };
}

export async function getDirectoryEntry(access: Access, studentRecordId: string): Promise<{ row: DirectoryRow | null; error: DataError | null }> {
  const id = oid(studentRecordId);
  if (!id) return { row: null, error: null };
  const result = await attempt("getDirectoryEntry", null as DirectoryRow | null, async () => {
    const scope = await readableStudentRecordIds(access);
    if (scope !== null && !scope.some((allowed) => allowed.equals(id))) return null;
    const [row] = await buildDirectoryRows({ _id: id }, 1);
    return row ?? null;
  });
  return { row: result.data, error: result.error };
}

export type EnrolmentView = {
  id: string;
  enrolled_at: string;
  offering: {
    id: string;
    section_code: string;
    term: { id: string; name: string };
    subject: { id: string; code: string; name: string; credits: number | null };
    teaching: Array<{ teacher_user_id: string }>;
  };
};

export async function listEnrolmentsForRecord(access: Access, studentRecordId: string): Promise<{ rows: EnrolmentView[]; error: DataError | null }> {
  const id = oid(studentRecordId);
  if (!id) return { rows: [], error: null };
  const result = await attempt("listEnrolmentsForRecord", [] as EnrolmentView[], async () => {
    const filter: Document = { student_record_id: id };
    const isOwn = access.studentRecordId?.equals(id) ?? false;
    if (!access.isAdmin && !isOwn) filter.offering_id = { $in: access.teacherOfferingIds };
    const enrolments = await db().collection("enrolments").find(filter).sort({ enrolled_at: 1 }).toArray();
    const offeringIds = enrolments.map((e) => e.offering_id as ObjectId);
    const [offerings, teaching] = await Promise.all([
      loadOfferings(offeringIds),
      db().collection("teaching_assignments").find({ offering_id: { $in: offeringIds } }).toArray(),
    ]);
    return enrolments.flatMap((enrolment) => {
      const offering = offerings.get(hex(enrolment.offering_id as ObjectId));
      if (!offering) return [];
      return [{
        id: hex(enrolment._id as ObjectId),
        enrolled_at: iso(enrolment.enrolled_at),
        offering: {
          id: offering.id,
          section_code: offering.section_code,
          term: { id: offering.term.id, name: offering.term.name },
          subject: { id: offering.subject.id, code: offering.subject.code, name: offering.subject.name, credits: offering.subject.credits },
          teaching: teaching
            .filter((t) => hex(t.offering_id as ObjectId) === offering.id)
            .map((t) => ({ teacher_user_id: hex(t.teacher_user_id as ObjectId) })),
        },
      }];
    });
  });
  return { rows: result.data, error: result.error };
}

export async function listReferenceData() {
  const database = db();
  const [departments, programs, terms] = await Promise.all([
    attempt("departments", [] as Array<{ id: string; code: string; name: string; status: string }>, async () =>
      (await database.collection("departments").find().sort({ code: 1 }).toArray()).map((d) => ({ id: hex(d._id as ObjectId), code: String(d.code), name: String(d.name), status: String(d.status) }))),
    attempt("programs", [] as Array<{ id: string; code: string; name: string; status: string; department_id: string }>, async () =>
      (await database.collection("programs").find().sort({ code: 1 }).toArray()).map((p) => ({ id: hex(p._id as ObjectId), code: String(p.code), name: String(p.name), status: String(p.status), department_id: hex(p.department_id as ObjectId) }))),
    attempt("terms", [] as Array<{ id: string; name: string; status: string; starts_on: string | null; ends_on: string | null }>, async () =>
      (await database.collection("academic_terms").find().sort({ name: 1 }).toArray()).map((t) => ({ id: hex(t._id as ObjectId), name: String(t.name), status: String(t.status), starts_on: (t.starts_on as string | null) ?? null, ends_on: (t.ends_on as string | null) ?? null }))),
  ]);
  return {
    departments: departments.data,
    programs: programs.data,
    terms: terms.data,
    error: departments.error ?? programs.error ?? terms.error,
  };
}

export type TeachingAssignmentView = {
  id: string;
  teacher_user_id: string;
  offering: { id: string; section_code: string; subject: { code: string; name: string }; term: { name: string } };
};

/** Old RLS: admin sees all, teacher sees own, student sees those of enrolled offerings. */
export async function listVisibleTeachingAssignments(access: Access, onlyOwn = false) {
  return attempt("listVisibleTeachingAssignments", [] as TeachingAssignmentView[], async () => {
    let filter: Document;
    if (onlyOwn) filter = { teacher_user_id: access.userId };
    else if (access.isAdmin) filter = {};
    else filter = { $or: [{ teacher_user_id: access.userId }, { offering_id: { $in: access.enrolledOfferingIds } }] };
    const rows = await db().collection("teaching_assignments").find(filter).toArray();
    const offerings = await loadOfferings(rows.map((r) => r.offering_id as ObjectId));
    return rows.flatMap((row) => {
      const offering = offerings.get(hex(row.offering_id as ObjectId));
      if (!offering) return [];
      return [{
        id: hex(row._id as ObjectId),
        teacher_user_id: hex(row.teacher_user_id as ObjectId),
        offering: { id: offering.id, section_code: offering.section_code, subject: { code: offering.subject.code, name: offering.subject.name }, term: { name: offering.term.name } },
      }];
    });
  });
}

export type UnlinkedStudentUser = { user_id: string; display_name: string; contact_email: string | null };

/** Admin only: student-role accounts without a student record. */
export async function listUnlinkedStudentUsers(access: Access) {
  return attempt("listUnlinkedStudentUsers", [] as UnlinkedStudentUser[], async () => {
    if (!access.isAdmin) return [];
    const database = db();
    const studentRoles = await database.collection("user_roles").find({ role: "student" }, { projection: { user_id: 1 } }).toArray();
    const linked = await database.collection("student_records").find({}, { projection: { user_id: 1 } }).toArray();
    const linkedIds = new Set(linked.map((r) => hex(r.user_id as ObjectId)));
    const candidateIds = studentRoles.map((r) => r.user_id as ObjectId).filter((id) => !linkedIds.has(hex(id)));
    if (!candidateIds.length) return [];
    const profiles = await database.collection("profiles").find({ _id: { $in: candidateIds } }).sort({ display_name: 1 }).toArray();
    const unique = new Map(profiles.map((p) => [hex(p._id as ObjectId), p]));
    return [...unique.values()].map((p) => ({ user_id: hex(p._id as ObjectId), display_name: String(p.display_name), contact_email: (p.contact_email as string | null) ?? null }));
  });
}
