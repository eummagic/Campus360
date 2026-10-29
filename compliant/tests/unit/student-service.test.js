import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "../../server/auth/hash-password.js";
import { verifyLegacyPassword } from "../../server/auth/passwords.js";
import { createStudentService, validateStudent, StudentError } from "../../server/students/service.js";

const input = { name: " New Student ", email: " New@example.test ", password: "Synthetic!2026",
  registrationNumber: " reg-001 ", programId: "0123456789abcdef01234567" };

test("new credential hashes use random salts and remain compatible with the legacy verifier", async () => {
  const first = await hashPassword(input.password);
  const second = await hashPassword(input.password);
  assert.ok(first !== second);
  assert.equal(await verifyLegacyPassword(first, input.password), true);
  assert.equal(await verifyLegacyPassword(first, "wrong-password"), false);
  const unicode = await hashPassword("Fullwidth-１２３４５６７８");
  assert.equal(await verifyLegacyPassword(unicode, "Fullwidth-12345678"), true);
});

test("new password policy rejects invalid inputs without altering existing credentials", async () => {
  for (const value of [null, "short", " ".repeat(8), "x".repeat(129), "password\n"]) {
    await assert.rejects(hashPassword(value), TypeError);
  }
});

test("student validation normalizes identifiers but never trims the password", () => {
  const result = validateStudent({ ...input, password: "  synthetic secret  " });
  assert.equal(result.name, "New Student");
  assert.equal(result.email, "new@example.test");
  assert.equal(result.registrationNumber, "REG-001");
  assert.equal(result.password, "  synthetic secret  ");
});

test("student validation rejects forged authority, invalid inputs and incomplete bodies", () => {
  for (const changes of [{ role: "admin" }, { userId: "forged" }, { name: " " }, { email: "bad" },
    { registrationNumber: "bad registration" }, { programId: "x" }, { password: "short" }]) {
    assert.throws(() => validateStudent({ ...input, ...changes }), { status: 400 });
  }
  assert.throws(() => validateStudent({}), { status: 400 });
});

test("service forwards only hashed credentials and the server-derived actor", async () => {
  let received;
  const service = createStudentService({ repository: {
    async createStudent(actor, student) { received = { actor, student }; return { userId: "created" }; },
    async listStudents() {}, async listPrograms() {}, async getStudent() {},
  }, hash: async () => "synthetic-hash" });
  assert.deepStrictEqual(await service.create({ user: { id: "server-actor" } }, input), { userId: "created" });
  assert.equal(received.actor, "server-actor");
  assert.equal(received.student.passwordHash, "synthetic-hash");
  assert.equal("password" in received.student, false);
});

test("service maps duplicates and database failures to useful safe errors", async () => {
  let failure;
  const fail = async () => { throw failure; };
  const service = createStudentService({ repository: { createStudent: fail, listStudents: fail, listPrograms: fail, getStudent: fail }, hash: async () => "hash" });
  failure = Object.assign(new Error("private database detail"), { code: 11000, keyPattern: { registration_number: 1 } });
  await assert.rejects(service.create({ user: { id: "actor" } }, input), { status: 409, message: "Registration number is already in use." });
  failure = new Error("private database detail");
  await assert.rejects(service.list({ user: { id: "actor" } }), { status: 503, message: "Student information is temporarily unavailable." });
  failure = new StudentError(403, "Not authorized.");
  await assert.rejects(service.programs({ user: { id: "actor" } }), { status: 403 });
});

test("student creation bounds concurrent password work and releases capacity after failure", async () => {
  const releases = [];
  const service = createStudentService({ repository: {
    async createStudent() { throw new Error("synthetic failure"); },
    async listStudents() {}, async listPrograms() {}, async getStudent() {},
  }, hash: () => new Promise((resolve) => releases.push(resolve)) });
  const context = { user: { id: "actor" } };
  const one = service.create(context, input);
  const two = service.create(context, input);
  await assert.rejects(service.create(context, input), { status: 429 });
  releases.forEach((release) => release("hash"));
  await assert.rejects(one, { status: 503 });
  await assert.rejects(two, { status: 503 });
  const third = service.create(context, input);
  assert.equal(releases.length, 3);
  releases[2]("hash");
  await assert.rejects(third, { status: 503 });
});
