import type { Document, IndexDescription } from "mongodb";

const text = (min: number, max: number) => ({ bsonType: "string", minLength: min, maxLength: max, pattern: "\\S" });
const textOrNull = (min: number, max: number) => ({ bsonType: ["string", "null"], minLength: min, maxLength: max, pattern: "\\S" });
const oid = { bsonType: "objectId" };
const oidOrNull = { bsonType: ["objectId", "null"] };
const date = { bsonType: "date" };
const DAY = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";
const day = { bsonType: "string", pattern: DAY };
const dayOrNull = { bsonType: ["string", "null"], pattern: DAY };
const oneOf = (...values: string[]) => ({ bsonType: "string", enum: values });
const int = (min: number, max: number) => ({ bsonType: "int", minimum: min, maximum: max });
const stamps = { created_at: date, updated_at: date };

export type CollectionSpec = {
  name: string;
  properties: Record<string, Document>;
  required: string[];
  expr?: Document;
  indexes: IndexDescription[];
};

export const COLLECTIONS: CollectionSpec[] = [
  {
    name: "profiles",
    properties: { _id: oid, display_name: text(1, 120), contact_email: textOrNull(3, 320), ...stamps },
    required: ["display_name", "contact_email", "created_at", "updated_at"],
    indexes: [],
  },
  {
    name: "user_roles",
    properties: {
      user_id: oid,
      role: oneOf("student", "teacher", "admin", "driver", "finance"),
      scope: textOrNull(1, 64),
      assigned_at: date,
      assigned_by: oidOrNull,
    },
    required: ["user_id", "role", "scope", "assigned_at", "assigned_by"],
    indexes: [{ key: { user_id: 1, role: 1, scope: 1 }, name: "user_roles_user_role_scope_uq", unique: true }],
  },
  {
    name: "audit_events",
    properties: {
      actor_id: oidOrNull,
      action: text(1, 120),
      entity_type: text(1, 64),
      entity_id: oidOrNull,
      metadata: { bsonType: "object" },
      created_at: date,
    },
    required: ["actor_id", "action", "entity_type", "entity_id", "metadata", "created_at"],
    indexes: [
      { key: { actor_id: 1, created_at: -1 }, name: "audit_events_actor_idx" },
      { key: { entity_type: 1, entity_id: 1, created_at: -1 }, name: "audit_events_entity_idx" },
    ],
  },
  {
    name: "departments",
    properties: { code: text(1, 16), name: text(1, 200), status: oneOf("active", "inactive"), ...stamps },
    required: ["code", "name", "status", "created_at", "updated_at"],
    indexes: [{ key: { code: 1 }, name: "departments_code_uq", unique: true }],
  },
  {
    name: "programs",
    properties: { department_id: oid, code: text(1, 32), name: text(1, 200), status: oneOf("active", "inactive"), ...stamps },
    required: ["department_id", "code", "name", "status", "created_at", "updated_at"],
    indexes: [{ key: { department_id: 1, code: 1 }, name: "programs_department_code_uq", unique: true }],
  },
  {
    name: "academic_terms",
    properties: { name: text(1, 80), starts_on: dayOrNull, ends_on: dayOrNull, status: oneOf("planned", "active", "closed"), ...stamps },
    required: ["name", "starts_on", "ends_on", "status", "created_at", "updated_at"],
    expr: { $or: [{ $eq: ["$starts_on", null] }, { $eq: ["$ends_on", null] }, { $lte: ["$starts_on", "$ends_on"] }] },
    indexes: [{ key: { name: 1 }, name: "academic_terms_name_uq", unique: true }],
  },
  {
    name: "subjects",
    properties: {
      program_id: oid,
      code: text(1, 32),
      name: text(1, 200),
      credits: { bsonType: ["int", "null"], minimum: 0, maximum: 60 },
      status: oneOf("active", "inactive"),
      ...stamps,
    },
    required: ["program_id", "code", "name", "credits", "status", "created_at", "updated_at"],
    indexes: [{ key: { program_id: 1, code: 1 }, name: "subjects_program_code_uq", unique: true }],
  },
  {
    name: "course_offerings",
    properties: { subject_id: oid, term_id: oid, section_code: text(1, 16), status: oneOf("active", "archived"), ...stamps },
    required: ["subject_id", "term_id", "section_code", "status", "created_at", "updated_at"],
    indexes: [
      { key: { subject_id: 1, term_id: 1, section_code: 1 }, name: "course_offerings_subject_term_section_uq", unique: true },
      { key: { term_id: 1 }, name: "course_offerings_term_idx" },
    ],
  },
  {
    name: "teaching_assignments",
    properties: { teacher_user_id: oid, offering_id: oid, assigned_at: date, assigned_by: oidOrNull },
    required: ["teacher_user_id", "offering_id", "assigned_at", "assigned_by"],
    indexes: [
      { key: { teacher_user_id: 1, offering_id: 1 }, name: "teaching_assignments_teacher_offering_uq", unique: true },
      { key: { offering_id: 1 }, name: "teaching_assignments_offering_idx" },
    ],
  },
  {
    name: "student_records",
    properties: {
      user_id: oid,
      registration_number: text(1, 40),
      program_id: oid,
      status: oneOf("active", "inactive", "graduated"),
      ...stamps,
    },
    required: ["user_id", "registration_number", "program_id", "status", "created_at", "updated_at"],
    indexes: [
      { key: { user_id: 1 }, name: "student_records_user_uq", unique: true },
      { key: { registration_number: 1 }, name: "student_records_registration_uq", unique: true },
      { key: { program_id: 1 }, name: "student_records_program_idx" },
      { key: { status: 1 }, name: "student_records_status_idx" },
    ],
  },
  {
    name: "enrolments",
    properties: { student_record_id: oid, offering_id: oid, enrolled_at: date },
    required: ["student_record_id", "offering_id", "enrolled_at"],
    indexes: [
      { key: { student_record_id: 1, offering_id: 1 }, name: "enrolments_student_offering_uq", unique: true },
      { key: { offering_id: 1 }, name: "enrolments_offering_idx" },
    ],
  },
  {
    name: "timetable_entries",
    properties: {
      offering_id: oid,
      term_id: oid,
      weekday: int(1, 7),
      start_minute: int(0, 1439),
      end_minute: int(1, 1440),
      location: textOrNull(1, 100),
      location_key: textOrNull(1, 100),
      created_by: oid,
      updated_by: oid,
      ...stamps,
    },
    required: ["offering_id", "term_id", "weekday", "start_minute", "end_minute", "location", "location_key", "created_by", "updated_by", "created_at", "updated_at"],
    expr: { $gt: ["$end_minute", "$start_minute"] },
    indexes: [
      { key: { term_id: 1, weekday: 1, start_minute: 1, end_minute: 1 }, name: "timetable_entries_term_day_time_idx" },
      { key: { offering_id: 1 }, name: "timetable_entries_offering_idx" },
      { key: { term_id: 1, weekday: 1, location_key: 1 }, name: "timetable_entries_term_day_location_idx" },
    ],
  },
  {
    name: "attendance_sessions",
    properties: { timetable_entry_id: oid, offering_id: oid, session_date: day, created_by: oid, created_at: date },
    required: ["timetable_entry_id", "offering_id", "session_date", "created_by", "created_at"],
    indexes: [
      { key: { timetable_entry_id: 1, session_date: 1 }, name: "attendance_sessions_entry_date_uq", unique: true },
      { key: { offering_id: 1, session_date: -1 }, name: "attendance_sessions_offering_date_idx" },
    ],
  },
  {
    name: "attendance_records",
    properties: {
      session_id: oid,
      offering_id: oid,
      student_record_id: oid,
      status: oneOf("present", "absent", "late"),
      marked_by: oid,
      ...stamps,
    },
    required: ["session_id", "offering_id", "student_record_id", "status", "marked_by", "created_at", "updated_at"],
    indexes: [
      { key: { session_id: 1, student_record_id: 1 }, name: "attendance_records_session_student_uq", unique: true },
      { key: { student_record_id: 1, created_at: -1 }, name: "attendance_records_student_idx" },
      { key: { offering_id: 1, session_id: 1 }, name: "attendance_records_offering_idx" },
    ],
  },
  {
    name: "assignments",
    properties: {
      offering_id: oid,
      title: text(1, 160),
      instructions: { bsonType: "string", maxLength: 10000 },
      due_at: date,
      status: oneOf("draft", "published"),
      created_by: oid,
      ...stamps,
    },
    required: ["offering_id", "title", "instructions", "due_at", "status", "created_by", "created_at", "updated_at"],
    indexes: [
      { key: { offering_id: 1, due_at: 1 }, name: "assignments_offering_due_idx" },
      { key: { status: 1, due_at: 1 }, name: "assignments_status_due_idx" },
    ],
  },
  {
    name: "locks",
    properties: { _id: { bsonType: "string" }, version: { bsonType: ["int", "long"] }, updated_at: date },
    required: ["version", "updated_at"],
    indexes: [],
  },
];

export function buildValidator(spec: CollectionSpec): Document {
  const validator: Document = {
    $jsonSchema: {
      bsonType: "object",
      required: spec.required,
      additionalProperties: false,
      properties: { _id: oid, ...spec.properties },
    },
  };
  if (spec.expr) validator.$expr = spec.expr;
  return validator;
}

export const AUTH_INDEXES: Array<{ collection: string; indexes: IndexDescription[] }> = [
  { collection: "user", indexes: [{ key: { email: 1 }, name: "auth_user_email_uq", unique: true }] },
  {
    collection: "session",
    indexes: [
      { key: { token: 1 }, name: "auth_session_token_uq", unique: true },
      { key: { userId: 1 }, name: "auth_session_user_idx" },
      { key: { expiresAt: 1 }, name: "auth_session_expires_ttl", expireAfterSeconds: 0 },
    ],
  },
  {
    collection: "account",
    indexes: [
      { key: { userId: 1 }, name: "auth_account_user_idx" },
      { key: { providerId: 1, accountId: 1 }, name: "auth_account_provider_uq", unique: true },
    ],
  },
  { collection: "verification", indexes: [{ key: { identifier: 1 }, name: "auth_verification_identifier_idx" }] },
];

