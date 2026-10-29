import assert from "node:assert/strict";
import test from "node:test";
import { BSON } from "mongodb";
import { validateAcademicInput, validateAcademicQuery, createAcademicManagementService } from "../../server/academics/management-service.js";
import { createMongoAcademicManagementRepository } from "../../server/db/academic-management-repository.js";
import { academicManagementFixture } from "../fixtures/academic-management.js";

const term = { name: "Semester 1", starts_on: "2026-10-29", ends_on: "2027-03-01", status: "planned" };
function setup() {
  const f = academicManagementFixture(); const context = { user: { id: f.actorId }, roles: [{ role: "admin", scope: "demo" }] };
  const repository = createMongoAcademicManagementRepository({ ...f, adminScope: "demo", now: () => 1793203200000 });
  return { f, context, repository, service: createAcademicManagementService({ repository, adminScope: "demo" }) };
}
const subject = (f) => ({ program_id: f.programId, code: "CS101", name: "Computing", credits: 4, status: "active" });

test("term input preserves the existing nullable dates, enum and calendar/order constraints", () => {
  assert.equal(validateAcademicInput("terms", { ...term, name: "  Semester 1  " }).name, term.name);
  assert.equal(validateAcademicInput("terms", { ...term, starts_on: null, ends_on: null }).ends_on, null);
  assert.equal(validateAcademicInput("terms", { ...term, starts_on: "2028-02-29", ends_on: null }).starts_on, "2028-02-29");
  for (const change of [{ name: " " }, { name: "x".repeat(81) }, { name: "x\n" }, { starts_on: "2026-02-30" }, { starts_on: "2026-2-1" }, { starts_on: 0 }, { starts_on: "2027-04-01" }, { status: "inactive" }, { actor_id: "forged" }]) {
    assert.throws(() => validateAcademicInput("terms", { ...term, ...change }), { status: 400 });
  }
  for (const value of [null, [], {}, { ...term, starts_on: undefined }]) assert.throws(() => validateAcademicInput("terms", value), { status: 400 });
});
test("subjects require exact ObjectId text, bounded integer credits and only permitted fields", () => {
  const f = academicManagementFixture();
  for (const credits of [0, 60, null]) assert.equal(validateAcademicInput("subjects", { ...subject(f), credits }).credits, credits);
  for (const change of [{ program_id: "B".repeat(24) }, { program_id: { $ne: null } }, { credits: "4" }, { credits: 1.5 }, { credits: -1 }, { credits: 61 }, { status: "closed" }, { code: "x".repeat(33) }, { name: "x".repeat(201) }, { created_at: "forged" }]) {
    assert.throws(() => validateAcademicInput("subjects", { ...subject(f), ...change }), { status: 400 });
  }
  // Driver serialization only, no connection: small integer credits become BSON int32.
  assert.equal(BSON.deserialize(BSON.serialize({ credits: 4 }), { promoteValues: false }).credits._bsontype, "Int32");
});
test("list queries are bounded and reject operators, repeats and extra fields", () => {
  assert.deepEqual(validateAcademicQuery({}), { offset: 0, limit: 50 });
  assert.equal(validateAcademicQuery({ offset: "1000" }).offset, 1000);
  for (const input of [{ offset: "1001" }, { offset: "-1" }, { offset: "01" }, { offset: ["0", "50"] }, { offset: { $gt: 0 } }, { limit: "10000" }]) assert.throws(() => validateAcademicQuery(input), { status: 400 });
});
test("service denies unauthorized roles/scopes before reads and masks infrastructure errors", async () => {
  let calls = 0; const service = createAcademicManagementService({ adminScope: "demo", repository: { list() { calls++; throw Error("private URI"); }, create() { calls++; throw Error("private URI"); } } });
  for (const context of [undefined, { user: { id: "forged" }, roles: [{ role: "student", scope: "demo" }] }, { user: { id: "forged" }, roles: [{ role: "teacher", scope: "demo" }] }, { user: { id: "forged" }, roles: [{ role: "admin", scope: null }] }]) {
    await assert.rejects(service.list(context, "terms", {}), (e) => [401, 403].includes(e.status));
    await assert.rejects(service.create(context, "terms", term), (e) => [401, 403].includes(e.status));
  }
  assert.equal(calls, 0);
  const context = { user: { id: "admin" }, roles: [{ role: "admin", scope: "demo" }] };
  await assert.rejects(service.list(context, "terms", {}), (e) => e.status === 503 && !e.message.includes("private"));
});
test("repository creates exact documents and audit sequentially in one fake transaction", async () => {
  const { f, context, service } = setup();
  const created = await service.create(context, "terms", term);
  assert.deepEqual(created.record, { id: f.state.academic_terms[0]._id.toHexString(), ...term });
  const added = await service.create(context, "subjects", subject(f));
  assert.equal(added.record.program_id, f.programId);
  assert.ok(f.state.subjects[0].program_id instanceof f.ObjectId);
  assert.deepEqual(Object.keys(f.state.subjects[0]).sort(), ["_id", "program_id", "code", "name", "credits", "status", "created_at", "updated_at"].sort());
  assert.deepEqual(f.calls.filter((c) => c.operation === "insertOne").map((c) => c.name), ["academic_terms", "audit_events", "subjects", "audit_events"]);
  for (const c of f.calls.filter((c) => c.operation === "insertOne")) assert.equal(c.session, f.session);
  assert.equal(f.state.audit_events[1].actor_id.toHexString(), f.actorId);
  assert.equal(f.state.audit_events[1].entity_id.toHexString(), added.record.id);
  assert.equal(f.state.audit_events[1].action, "academic.subject.created");
  assert.equal(f.calls.find((c) => c.operation === "transaction").options.writeConcern.w, "majority");
  assert.equal((await service.list(context, "terms", {})).records.length, 1);
});
test("missing/unsafe academic schema or indexes refuse before any writes", async () => {
  for (const defect of ["missing", "validator", "view", "warning", "options", "unique", "keys", "sparse", "hidden", "extra", "audit"]) {
    const { f, context, service } = setup(); const info = f.metadata.find((r) => r.name === "academic_terms");
    if (defect === "missing") f.metadata.splice(f.metadata.indexOf(info), 1);
    if (defect === "validator") info.options.validator = {};
    if (defect === "view") info.type = "view";
    if (defect === "warning") info.options.validationAction = "warn";
    if (defect === "options") info.options.capped = true;
    if (defect === "unique") f.indexes.academic_terms[1].unique = false;
    if (defect === "keys") f.indexes.academic_terms[1].key = { status: 1 };
    if (defect === "sparse") f.indexes.academic_terms[1].sparse = true;
    if (defect === "hidden") f.indexes.academic_terms[1].hidden = true;
    if (defect === "extra") f.indexes.academic_terms.push({ name: "extra", key: { status: 1 } });
    if (defect === "audit") f.metadata.find((r) => r.name === "audit_events").options.validator = {};
    await assert.rejects(service.create(context, "terms", term), { status: 503 });
    assert.equal(f.calls.some((c) => c.operation === "insertOne"), false, defect);
    if (defect !== "audit") await assert.rejects(service.list(context, "terms", {}), { status: 503 });
  }
});
test("database duplicate errors preserve one resource/audit; audit failures roll back in the fake model", async () => {
  const { f, context, service } = setup(); await service.create(context, "terms", term);
  await assert.rejects(service.create(context, "terms", term), { status: 409 });
  assert.equal(f.state.academic_terms.length, 1); assert.equal(f.state.audit_events.length, 1);
  await service.create(context, "subjects", subject(f));
  await assert.rejects(service.create(context, "subjects", subject(f)), { status: 409 });
  for (const failure of ["failAudit", "auditDuplicate", "insertFailure", "idDuplicate"]) {
    f.controls[failure] = true;
    await assert.rejects(service.create(context, "terms", { ...term, name: failure }), { status: 503 });
    f.controls[failure] = false;
    assert.equal(f.state.academic_terms.length, 1); assert.equal(f.state.audit_events.length, 2);
  }
});
test("repository rechecks scope in the transaction and refuses invalid or inactive programs", async () => {
  const { f, context, service, repository } = setup();
  await assert.rejects(repository.list("not-an-id", "terms", { limit: 50, offset: 0 }), { status: 403 });
  f.controls.revokeInTransaction = true;
  await assert.rejects(service.create(context, "terms", term), { status: 403 });
  assert.equal(f.state.academic_terms.length, 0); f.controls.revokeInTransaction = false;
  f.state.programs[0].status = "inactive";
  await assert.rejects(service.create(context, "subjects", subject(f)), { status: 400 });
  assert.equal(f.state.subjects.length, 0); assert.equal(f.state.audit_events.length, 0);
  f.state.user_roles[0].scope = "other";
  await assert.rejects(service.list(context, "terms", {}), { status: 403 });
});
test("native list applies a stable sort, hard limit and explicit offset", async () => {
  const { f, context, service } = setup();
  for (let n = 0; n < 51; n++) f.state.academic_terms.push({ _id: new f.ObjectId(), ...term, name: "Term " + String(n).padStart(2, "0") });
  const first = await service.list(context, "terms", {});
  assert.equal(first.records.length, 50); assert.equal(first.hasMore, true);
  assert.deepEqual(f.calls.find((c) => c.operation === "page"), { name: "academic_terms", operation: "page", offset: 0, limit: 51 });
  const next = await service.list(context, "terms", { offset: "50" });
  assert.equal(next.records.length, 1); assert.equal(next.hasMore, false);
});

test("inconsistent stored rows are infrastructure failures rather than client input errors", async () => {
  const { f, context, service } = setup();
  f.state.academic_terms.push({ _id: new f.ObjectId(), ...term, starts_on: "2026-02-30" });
  await assert.rejects(service.list(context, "terms", {}), { status: 503 });
});

test("subject audit failure restores both collections in the fake transaction model", async () => {
  const { f, context, service } = setup(); f.controls.failAudit = true;
  await assert.rejects(service.create(context, "subjects", subject(f)), { status: 503 });
  assert.equal(f.state.subjects.length, 0); assert.equal(f.state.audit_events.length, 0);
});

test("management factories reject missing repository/connection configuration", () => {
  assert.throws(() => createAcademicManagementService(), TypeError);
  assert.throws(() => createMongoAcademicManagementRepository(), TypeError);
  const f = academicManagementFixture();
  assert.throws(() => createMongoAcademicManagementRepository({ ...f, client: {} }), TypeError);
});
