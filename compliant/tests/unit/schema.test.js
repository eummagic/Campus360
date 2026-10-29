import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  AUTH_INDEXES,
  COLLECTIONS,
  buildValidator,
} from "../../server/db/schema.js";

// Test-only oracle: Node strips types from the unchanged legacy source in
// memory. The application schema itself is ordinary dependency-free JS.
// The VM is given no application helpers, module loader, or database client.
// Unexpected runtime imports/exports fail instead of being silently removed.
const sourceUrl = new URL("../../../scripts/mongo/schema.ts", import.meta.url);
const sourceText = readFileSync(sourceUrl, "utf8");
const referenceJavaScript = stripTypeScriptTypes(sourceText).replace(
  /^export (?=(?:const|function) )/gm,
  "",
);
const reference = runInNewContext(
  `${referenceJavaScript}\n({ COLLECTIONS, AUTH_INDEXES, buildValidator });`,
  {},
  { timeout: 1000, filename: sourceUrl.pathname },
);

// Move reference data out of its VM realm without JSON serialization, which
// could hide differences such as missing fields versus explicit undefined.
const expectedCollections = structuredClone(reference.COLLECTIONS);
const expectedAuthIndexes = structuredClone(reference.AUTH_INDEXES);

function compareIndexes(actual, expected, label) {
  // Includes every option, not just name/unique: TTL, directions, and any
  // future options must remain identical. Omitted unique is not false.
  assert.deepStrictEqual(actual, expected, `${label}: full index definitions`);
  for (const [index, definition] of actual.entries()) {
    // Object deep equality ignores property order; compound index order matters.
    assert.deepStrictEqual(
      Object.entries(definition.key),
      Object.entries(expected[index].key),
      `${label}.${definition.name}: ordered compound keys`,
    );
  }
}

test("preserves the exact application collection names and order", () => {
  const names = [
    "profiles",
    "user_roles",
    "audit_events",
    "departments",
    "programs",
    "academic_terms",
    "subjects",
    "course_offerings",
    "teaching_assignments",
    "student_records",
    "enrolments",
    "timetable_entries",
    "attendance_sessions",
    "attendance_records",
    "assignments",
    "locks",
  ];
  assert.deepStrictEqual(expectedCollections.map((spec) => spec.name), names);
  assert.deepStrictEqual(COLLECTIONS.map((spec) => spec.name), names);
});

test("all application definitions deeply equal the existing TypeScript source", () => {
  assert.deepStrictEqual(COLLECTIONS, expectedCollections);
});

for (const [index, expected] of expectedCollections.entries()) {
  test(`preserves the full generated validator for ${expected.name}`, () => {
    const validator = buildValidator(COLLECTIONS[index]);
    const expectedValidator = structuredClone(
      reference.buildValidator(reference.COLLECTIONS[index]),
    );
    assert.deepStrictEqual(validator, expectedValidator);
    assert.equal(validator.$jsonSchema.additionalProperties, false);
    assert.deepStrictEqual(validator.$jsonSchema.required, expected.required);
  });
}

test("application index keys, key order, uniqueness, and other options match source", () => {
  for (const [index, spec] of COLLECTIONS.entries()) {
    compareIndexes(spec.indexes, expectedCollections[index].indexes, spec.name);
  }
});

test("authentication collection names and complete index definitions match source", () => {
  assert.deepStrictEqual(AUTH_INDEXES, expectedAuthIndexes);
  assert.deepStrictEqual(
    AUTH_INDEXES.map((group) => group.collection),
    ["user", "session", "account", "verification"],
  );
  for (const [index, group] of AUTH_INDEXES.entries()) {
    compareIndexes(group.indexes, expectedAuthIndexes[index].indexes, group.collection);
  }
});

test("preserves student record field types, required fields, and registration bounds", () => {
  const student = COLLECTIONS.find((spec) => spec.name === "student_records");
  assert.deepStrictEqual(buildValidator(student), {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "user_id",
        "registration_number",
        "program_id",
        "status",
        "created_at",
        "updated_at",
      ],
      additionalProperties: false,
      properties: {
        _id: { bsonType: "objectId" },
        user_id: { bsonType: "objectId" },
        registration_number: {
          bsonType: "string",
          minLength: 1,
          maxLength: 40,
          pattern: "\\S",
        },
        program_id: { bsonType: "objectId" },
        status: { bsonType: "string", enum: ["active", "inactive", "graduated"] },
        created_at: { bsonType: "date" },
        updated_at: { bsonType: "date" },
      },
    },
  });
});

test("preserves separate unique constraints for student account and registration", () => {
  const student = COLLECTIONS.find((spec) => spec.name === "student_records");
  assert.deepStrictEqual(student.indexes.filter((index) => index.unique), [
    { key: { user_id: 1 }, name: "student_records_user_uq", unique: true },
    {
      key: { registration_number: 1 },
      name: "student_records_registration_uq",
      unique: true,
    },
  ]);
});

test("preserves authentication uniqueness and session TTL options", () => {
  const indexes = Object.fromEntries(
    AUTH_INDEXES.map((group) => [group.collection, group.indexes]),
  );
  assert.deepStrictEqual(indexes.user, [
    { key: { email: 1 }, name: "auth_user_email_uq", unique: true },
  ]);
  assert.deepStrictEqual(indexes.session, [
    { key: { token: 1 }, name: "auth_session_token_uq", unique: true },
    { key: { userId: 1 }, name: "auth_session_user_idx" },
    {
      key: { expiresAt: 1 },
      name: "auth_session_expires_ttl",
      expireAfterSeconds: 0,
    },
  ]);
  assert.deepStrictEqual(indexes.account, [
    { key: { userId: 1 }, name: "auth_account_user_idx" },
    {
      key: { providerId: 1, accountId: 1 },
      name: "auth_account_provider_uq",
      unique: true,
    },
  ]);
});

test("preserves academic-term and timetable cross-field expressions", () => {
  const term = COLLECTIONS.find((spec) => spec.name === "academic_terms");
  const timetable = COLLECTIONS.find((spec) => spec.name === "timetable_entries");
  assert.deepStrictEqual(buildValidator(term).$expr, {
    $or: [
      { $eq: ["$starts_on", null] },
      { $eq: ["$ends_on", null] },
      { $lte: ["$starts_on", "$ends_on"] },
    ],
  });
  assert.deepStrictEqual(buildValidator(timetable).$expr, {
    $gt: ["$end_minute", "$start_minute"],
  });
});

test("preserves the lock collection's string _id override", () => {
  const lock = COLLECTIONS.find((spec) => spec.name === "locks");
  assert.deepStrictEqual(buildValidator(lock).$jsonSchema.properties._id, {
    bsonType: "string",
  });
});
