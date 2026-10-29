import { COLLECTIONS, buildValidator } from "../../server/db/schema.js";
import { FakeObjectId as Id, clone } from "./mongo.js";

// A control-flow model only: it cannot establish real BSON/index/transaction guarantees.
export function academicManagementFixture() {
  const actorId = "a".repeat(24), programId = "b".repeat(24);
  let state = { user: [{ _id: new Id(actorId) }], user_roles: [{ user_id: new Id(actorId), role: "admin", scope: "demo" }],
    programs: [{ _id: new Id(programId), status: "active" }], academic_terms: [], subjects: [], audit_events: [] };
  const controls = { failAudit: false, auditDuplicate: false, insertFailure: false, idDuplicate: false, revokeInTransaction: false, failEndSession: false };
  const calls = [], metadata = [], indexes = {};
  for (const name of ["academic_terms", "subjects", "audit_events"]) {
    const spec = COLLECTIONS.find((item) => item.name === name);
    metadata.push({ name, type: "collection", options: { validator: buildValidator(spec), validationLevel: "strict", validationAction: "error" } });
    indexes[name] = [{ name: "_id_", key: { _id: 1 }, v: 2 }, ...clone(spec.indexes)];
  }
  const equal = (a, b) => a instanceof Id && b instanceof Id ? a.value === b.value : a === b;
  const matches = (row, query) => Object.entries(query).every(([key, value]) => equal(row[key], value));
  const session = { async withTransaction(run, options) {
    calls.push({ operation: "transaction", options }); const snapshot = clone(state);
    if (controls.revokeInTransaction) state.user_roles = [];
    try { return await run(); } catch (error) { state = snapshot; throw error; }
  }, async endSession() { calls.push({ operation: "endSession" }); if (controls.failEndSession) throw new Error("private cleanup detail"); } };
  const client = { startSession: () => session };
  const db = { client, listCollections: ({ name }) => ({ toArray: async () => clone(metadata.filter((row) => row.name === name)) }),
    collection(name) { return {
      indexes: async () => clone(indexes[name]),
      findOne: async (query, options) => { calls.push({ name, operation: "findOne", query, session: options?.session }); return clone(state[name].find((row) => matches(row, query)) ?? null); },
      find(query, options) { calls.push({ name, operation: "find", query, options }); return {
        sort(order) { this.order = order; return this; }, skip(offset) { this.offset = offset; return this; }, limit(limit) { this.bound = limit; return this; },
        async toArray() {
          calls.push({ name, operation: "page", offset: this.offset, limit: this.bound });
          const key = Object.keys(this.order)[0]; return clone([...state[name]].sort((a, b) => a[key].localeCompare(b[key])).slice(this.offset, this.offset + this.bound));
        },
      }; },
      async insertOne(row, options) {
        calls.push({ name, operation: "insertOne", row: clone(row), session: options.session });
        if ((name === "audit_events" && controls.failAudit) || controls.insertFailure) throw new Error("private database detail");
        if (name === "audit_events" && controls.auditDuplicate) throw Object.assign(new Error("private audit duplicate"), { code: 11000 });
        if (name !== "audit_events" && controls.idDuplicate) throw Object.assign(new Error("private ID collision"), { code: 11000, keyPattern: { _id: 1 } });
        if (name !== "audit_events" && state[name].some((item) => name === "academic_terms" ? item.name === row.name : equal(item.program_id, row.program_id) && item.code === row.code)) {
          throw Object.assign(new Error("private duplicate"), { code: 11000, keyPattern: name === "academic_terms" ? { name: 1 } : { program_id: 1, code: 1 } });
        }
        state[name].push(clone(row)); return { acknowledged: true, insertedId: row._id };
      },
    }; },
  };
  return { db, client, ObjectId: Id, actorId, programId, controls, calls, metadata, indexes, session, get state() { return state; } };
}
