// Test-only model. This is not BSON, a MongoDB driver, or proof of database
// atomicity. Transactions below restore snapshots solely to test control flow.
import { AUTH_INDEXES, COLLECTIONS, buildValidator } from "../../server/db/schema.js";
import { APP_SESSIONS_SPEC, APP_SESSIONS_VALIDATOR } from "../../server/db/app-sessions-schema.js";

let nextId = 1;
export class FakeObjectId {
  constructor(value = (nextId++).toString(16).padStart(24, "0")) {
    if (!/^[0-9a-f]{24}$/.test(value)) throw new Error("Invalid fake ObjectId");
    this.value = value;
  }
  toHexString() { return this.value; }
}
export function clone(value) {
  if (value instanceof FakeObjectId) return new FakeObjectId(value.value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, clone(item)]),
  );
  return value;
}
function equal(a, b) {
  if (a instanceof FakeObjectId || b instanceof FakeObjectId) {
    return a instanceof FakeObjectId && b instanceof FakeObjectId && a.value === b.value;
  }
  return a === b;
}
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => value && typeof value === "object"
    && "$gt" in value ? row[key] instanceof Date && row[key] > value.$gt : equal(row[key], value));
}

export function createFakeMongo() {
  const state = Object.fromEntries(["user", "account", "profiles", "user_roles", "app_sessions", "audit_events", "departments", "programs", "student_records"]
    .map((name) => [name, []]));
  const calls = [];
  const failures = new Set();
  const metadata = ["user", "account"].map((name) => ({ name, type: "collection", options: {} }));
  for (const spec of [...COLLECTIONS.filter(({ name }) => ["profiles", "user_roles", "audit_events", "departments", "programs", "student_records"].includes(name)), APP_SESSIONS_SPEC]) {
    metadata.push({ name: spec.name, type: "collection", options: {
      validator: clone(spec.name === "app_sessions" ? APP_SESSIONS_VALIDATOR : buildValidator(spec)),
      validationLevel: "strict", validationAction: "error",
    } });
  }
  const indexes = Object.fromEntries(AUTH_INDEXES.map(({ collection, indexes: definitions }) => [collection, clone(definitions)]));
  indexes.user_roles = clone(COLLECTIONS.find(({ name }) => name === "user_roles").indexes);
  indexes.app_sessions = clone(APP_SESSIONS_SPEC.indexes);
  for (const spec of COLLECTIONS) if (spec.indexes.length) indexes[spec.name] = clone(spec.indexes);
  const hello = { isWritablePrimary: true, setName: "synthetic-test", logicalSessionTimeoutMinutes: 30 };

  async function operation(name, options, action) {
    const session = options?.session;
    if (session && (!session.active || session.busy)) throw new Error("Inactive session or parallel transaction operation");
    if (session) session.busy = true;
    calls.push({ name, session, ...clone(options?.projection ? { projection: options.projection } : {}) });
    try {
      await Promise.resolve();
      if (failures.has(name)) throw new Error("Synthetic failure; secret must not reach HTTP responses");
      return action();
    } finally { if (session) session.busy = false; }
  }
  const client = {
    closed: 0, connections: 0, sessions: [], retryOnce: false,
    startSession() {
      const session = {
        active: false, busy: false, ended: 0, attempts: 0,
        async withTransaction(callback, options) {
          this.options = clone(options);
          for (;;) {
            const snapshot = clone(state);
            this.active = true;
            this.attempts += 1;
            try {
              const result = await callback();
              if (client.retryOnce && this.attempts === 1) {
                Object.assign(state, snapshot);
                continue;
              }
              return result;
            } catch (error) { Object.assign(state, snapshot); throw error; }
            finally { this.active = false; }
          }
        },
        async endSession() { this.ended += 1; },
      };
      this.sessions.push(session);
      return session;
    },
    async connect() { this.connections += 1; if (failures.has("connect")) throw new Error("synthetic-secret"); },
    db(name) { this.databaseName = name; return db; },
    async close() { this.closed += 1; if (failures.has("close")) throw new Error("synthetic-secret"); },
  };
  const db = {
    client,
    async command() { if (failures.has("hello")) throw new Error("synthetic-secret"); return clone(hello); },
    listCollections() { return { async toArray() { return clone(metadata); } }; },
    collection(name) {
      return {
        async indexes() { return clone(indexes[name] ?? []); },
        find(filter, options) {
          let limit = Infinity;
          calls.push({ name: `${name}.query`, filter: clone(filter), options });
          return {
            limit(value) { limit = value; return this; },
            async toArray() {
              return operation(`${name}.find`, options, () => state[name].filter((row) => matches(row, filter))
                .slice(0, limit).map((row) => {
                  const projection = options?.projection;
                  return projection ? clone(Object.fromEntries(Object.entries(row).filter(([key]) => projection[key] === 1))) : clone(row);
                }));
            },
          };
        },
        async insertOne(row, options) {
          calls.push({ name: `${name}.insertDocument`, row: clone(row) });
          return operation(`${name}.insertOne`, options, () => {
            if (state[name].some((existing) => equal(existing._id, row._id)
              || (name === "app_sessions" && existing.token_hash === row.token_hash))) {
              throw Object.assign(new Error("Synthetic duplicate"), { code: 11000 });
            }
            state[name].push(clone(row));
            return { insertedId: row._id };
          });
        },
        async deleteOne(filter, options) {
          return operation(`${name}.deleteOne`, options, () => {
            const index = state[name].findIndex((row) => matches(row, filter));
            if (index < 0) return { deletedCount: 0 };
            state[name].splice(index, 1);
            return { deletedCount: 1 };
          });
        },
      };
    },
  };
  const driver = { MongoClient: class { constructor(uri, options) {
    client.uri = uri; client.options = options; return client;
  } }, ObjectId: FakeObjectId };
  return { db, client, driver, state, calls, failures, metadata, indexes, hello };
}
