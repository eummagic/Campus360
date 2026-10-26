import "server-only";
import { cache } from "react";
import { ObjectId, type ClientSession, type Db } from "mongodb";
import { getDb, getMongoClient } from "@/lib/mongo/connection";

// ---------------------------------------------------------------------------
// Result + error shape. Pages were written against Supabase's { data, error }
// results whose errors expose code/message/hint, so the data layer keeps that
// contract and pages only change the call site.
// ---------------------------------------------------------------------------
export type DataError = { code: string; message: string; hint: string };
export type Result<T> = { data: T; error: DataError | null };

export class AccessDeniedError extends Error {
  readonly code = "ACCESS_DENIED";
}

export class ConflictError extends Error {
  readonly code = "CONFLICT";
}

export class ValidationError extends Error {
  readonly code = "INVALID";
}

export function toDataError(error: unknown): DataError {
  const raw = error && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : undefined;
  return {
    code: raw === undefined || raw === null ? "DB_ERROR" : String(raw),
    message: error instanceof Error ? error.message : String(error),
    hint: "",
  };
}

export async function attempt<T>(label: string, fallback: T, run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await run(), error: null };
  } catch (error) {
    const detail = toDataError(error);
    console.error(`[data] ${label} failed`, { code: detail.code, message: detail.message });
    return { data: fallback, error: detail };
  }
}

export function db(): Db {
  return getDb();
}

/** Runs fn inside a MongoDB transaction (Atlas clusters are replica sets). */
export async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = getMongoClient().startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

// ---------------------------------------------------------------------------
// Ids, dates and times
// ---------------------------------------------------------------------------
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID.test(value);
}

export function oid(value: string): ObjectId | null {
  return isObjectIdString(value) ? new ObjectId(value) : null;
}

export function oids(values: readonly string[]): ObjectId[] {
  return values.flatMap((value) => {
    const id = oid(value);
    return id ? [id] : [];
  });
}

export function hex(value: ObjectId | null | undefined): string {
  return value ? value.toHexString() : "";
}

export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

/** 540 -> "09:00:00" (same text shape Postgres `time` columns returned). */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** "09:30" or "09:30:00" -> 570 */
export function timeToMinuteValue(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** ISO weekday (Monday = 1) for a YYYY-MM-DD string. */
export function isoWeekday(day: string): number {
  return new Date(`${day}T00:00:00.000Z`).getUTCDay() || 7;
}

// ---------------------------------------------------------------------------
// Access scope: replaces Postgres RLS. Every query below filters with it.
// ---------------------------------------------------------------------------
export type Access = {
  userId: ObjectId;
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  studentRecordId: ObjectId | null;
  teacherOfferingIds: ObjectId[];
  enrolledOfferingIds: ObjectId[];
};

export const getAccess = cache(async (userId: string): Promise<Access> => {
  const id = oid(userId);
  if (!id) throw new AccessDeniedError("Invalid user id.");
  const database = db();
  const [roles, record, teaching] = await Promise.all([
    database.collection("user_roles").find({ user_id: id }, { projection: { role: 1 } }).toArray(),
    database.collection("student_records").findOne({ user_id: id }, { projection: { _id: 1 } }),
    database.collection("teaching_assignments").find({ teacher_user_id: id }, { projection: { offering_id: 1 } }).toArray(),
  ]);
  const roleSet = new Set(roles.map((row) => String(row.role)));
  const studentRecordId = (record?._id as ObjectId | undefined) ?? null;
  const enrolments = studentRecordId
    ? await database.collection("enrolments").find({ student_record_id: studentRecordId }, { projection: { offering_id: 1 } }).toArray()
    : [];
  return {
    userId: id,
    isAdmin: roleSet.has("admin"),
    isTeacher: roleSet.has("teacher"),
    isStudent: roleSet.has("student"),
    studentRecordId,
    teacherOfferingIds: teaching.map((row) => row.offering_id as ObjectId),
    enrolledOfferingIds: enrolments.map((row) => row.offering_id as ObjectId),
  };
});

function hasId(list: readonly ObjectId[], id: ObjectId): boolean {
  return list.some((item) => item.equals(id));
}

export function teachesOffering(access: Access, offeringId: ObjectId): boolean {
  return hasId(access.teacherOfferingIds, offeringId);
}

export function enrolledInOffering(access: Access, offeringId: ObjectId): boolean {
  return hasId(access.enrolledOfferingIds, offeringId);
}

/** Offerings whose schedule/teaching rows the user may read. null = all (admin). */
export function readableOfferingIds(access: Access): ObjectId[] | null {
  if (access.isAdmin) return null;
  return [...access.teacherOfferingIds, ...access.enrolledOfferingIds];
}

/** Student records the user may read. null = all (admin). */
export async function readableStudentRecordIds(access: Access): Promise<ObjectId[] | null> {
  if (access.isAdmin) return null;
  const ids: ObjectId[] = access.studentRecordId ? [access.studentRecordId] : [];
  if (access.teacherOfferingIds.length) {
    const taught = await db()
      .collection("enrolments")
      .find({ offering_id: { $in: access.teacherOfferingIds } }, { projection: { student_record_id: 1 } })
      .toArray();
    for (const row of taught) ids.push(row.student_record_id as ObjectId);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Offering hydration (replaces PostgREST embedded selects)
// ---------------------------------------------------------------------------
export type OfferingView = {
  id: string;
  section_code: string;
  status: string;
  term_id: string;
  subject_id: string;
  subject: { id: string; code: string; name: string; credits: number | null; program_id: string };
  term: { id: string; name: string; status: string; starts_on: string | null; ends_on: string | null };
};

export async function loadOfferings(ids: readonly ObjectId[]): Promise<Map<string, OfferingView>> {
  const unique = [...new Map(ids.map((id) => [id.toHexString(), id])).values()];
  const result = new Map<string, OfferingView>();
  if (!unique.length) return result;
  const database = db();
  const offerings = await database.collection("course_offerings").find({ _id: { $in: unique } }).toArray();
  const [subjects, terms] = await Promise.all([
    database.collection("subjects").find({ _id: { $in: offerings.map((o) => o.subject_id as ObjectId) } }).toArray(),
    database.collection("academic_terms").find({ _id: { $in: offerings.map((o) => o.term_id as ObjectId) } }).toArray(),
  ]);
  const subjectById = new Map(subjects.map((s) => [hex(s._id as ObjectId), s]));
  const termById = new Map(terms.map((t) => [hex(t._id as ObjectId), t]));
  for (const offering of offerings) {
    const subject = subjectById.get(hex(offering.subject_id as ObjectId));
    const term = termById.get(hex(offering.term_id as ObjectId));
    if (!subject || !term) continue;
    const id = hex(offering._id as ObjectId);
    result.set(id, {
      id,
      section_code: String(offering.section_code),
      status: String(offering.status),
      term_id: hex(offering.term_id as ObjectId),
      subject_id: hex(offering.subject_id as ObjectId),
      subject: {
        id: hex(subject._id as ObjectId),
        code: String(subject.code),
        name: String(subject.name),
        credits: (subject.credits as number | null) ?? null,
        program_id: hex(subject.program_id as ObjectId),
      },
      term: {
        id: hex(term._id as ObjectId),
        name: String(term.name),
        status: String(term.status),
        starts_on: (term.starts_on as string | null) ?? null,
        ends_on: (term.ends_on as string | null) ?? null,
      },
    });
  }
  return result;
}

export async function displayNames(userIds: readonly ObjectId[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await db()
    .collection("profiles")
    .find({ _id: { $in: [...userIds] } }, { projection: { display_name: 1 } })
    .toArray();
  return new Map(rows.map((row) => [hex(row._id as ObjectId), String(row.display_name)]));
}

/** Append-only audit record, written in the same transaction as the change. */
export async function audit(
  session: ClientSession | undefined,
  actorId: ObjectId | null,
  action: string,
  entityType: string,
  entityId: ObjectId | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db().collection("audit_events").insertOne(
    { actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata, created_at: new Date() },
    { session },
  );
}
