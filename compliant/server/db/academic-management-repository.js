import { isDeepStrictEqual } from "node:util";
import { COLLECTIONS, buildValidator } from "./schema.js";
import { AuthError } from "../auth/errors.js";
import { AcademicManagementError, unavailable, validateAcademicInput } from "../academics/management-service.js";

const names = { terms: "academic_terms", subjects: "subjects" };
export function createMongoAcademicManagementRepository({ db, client, ObjectId, adminScope = null, now = Date.now } = {}) {
  if (!db || db.client !== client || typeof db.collection !== "function" || typeof db.listCollections !== "function" || typeof client?.startSession !== "function"
    || typeof ObjectId !== "function" || !(adminScope === null || (typeof adminScope === "string" && adminScope.trim() && adminScope.length <= 64))) {
    throw new TypeError("Invalid academic management repository configuration.");
  }
  function id(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{24}$/.test(value)) throw new AuthError("FORBIDDEN");
    return new ObjectId(value);
  }
  function hex(value) {
    if (!(value instanceof ObjectId)) throw new Error("Inconsistent academic identifier.");
    return value.toHexString();
  }
  function nameFor(kind) {
    if (!Object.hasOwn(names, kind)) throw new AcademicManagementError(400, "Unknown academic resource.");
    return names[kind];
  }
  async function admin(actorId, session) {
    const actor = id(actorId);
    if (!await db.collection("user").findOne({ _id: actor }, { projection: { _id: 1 }, session })
      || !await db.collection("user_roles").findOne({ user_id: actor, role: "admin", scope: adminScope }, { session })) throw new AuthError("FORBIDDEN");
    return actor;
  }
  // Metadata reads only: never create/repair schema or trust an implicit collection.
  async function ready(name) {
    const spec = COLLECTIONS.find((item) => item.name === name);
    const infos = await db.listCollections({ name }).toArray();
    const info = infos.find((item) => item.name === name);
    const options = info?.options ?? {};
    if (!info || info.type !== "collection" || Object.keys(options).some((key) => !["validator", "validationLevel", "validationAction"].includes(key))
      || !isDeepStrictEqual(options.validator, buildValidator(spec)) || (options.validationLevel ?? "strict") !== "strict"
      || (options.validationAction ?? "error") !== "error") throw unavailable();
    const indexes = await db.collection(name).indexes();
    const expected = [{ name: "_id_", key: { _id: 1 } }, ...spec.indexes];
    if (indexes.length !== expected.length || expected.some((want) => {
      const actual = indexes.find((index) => index.name === want.name);
      return !actual || !isDeepStrictEqual(Object.entries(actual.key), Object.entries(want.key))
        || (want.name !== "_id_" && Boolean(actual.unique) !== Boolean(want.unique))
        || Object.keys(actual).some((key) => !["name", "key", "v", "ns", "unique"].includes(key));
    })) throw unavailable();
  }
  function view(kind, row) {
    const { _id, created_at, updated_at, ...fields } = row;
    const permitted = kind === "terms" ? ["name", "starts_on", "ends_on", "status"] : ["program_id", "code", "name", "credits", "status"];
    const data = Object.fromEntries(permitted.map((key) => [key, key === "program_id" ? hex(fields[key]) : fields[key]]));
    try { return { id: hex(_id), ...validateAcademicInput(kind, data) }; }
    catch { throw new Error("Inconsistent stored academic record."); }
  }
  return Object.freeze({
    async list(actorId, kind, { offset, limit }) {
      const name = nameFor(kind);
      await admin(actorId);
      await ready(name);
      if (!Number.isInteger(offset) || offset < 0 || offset > 1000 || limit !== 50) throw new AcademicManagementError(400, "Invalid page offset.");
      const rows = await db.collection(name).find({}, { maxTimeMS: 3000 }).sort({ [kind === "terms" ? "name" : "code"]: 1, _id: 1 }).skip(offset).limit(limit + 1).toArray();
      return { records: rows.slice(0, limit).map((row) => view(kind, row)), offset, hasMore: rows.length > limit && offset < 1000 };
    },
    async create(actorId, kind, input) {
      const name = nameFor(kind);
      const data = validateAcademicInput(kind, input);
      await admin(actorId);
      await ready(name);
      await ready("audit_events");
      const actor = id(actorId), recordId = new ObjectId(), eventId = new ObjectId(), timestamp = new Date(now());
      if (!Number.isFinite(timestamp.getTime())) throw new Error("Invalid clock.");
      const session = client.startSession();
      try {
        return await session.withTransaction(async () => {
          await admin(actorId, session);
          const values = { ...data };
          if (kind === "subjects") {
            values.program_id = id(data.program_id);
            if (!await db.collection("programs").findOne({ _id: values.program_id, status: "active" }, { projection: { _id: 1 }, session })) {
              throw new AcademicManagementError(400, "Select an existing active program.");
            }
          }
          const row = { _id: recordId, ...values, created_at: timestamp, updated_at: timestamp };
          try { await db.collection(name).insertOne(row, { session }); }
          catch (error) {
            // Only the resource insert's unique-index violation is a user conflict.
            const duplicateKey = kind === "terms" ? { name: 1 } : { program_id: 1, code: 1 };
            if (error?.code === 11000 && isDeepStrictEqual(error.keyPattern, duplicateKey)) throw new AcademicManagementError(409, kind === "terms"
              ? "A term with this name already exists." : "This subject code already exists in the selected program.");
            throw error;
          }
          await db.collection("audit_events").insertOne({ _id: eventId, actor_id: actor, action: kind === "terms" ? "academic.term.created" : "academic.subject.created",
            entity_type: name, entity_id: recordId, metadata: { ...data }, created_at: timestamp }, { session });
          return { record: view(kind, row) };
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", timeoutMS: 10_000, maxCommitTimeMS: 5000 });
      } finally {
        try { await session.endSession(); }
        catch {
          // Cleanup cannot change the acknowledged transaction result or mask
          // its primary error. Never log raw driver errors or documents.
          console.error("Academic management session cleanup failed.");
        }
      }
    },
  });
}
