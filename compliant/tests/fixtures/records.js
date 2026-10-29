import { FakeObjectId as Id, clone } from "./mongo.js";

// Deliberately small fake: tests query intent/control flow, not MongoDB semantics.
export function recordFixture() {
  const ids = { admin: "a".repeat(24), student: "b".repeat(24), other: "c".repeat(24), teacher: "d".repeat(24),
    record: "e".repeat(24), otherRecord: "f".repeat(24), program: "1".repeat(24) };
  let state = { user: [], user_roles: [], profiles: [], student_records: [], audit_events: [], programs: [], enrolments: [], course_offerings: [], subjects: [], academic_terms: [] };
  for (const name of ["admin", "student", "other", "teacher"]) {
    state.user.push({ _id: new Id(ids[name]), email: `${name}@example.test` });
    state.profiles.push({ _id: new Id(ids[name]), display_name: name === "student" ? "Student One" : name });
    state.user_roles.push({ user_id: new Id(ids[name]), role: name === "other" ? "student" : name, scope: name === "other" ? "other" : "demo" });
  }
  state.programs.push({ _id: new Id(ids.program), code: "BCA", name: "Applications" });
  for (const [name, record, reg] of [["student", "record", "REG.001"], ["other", "otherRecord", "OTHER-001"]]) {
    state.student_records.push({ _id: new Id(ids[record]), user_id: new Id(ids[name]), program_id: new Id(ids.program), registration_number: reg, status: "active" });
  }
  const calls = []; const controls = { failAudit: false, missing: ["enrolments"] };
  const equal = (a, b) => a instanceof Id && b instanceof Id ? a.value === b.value : a === b;
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => equal(row[key], value));
  const session = { async withTransaction(run) {
    const snapshot = clone(state);
    try { return await run(); } catch (error) { state = snapshot; throw error; }
  }, async endSession() { calls.push("endSession"); } };
  const client = { startSession: () => session };
  const db = { client,
    listCollections: () => ({ toArray: async () => Object.keys(state).filter((name) => !controls.missing.includes(name)).map((name) => ({ name, type: "collection" })) }),
    collection(name) { return {
      async findOne(filter, options) { calls.push({ name, operation: "findOne", filter, session: options?.session }); return clone(state[name].find((row) => matches(row, filter)) ?? null); },
      find(filter) { return { sort() { return this; }, limit(value) { this.bound = value; return this; }, async toArray() { return clone(state[name].filter((row) => matches(row, filter)).slice(0, this.bound)); } }; },
      aggregate(pipeline, options) {
        calls.push({ name, operation: "aggregate", pipeline, options });
        return { async toArray() {
          const scope = pipeline[2].$match.roles.$elemMatch.scope;
          let rows = state.student_records.filter((r) => matches(r, pipeline[0].$match)
            && state.user_roles.some((role) => equal(role.user_id, r.user_id) && role.role === "student" && role.scope === scope));
          const search = pipeline.find((step) => step.$match?.$or)?.$match.$or[0].registration_number;
          if (search) rows = rows.filter((r) => [r.registration_number, state.profiles.find((p) => equal(p._id, r.user_id))?.display_name ?? ""].some((v) => new RegExp(search.$regex, search.$options).test(v)));
          rows.sort((a, b) => a.registration_number.localeCompare(b.registration_number));
          const offset = pipeline.find((step) => "$skip" in step).$skip;
          const limit = pipeline.find((step) => "$limit" in step).$limit;
          return clone(rows.slice(offset, offset + limit));
        } };
      },
      async updateOne(filter, update, options) {
        calls.push({ name, operation: "updateOne", filter, update, session: options.session });
        const row = state[name].find((item) => matches(item, filter));
        if (row) Object.assign(row, clone(update.$set));
        return { matchedCount: row ? 1 : 0 };
      },
      async insertOne(row, options) {
        calls.push({ name, operation: "insertOne", session: options.session });
        if (controls.failAudit) throw new Error("synthetic private database error");
        state[name].push(clone(row)); return { insertedId: row._id };
      },
    }; },
  };
  return { ids, db, client, ObjectId: Id, controls, calls, get state() { return state; }, session };
}
