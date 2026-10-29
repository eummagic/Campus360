import assert from "node:assert/strict";
import test from "node:test";
import { createDirectoryService, validateDirectoryQuery } from "../../server/students/directory-service.js";
import { createMongoStudentRepository } from "../../server/db/student-repository.js";
import { createMongoProfileRepository } from "../../server/db/profile-repository.js";
import { validateDisplayName, createProfileService } from "../../server/profile/service.js";
import { recordFixture } from "../fixtures/records.js";

test("directory validates scalar bounded filters and normalizes search/program identifiers", () => {
  assert.deepEqual(validateDirectoryQuery({ q: " Student ", programId: "A".repeat(24), offset: "50" }), { q: "Student", programId: "a".repeat(24), status: "", limit: 50, offset: 50 });
  for (const query of [{ q: [] }, { role: "admin" }, { scope: "demo" }, { q: "x".repeat(121) }, { q: "a\nb" }, { status: "owner" }, { programId: "invalid" }, { offset: "-1" }, { offset: "1001" }, { offset: "0.5" }]) assert.throws(() => validateDirectoryQuery(query), { status: 400 });
});
test("native directory query searches literal names/registrations, filters, and isolates target scopes", async () => {
  const f = recordFixture(); const repo = createMongoStudentRepository({ ...f, adminScope: "demo" });
  for (const q of ["Student One", "REG.001"]) {
    const result = await repo.searchDirectory(f.ids.admin, validateDirectoryQuery({ q, status: "active", programId: f.ids.program }));
    assert.equal(result.students.length, 1); assert.equal(result.students[0].id, f.ids.record);
  }
  assert.equal((await repo.searchDirectory(f.ids.admin, validateDirectoryQuery({ q: ".*" }))).students.length, 0);
  assert.equal((await repo.searchDirectory(f.ids.admin, validateDirectoryQuery({ status: "inactive" }))).students.length, 0);
  assert.equal((await repo.searchDirectory(f.ids.admin, validateDirectoryQuery({ offset: "50" }))).students.length, 0);
  const aggregate = f.calls.find((c) => c.operation === "aggregate");
  assert.deepEqual(aggregate.options, { maxTimeMS: 3000 });
  assert.equal(aggregate.pipeline.find((step) => "$limit" in step).$limit, 51);
  await assert.rejects(repo.searchDirectory(f.ids.teacher, validateDirectoryQuery()), { status: 403 });
});
test("detail repository permits own student and scoped admin only; absent enrolments stay explicit", async () => {
  const f = recordFixture(); const repo = createMongoStudentRepository({ ...f, adminScope: "demo" });
  for (const actor of [f.ids.admin, f.ids.student]) {
    const data = await repo.getStudentDetail(actor, f.ids.record);
    assert.equal(data.student.id, f.ids.record); assert.equal(data.enrolmentStatus, "not_provisioned");
    assert.deepEqual(data.missingCollections, ["enrolments"]);
  }
  await assert.rejects(repo.getStudentDetail(f.ids.student, f.ids.otherRecord), { status: 404 });
  await assert.rejects(repo.getStudentDetail(f.ids.admin, f.ids.otherRecord), { status: 404 });
  for (const actor of [f.ids.teacher, f.ids.other]) await assert.rejects(repo.getStudentDetail(actor, f.ids.record), { status: 403 });
  f.controls.missing = [];
  assert.equal((await repo.getStudentDetail(f.ids.student, f.ids.record)).enrolmentStatus, "available");
});
test("detail hydrates actual enrolments and rejects broken references", async () => {
  const f = recordFixture(); const oid = (x) => new f.ObjectId(x.repeat(24));
  f.controls.missing = [];
  f.state.enrolments.push({ _id: oid("2"), student_record_id: oid("e"), offering_id: oid("3"), enrolled_at: new Date(0) });
  f.state.course_offerings.push({ _id: oid("3"), subject_id: oid("4"), term_id: oid("5"), section_code: "A" });
  f.state.subjects.push({ _id: oid("4"), code: "CS1", name: "Computing", credits: 3 });
  f.state.academic_terms.push({ _id: oid("5"), name: "Term One" });
  const repo = createMongoStudentRepository({ ...f, adminScope: "demo" });
  const result = await repo.getStudentDetail(f.ids.student, f.ids.record);
  assert.equal(result.enrolments[0].subjectCode, "CS1"); assert.equal(result.enrolments[0].credits, 3);
  f.state.subjects.length = 0;
  await assert.rejects(repo.getStudentDetail(f.ids.student, f.ids.record), /Unlinked offering/);
});
test("display name validation rejects protected fields, empty/long/control values", () => {
  assert.equal(validateDisplayName({ displayName: "  New Name  " }), "New Name");
  for (const body of [null, [], {}, { displayName: 3 }, { displayName: " " }, { displayName: "x".repeat(121) }, { displayName: "a\nb" }, ...["email", "role", "scope", "userId", "registrationNumber", "programId"].map((key) => ({ displayName: "Name", [key]: "forged" }))]) assert.throws(() => validateDisplayName(body), { status: 400 });
});
test("profile repository updates only own profile and audit sequentially in the same transaction", async () => {
  const f = recordFixture(); const repo = createMongoProfileRepository(f);
  await repo.updateDisplayName(f.ids.student, "New Name");
  assert.equal(f.state.profiles.find((r) => r._id.value === f.ids.student).display_name, "New Name");
  assert.equal(f.state.profiles.find((r) => r._id.value === f.ids.admin).display_name, "admin");
  assert.equal(f.state.audit_events.length, 1);
  assert.deepEqual(f.state.audit_events[0].metadata, { before: "Student One", after: "New Name" });
  const writes = f.calls.filter((c) => ["updateOne", "insertOne"].includes(c.operation));
  assert.deepEqual(writes.map((c) => c.name), ["profiles", "audit_events"]);
  assert.ok(writes.every((c) => c.session === f.session));
  assert.deepEqual(Object.keys(writes[0].update.$set), ["display_name", "updated_at"]);
  assert.equal((await repo.updateDisplayName(f.ids.student, "New Name")).changed, false);
  assert.equal(f.state.audit_events.length, 1);
});
test("profile audit failure rolls back in fake transaction and returns a safe service error", async () => {
  const f = recordFixture(); f.controls.failAudit = true;
  const service = createProfileService({ repository: createMongoProfileRepository(f) });
  await assert.rejects(service.update({ user: { id: f.ids.student } }, { displayName: "Changed" }), { status: 503, message: "Profile update is temporarily unavailable." });
  assert.equal(f.state.profiles.find((r) => r._id.value === f.ids.student).display_name, "Student One");
  assert.equal(f.state.audit_events.length, 0); assert.equal(f.calls.at(-1), "endSession");
});
test("directory service denies roles/scopes before repository calls and masks infrastructure errors", async () => {
  let reads = 0; const service = createDirectoryService({ adminScope: "demo", repository: {
    async searchDirectory() { reads++; throw new Error("private"); }, async getStudentDetail() { reads++; return {}; },
  } });
  const context = (role, scope) => ({ user: { id: "server" }, roles: [{ role, scope }] });
  for (const [role, scope] of [["student", "demo"], ["teacher", "demo"], ["admin", "other"]]) assert.throws(() => service.search(context(role, scope), {}), { status: 403 });
  assert.throws(() => service.detail(context("teacher", "demo"), "e".repeat(24)), { status: 403 });
  assert.throws(() => service.detail(context("student", "demo"), "bad"), { status: 400 });
  assert.equal(reads, 0);
  await assert.rejects(service.search(context("admin", "demo"), {}), { status: 503 });
});
