import assert from "node:assert/strict";
import test from "node:test";
import { createAcademicPolicy } from "../../server/access/academic.js";
import { createAcademicService } from "../../server/academics/service.js";
import { createMongoAcademicRepository, DEFERRED_ACADEMIC_COLLECTIONS } from "../../server/db/academic-repository.js";

const context = (role = "admin", scope = "demo") => ({ user: { id: "a".repeat(24) }, roles: [{ role, scope }] });
test("academic policy requires authentication and the exact configured administrator scope", () => {
  const allow = createAcademicPolicy("demo");
  assert.throws(() => allow(null), { status: 401 });
  for (const ctx of [context("student"), context("teacher"), context("admin", null), context("admin", "other")]) {
    assert.throws(() => allow(ctx), { status: 403 });
  }
  allow(context());
  createAcademicPolicy(null)(context("admin", null));
  assert.throws(() => createAcademicPolicy(""), TypeError);
});
test("service denies before reads and masks repository failures", async () => {
  let reads = 0;
  const service = createAcademicService({ adminScope: "demo", repository: { async readOverview(id) {
    reads++; assert.equal(id, context().user.id); throw new Error("private connection detail");
  } } });
  await assert.rejects(service.overview(context("student")), { status: 403 });
  assert.equal(reads, 0);
  await assert.rejects(service.overview(context()), { message: "Academic overview unavailable. Check database configuration and required collections." });
  assert.equal(reads, 1);
  assert.throws(() => createAcademicService(), TypeError);
});

// Fake BSON/collections verify mapping and query intent, not MongoDB guarantees.
class Id { constructor(value) { this.value = value; } toHexString() { return this.value; } }
function fixture() {
  const state = { allowed: true, present: ["departments", "programs", "subjects"], reads: [],
    departments: [{ _id: new Id("b".repeat(24)), code: "CS", name: "Computing", status: "active", private: "omit" }],
    programs: [{ _id: new Id("c".repeat(24)), department_id: new Id("b".repeat(24)), code: "BCA", name: "Applications", status: "active", private: "omit" }] };
  const db = {
    listCollections(filter, options) {
      assert.equal(options.nameOnly, true);
      assert.deepEqual(filter.name.$in, ["departments", "programs", ...DEFERRED_ACADEMIC_COLLECTIONS]);
      return { async toArray() { return state.present.map((name) => ({ name, type: "collection" })); } };
    },
    collection(name) { return {
      async findOne(filter) {
        assert.ok((filter._id ?? filter.user_id) instanceof Id);
        if (name === "user_roles") assert.deepEqual({ role: filter.role, scope: filter.scope }, { role: "admin", scope: "demo" });
        return state.allowed ? { _id: new Id("a".repeat(24)) } : null;
      },
      find(filter, options) {
        state.reads.push(name);
        assert.deepEqual(filter, {});
        assert.equal(options.projection.name, 1);
        return { sort(keys) { assert.deepEqual(keys, { code: 1, _id: 1 }); return this; },
          limit(value) { assert.equal(value, 501); return this; }, async toArray() { return state[name]; } };
      },
    }; },
  };
  return { state, repository: createMongoAcademicRepository({ db, ObjectId: Id, adminScope: "demo" }) };
}
test("repository maps references and allowlists fields; checks availability without reading optional records", async () => {
  const { state, repository } = fixture();
  const result = await repository.readOverview(context().user.id);
  assert.deepEqual(result.departments, [{ id: "b".repeat(24), code: "CS", name: "Computing", status: "active" }]);
  assert.deepEqual(result.programs, [{ id: "c".repeat(24), departmentId: "b".repeat(24), code: "BCA", name: "Applications", status: "active" }]);
  assert.deepEqual(state.reads, ["departments", "programs"]);
  assert.equal(result.otherCollections.find((row) => row.name === "subjects").status, "not_included");
  assert.equal(result.otherCollections.find((row) => row.name === "enrolments").status, "not_provisioned");
  assert.equal(result.otherCollections.length, DEFERRED_ACADEMIC_COLLECTIONS.length);
});
test("repository refuses missing collections, revoked authority, invalid IDs and broken references", async () => {
  const { state, repository } = fixture();
  await assert.rejects(repository.readOverview("invalid"), { status: 403 });
  state.allowed = false;
  await assert.rejects(repository.readOverview(context().user.id), { status: 403 });
  assert.deepEqual(state.reads, []);
  state.allowed = true; state.present = ["programs"];
  await assert.rejects(repository.readOverview(context().user.id), /Missing required/);
  state.present = ["departments", "programs"];
  state.programs[0].department_id = new Id("d".repeat(24));
  await assert.rejects(repository.readOverview(context().user.id), /Unlinked program/);
  state.programs[0].department_id = "b".repeat(24);
  await assert.rejects(repository.readOverview(context().user.id), /Inconsistent academic/);
  assert.throws(() => createMongoAcademicRepository(), TypeError);
});

test("repository distinguishes empty provisioned collections and refuses silently truncated overviews", async () => {
  const { state, repository } = fixture();
  state.departments = []; state.programs = [];
  const result = await repository.readOverview(context().user.id);
  assert.deepEqual(result.departments, []);
  assert.deepEqual(result.programs, []);
  state.departments = Array(501).fill({});
  await assert.rejects(repository.readOverview(context().user.id), /capacity exceeded/);
});
