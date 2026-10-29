import { isDeepStrictEqual } from "node:util";
import { AUTH_INDEXES, COLLECTIONS, buildValidator } from "./schema.js";
import { APP_SESSIONS_SPEC, APP_SESSIONS_VALIDATOR } from "./app-sessions-schema.js";

const STARTUP_ERROR = "MongoDB startup unavailable.";
const applicationSpecs = COLLECTIONS.filter(({ name }) =>
  ["profiles", "user_roles", "audit_events", "departments", "programs", "student_records"].includes(name));

// Readiness checks only. Missing or incompatible definitions require a separate
// approved initializer; opening a connection never creates or changes a schema.
async function validateStartup(db) {
  const hello = await db.command({ hello: 1 });
  if (hello.isWritablePrimary !== true || !((typeof hello.setName === "string" && hello.setName.length > 0)
    || hello.msg === "isdbgrid") || !Number.isFinite(hello.logicalSessionTimeoutMinutes)
    || hello.logicalSessionTimeoutMinutes <= 0) throw new Error(STARTUP_ERROR);

  const required = ["user", "account", ...applicationSpecs.map(({ name }) => name), "app_sessions"];
  const infos = await db.listCollections({ name: { $in: required } }).toArray();
  if (required.some((name) => !infos.some((info) => info.name === name && info.type === "collection"))) {
    throw new Error(STARTUP_ERROR);
  }
  for (const [name, validator] of [
    ...applicationSpecs.map((spec) => [spec.name, buildValidator(spec)]),
    ["app_sessions", APP_SESSIONS_VALIDATOR],
  ]) {
    const options = infos.find((info) => info.name === name).options ?? {};
    if (!isDeepStrictEqual(options.validator, validator)
      || (options.validationLevel ?? "strict") !== "strict"
      || (options.validationAction ?? "error") !== "error") throw new Error(STARTUP_ERROR);
  }
  const groups = [
    ...AUTH_INDEXES.filter(({ collection }) => ["user", "account"].includes(collection)),
    ...applicationSpecs.filter((spec) => spec.indexes.length).map((spec) => ({ collection: spec.name, indexes: spec.indexes })),
    { collection: "app_sessions", indexes: APP_SESSIONS_SPEC.indexes },
  ];
  for (const group of groups) {
    const indexes = await db.collection(group.collection).indexes();
    for (const expected of group.indexes) {
      const actual = indexes.find(({ name }) => name === expected.name);
      if (!actual || !isDeepStrictEqual(Object.entries(actual.key), Object.entries(expected.key))
        || Boolean(actual.unique) !== Boolean(expected.unique)
        || Boolean(actual.sparse) !== Boolean(expected.sparse)
        || ["expireAfterSeconds", "partialFilterExpression", "collation"].some((option) =>
          !isDeepStrictEqual(actual[option], expected[option]))) throw new Error(STARTUP_ERROR);
    }
  }
}

/** No environment loading, driver import, or network work until connect(). */
export function createMongoConnection({ uri, database, loadDriver = () => import("mongodb") } = {}) {
  if (typeof uri !== "string" || uri.length > 8192 || /\s/.test(uri)
    || !/^mongodb(?:\+srv)?:\/\/[^/\s]+/.test(uri)) throw new TypeError("Invalid MongoDB URI.");
  if (typeof database !== "string" || /\s/.test(database) || !/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(database)) {
    throw new TypeError("An explicit valid MongoDB database name is required.");
  }
  if (typeof loadDriver !== "function") throw new TypeError("Invalid MongoDB driver loader.");
  let client = null;
  let handle = null;
  let pending = null;
  let shutdown = null;
  let closed = false;

  return Object.freeze({
    async connect() {
      if (closed) throw new Error("MongoDB connection is closed.");
      if (handle) return handle;
      if (!pending) pending = (async () => {
        let candidate;
        try {
          const { MongoClient, ObjectId } = await loadDriver();
          if (closed || typeof MongoClient !== "function" || typeof ObjectId !== "function") {
            throw new Error(STARTUP_ERROR);
          }
          candidate = new MongoClient(uri, {
            appName: "campus360-compliant", maxPoolSize: 10, retryWrites: true, readPreference: "primary",
            serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, timeoutMS: 10_000,
          });
          client = candidate;
          await candidate.connect();
          if (closed) throw new Error(STARTUP_ERROR);
          const db = candidate.db(database);
          await validateStartup(db);
          if (closed) throw new Error(STARTUP_ERROR);
          handle = Object.freeze({ client: candidate, db, ObjectId });
          return handle;
        } catch {
          if (candidate) { try { await candidate.close(); } catch { /* Keep errors secret-free. */ } }
          client = null;
          throw new Error(STARTUP_ERROR);
        }
      })().finally(() => { pending = null; });
      return pending;
    },
    async close() {
      closed = true;
      if (!shutdown) shutdown = (async () => {
        try { await pending; } catch { /* Failed startup already closes its client. */ }
        const current = client;
        client = null;
        handle = null;
        if (current) {
          try { await current.close(); }
          catch { throw new Error("MongoDB shutdown unavailable."); }
        }
      })();
      return shutdown;
    },
  });
}
