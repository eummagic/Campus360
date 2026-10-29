import assert from "node:assert/strict";
import test from "node:test";
import { SESSION_TTL_MS, isValidSessionToken } from "../../server/auth/session.js";
import { AUTH_INDEXES, COLLECTIONS, buildValidator } from "../../server/db/schema.js";

const legacyCollections = structuredClone(COLLECTIONS);
const legacyAuthIndexes = structuredClone(AUTH_INDEXES);
const { APP_SESSIONS_SPEC, APP_SESSIONS_VALIDATOR } = await import(
  "../../server/db/app-sessions-schema.js"
);

// Independent, complete oracle: do not derive expected constraints from exports.
const expectedValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "user_id", "token_hash", "csrf_token", "created_at", "expires_at"],
    additionalProperties: false,
    properties: {
      _id: { bsonType: "objectId" },
      user_id: { bsonType: "objectId" },
      token_hash: {
        bsonType: "string", minLength: 64, maxLength: 64,
        pattern: "^[0-9a-f]{64}$",
      },
      csrf_token: {
        bsonType: "string", minLength: 43, maxLength: 43,
        pattern: "^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$",
      },
      created_at: { bsonType: "date" },
      expires_at: { bsonType: "date" },
    },
  },
  $expr: {
    $cond: [
      { $and: [
        { $eq: [{ $type: "$created_at" }, "date"] },
        { $eq: [{ $type: "$expires_at" }, "date"] },
      ] },
      { $and: [
        { $gt: ["$expires_at", "$created_at"] },
        { $lte: [{ $subtract: ["$expires_at", "$created_at"] }, 28_800_000] },
      ] },
      false,
    ],
  },
};
const expectedIndexes = [
  { key: { token_hash: 1 }, name: "app_sessions_token_hash_uq", unique: true },
  { key: { user_id: 1 }, name: "app_sessions_user_idx" },
  { key: { expires_at: 1 }, name: "app_sessions_expires_ttl", expireAfterSeconds: 0 },
];

test("app_sessions stays separate and leaves all legacy definitions unchanged", () => {
  assert.equal(APP_SESSIONS_SPEC.name, "app_sessions");
  assert.equal(COLLECTIONS.length, 16);
  assert.deepStrictEqual(COLLECTIONS, legacyCollections);
  assert.deepStrictEqual(AUTH_INDEXES, legacyAuthIndexes);
  assert.equal(COLLECTIONS.some(({ name }) => name === "app_sessions"), false);
  assert.equal(AUTH_INDEXES.some(({ collection }) => collection === "app_sessions"), false);
});

test("complete validator preserves required BSON fields, formats, and lifetime expression", () => {
  assert.deepStrictEqual(APP_SESSIONS_VALIDATOR, expectedValidator);
  assert.deepStrictEqual(buildValidator(APP_SESSIONS_SPEC), expectedValidator);
});

test("complete collection specification includes only the approved definitions", () => {
  assert.deepStrictEqual(APP_SESSIONS_SPEC, {
    name: "app_sessions",
    properties: expectedValidator.$jsonSchema.properties,
    required: expectedValidator.$jsonSchema.required,
    expr: expectedValidator.$expr,
    indexes: expectedIndexes,
  });
});

test("exactly three index definitions preserve every key and option", () => {
  assert.deepStrictEqual(APP_SESSIONS_SPEC.indexes, expectedIndexes);
});

for (const [index, expected] of expectedIndexes.entries()) {
  test(`${expected.name} preserves ordered keys and all options`, () => {
    const actual = APP_SESSIONS_SPEC.indexes[index];
    assert.deepStrictEqual(Object.entries(actual.key), Object.entries(expected.key));
    assert.deepStrictEqual(actual, expected);
  });
}

function matchesStringConstraint(field, value) {
  const constraint = APP_SESSIONS_VALIDATOR.$jsonSchema.properties[field];
  return typeof value === "string" && value.length >= constraint.minLength
    && value.length <= constraint.maxLength && new RegExp(constraint.pattern).test(value);
}

test("token hashes accept only exactly 64 lowercase hexadecimal characters", () => {
  for (const value of ["0".repeat(64), "0123456789abcdef".repeat(4)]) {
    assert.equal(matchesStringConstraint("token_hash", value), true);
  }
  for (const value of [null, 0, "", "a".repeat(63), "a".repeat(65),
    "A".repeat(64), "g".repeat(64), "0".repeat(63) + "\n", "0".repeat(64) + "\n"]) {
    assert.equal(matchesStringConstraint("token_hash", value), false);
  }
});

test("CSRF format accepts canonical encodings of 32 synthetic bytes", () => {
  for (let byte = 0; byte < 256; byte += 1) {
    const token = Buffer.alloc(32, byte).toString("base64url");
    assert.equal(matchesStringConstraint("csrf_token", token), true);
    assert.equal(isValidSessionToken(token), true);
  }
});

test("CSRF format rejects all noncanonical final padding-bit combinations", () => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (const [index, character] of [...alphabet].entries()) {
    const token = "A".repeat(42) + character;
    assert.equal(matchesStringConstraint("csrf_token", token), index % 4 === 0);
    assert.equal(matchesStringConstraint("csrf_token", token), isValidSessionToken(token));
  }
});

test("CSRF format rejects invalid lengths, padding, whitespace, and non-URL characters", () => {
  for (const value of [null, 0, "", "A".repeat(42), "A".repeat(44),
    "A".repeat(42) + "=", "A".repeat(42) + "+", "A".repeat(42) + "/",
    "A".repeat(42) + "\n", "A".repeat(43) + "\n", " " + "A".repeat(42)]) {
    assert.equal(matchesStringConstraint("csrf_token", value), false);
  }
});

// Small expression model for boundary tests, not a BSON validator or a MongoDB
// integration test. Unsupported operators fail rather than being ignored.
function evaluate(expression, document) {
  if (typeof expression === "string" && expression.startsWith("$")) {
    return document[expression.slice(1)];
  }
  if (expression === null || typeof expression !== "object") return expression;
  assert.equal(Object.keys(expression).length, 1);
  const [operator, operands] = Object.entries(expression)[0];
  const values = () => operands.map((operand) => evaluate(operand, document));
  switch (operator) {
    case "$cond": return evaluate(operands[evaluate(operands[0], document) ? 1 : 2], document);
    case "$and": return values().every(Boolean);
    case "$type": {
      const value = evaluate(operands, document);
      return value instanceof Date ? "date" : typeof value;
    }
    case "$eq": { const [a, b] = values(); return a === b; }
    case "$gt": { const [a, b] = values(); return a > b; }
    case "$lte": { const [a, b] = values(); return a <= b; }
    case "$subtract": {
      const [a, b] = values();
      assert.ok(a instanceof Date && b instanceof Date, "arithmetic must be guarded by BSON date checks");
      return a.getTime() - b.getTime();
    }
    default: throw new Error(`Unsupported expression operator: ${operator}`);
  }
}

test("session lifetime constant is exactly eight hours in milliseconds", () => {
  assert.equal(SESSION_TTL_MS, 28_800_000);
});

for (const [label, duration, expected] of [
  ["negative", -1, false],
  ["zero", 0, false],
  ["one millisecond", 1, true],
  ["just under eight hours", 28_799_999, true],
  ["exactly eight hours", 28_800_000, true],
  ["one millisecond over eight hours", 28_800_001, false],
]) {
  test(`lifetime expression handles ${label}`, () => {
    const createdAt = Date.UTC(2026, 9, 26);
    assert.equal(evaluate(APP_SESSIONS_VALIDATOR.$expr, {
      created_at: new Date(createdAt), expires_at: new Date(createdAt + duration),
    }), expected);
  });
}

test("lifetime expression rejects missing and non-date operands without unsafe arithmetic", () => {
  const date = new Date(Date.UTC(2026, 9, 26));
  for (const value of [undefined, null, date.toISOString(), date.getTime(), {}, []]) {
    assert.equal(evaluate(APP_SESSIONS_VALIDATOR.$expr, { created_at: value, expires_at: date }), false);
    assert.equal(evaluate(APP_SESSIONS_VALIDATOR.$expr, { created_at: date, expires_at: value }), false);
  }
  assert.equal(evaluate(APP_SESSIONS_VALIDATOR.$expr, {}), false);
});
