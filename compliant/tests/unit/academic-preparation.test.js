import assert from "node:assert/strict";
import test from "node:test";
import { academicPlan, assertAcademicConfiguration, assertAcademicContainer, prepareAcademicSchema } from "../../scripts/prepare-academic-schema.js";
import { COLLECTIONS, buildValidator } from "../../server/db/schema.js";

const database = "campus360_demo_20261029_4f9c2b18";
const config = { database, uri: "mongodb://127.0.0.1:27028/?replicaSet=campus360-demo-rs&directConnection=true" };
const args = ["--execute", "--database", database];
function container() {
  return { socket: "npipe://local-engine", running: true,
    id: "29a0149da21af9299570034fe7abf86cea2c9a7a894c1884fad982652a899489",
    name: "/campus360-demo-20261029-4f9c2b18",
    image: "sha256:3c64937121b9437095921c4bb2569911084c05f7b88e4a263d62a8959d2b2399",
    labels: { "io.campus360.demo": database, "io.campus360.setup": "cea6f1c1-7a4d-44a6-8ee5-21313250533c" },
    volumeLabels: { "io.campus360.demo": database, "io.campus360.setup": "cea6f1c1-7a4d-44a6-8ee5-21313250533c" },
    ports: { "27017/tcp": [{ HostIp: "127.0.0.1", HostPort: "27028" }] },
    mounts: [{ Type: "volume", Name: "campus360-demo-20261029-4f9c2b18-data", Destination: "/data/db" }, { Type: "tmpfs", Destination: "/data/configdb" }] };
}
function fixture() {
  const metadata = ["user", "account", "profiles", "user_roles", "audit_events", "departments", "programs", "student_records", "app_sessions"].map((name) => ({ name, type: "collection", options: {} }));
  const indexMap = new Map(); const writes = []; const controls = { failIndexes: false, race: false, closed: 0, connected: 0 };
  const hello = { setName: "campus360-demo-rs", me: "localhost:27017", hosts: ["localhost:27017"], isWritablePrimary: true };
  const db = { databaseName: database,
    command: async () => hello,
    listCollections: (filter) => ({ toArray: async () => structuredClone(metadata.filter((row) => !filter || row.name === filter.name)) }),
    async createCollection(name, options) {
      if (controls.race) throw new Error("NamespaceExists private-detail");
      writes.push({ operation: "createCollection", name, options: structuredClone(options) });
      metadata.push({ name, type: "collection", options: structuredClone(options) });
      indexMap.set(name, [{ name: "_id_", key: { _id: 1 }, v: 2 }]);
    },
    collection(name) { return {
      indexes: async () => structuredClone(indexMap.get(name)),
      async createIndexes(indexes) {
        if (controls.failIndexes) throw new Error("Driver private-detail mongodb://example.test");
        writes.push({ operation: "createIndexes", name, indexes: structuredClone(indexes) });
        indexMap.get(name).push(...structuredClone(indexes));
      },
    }; },
  };
  function existing(spec) {
    metadata.push({ name: spec.name, type: "collection", options: { validator: structuredClone(spec.validator), validationLevel: "strict", validationAction: "error" } });
    indexMap.set(spec.name, [{ name: "_id_", key: { _id: 1 }, v: 2 }, ...structuredClone(spec.indexes)]);
  }
  const hooks = { args, configuration: config, inspect: async () => container(), connect: async () => {
    controls.connected++; return { db, close: async () => { controls.closed++; } };
  } };
  return { metadata, indexMap, writes, controls, hello, db, existing, run: (overrides) => prepareAcademicSchema({ ...hooks, ...overrides }) };
}

test("offline plan performs no inspection, connection or DDL and preserves exact five definitions/eight indexes", async () => {
  const never = () => { throw new Error("External operation attempted"); };
  const result = await prepareAcademicSchema({ inspect: never, connect: never });
  assert.equal(result.mode, "offline-plan");
  assert.equal(result.execute, false);
  assert.deepEqual(result.collections.map((s) => s.name), ["academic_terms", "subjects", "course_offerings", "teaching_assignments", "enrolments"]);
  assert.equal(result.collections.reduce((n, s) => n + s.indexes.length, 0), 8);
  for (const spec of result.collections) {
    const source = COLLECTIONS.find((s) => s.name === spec.name);
    assert.deepEqual(spec.validator, buildValidator(source));
    assert.deepEqual(spec.indexes, source.indexes);
    for (const [i, index] of spec.indexes.entries()) assert.deepEqual(Object.entries(index.key), Object.entries(source.indexes[i].key));
    assert.equal(spec.validationLevel, "strict"); assert.equal(spec.validationAction, "error");
  }
});
test("execution requires exact explicit arguments and rejects duplicate/conflicting options", () => {
  for (const input of [["--execute"], ["--execute", "--plan", "--database", database], ["--plan", "--plan"], ["--uri", config.uri], ["--database"], ["--database", "other"]]) assert.throws(() => academicPlan(input));
  assert.equal(academicPlan(args).execute, true);
});
test("unsafe configuration refuses before Docker inspection or connection", async () => {
  const f = fixture(); let inspected = 0;
  for (const configuration of [{ ...config, database: "campus360" }, { ...config, uri: "mongodb+srv://example.test" }, { ...config, uri: "mongodb://example.test:27028" }, { ...config, uri: config.uri.replace("127.0.0.1", "localhost") }, { ...config, uri: config.uri + "&tls=false" }, { ...config, uri: config.uri.replace("27028", "27017") }, { ...config, uri: config.uri.replace("127.0.0.1", "secret@127.0.0.1") }]) {
    await assert.rejects(f.run({ configuration, inspect: async () => { inspected++; return container(); } }), /target mismatch/);
  }
  assert.equal(inspected, 0); assert.equal(f.controls.connected, 0); assert.deepEqual(f.writes, []);
  assert.doesNotThrow(() => assertAcademicConfiguration(config));
});
test("container identity, image, daemon, port, volume, nonce and running state must match", async () => {
  const f = fixture();
  assert.doesNotThrow(() => assertAcademicContainer(container()));
  for (const patch of [{ socket: "tcp://remote:2375" }, { running: false }, { id: "f".repeat(64) }, { image: "other" }, { labels: {} }, { volumeLabels: {} }, { mounts: [] }, { ports: { "27017/tcp": [{ HostIp: "0.0.0.0", HostPort: "27028" }] } }]) {
    await assert.rejects(f.run({ inspect: async () => ({ ...container(), ...patch }) }), /container identity/);
  }
  assert.equal(f.controls.connected, 0); assert.deepEqual(f.writes, []);
});
test("replica identity, primary state and pre-existing baseline are checked before DDL", async () => {
  for (const kind of ["database", "replica", "host", "primary", "baseline"]) {
    const f = fixture();
    if (kind === "database") f.db.databaseName = "other";
    if (kind === "replica") f.hello.setName = "other";
    if (kind === "host") f.hello.hosts.push("remote:27017");
    if (kind === "primary") f.hello.isWritablePrimary = false;
    if (kind === "baseline") f.metadata.pop();
    await assert.rejects(f.run()); assert.deepEqual(f.writes, []); assert.equal(f.controls.closed, 1);
  }
});
test("all preflight checks precede writes; unexpected existing validators/types/indexes are never repaired", async () => {
  for (const kind of ["validator", "warn", "moderate", "view", "missing index", "extra index", "unique", "key order", "partial"]) {
    const f = fixture(); const spec = academicPlan().collections.at(-1); f.existing(spec);
    const info = f.metadata.at(-1); const indexes = f.indexMap.get(spec.name);
    if (kind === "validator") info.options.validator.$jsonSchema.required = [];
    if (kind === "warn") info.options.validationAction = "warn";
    if (kind === "moderate") info.options.validationLevel = "moderate";
    if (kind === "view") info.type = "view";
    if (kind === "missing index") indexes.pop();
    if (kind === "extra index") indexes.push({ name: "unexpected", key: { other: 1 } });
    if (kind === "unique") indexes[1].unique = false;
    if (kind === "key order") indexes[1].key = { offering_id: 1, student_record_id: 1 };
    if (kind === "partial") indexes[1].partialFilterExpression = { active: true };
    await assert.rejects(f.run(), /Unexpected/); assert.deepEqual(f.writes, []);
  }
});
test("compatible existing targets are validated and skipped without any writes", async () => {
  const f = fixture(); const specs = academicPlan().collections; specs.forEach(f.existing);
  const result = await f.run();
  assert.equal(result.mode, "prepared");
  assert.deepEqual(result.confirmedCreated, []); assert.deepEqual(result.uncertain, []);
  assert.deepEqual(result.skipped, specs.map((s) => s.name));
  assert.deepEqual(f.writes, []);
});
test("a collection appearing before the request is confirmed not created by this attempt", async () => {
  const appeared = fixture();
  const list = appeared.db.listCollections;
  appeared.db.listCollections = (filter) => filter ? { toArray: async () => [{ name: filter.name, type: "collection" }] } : list();
  await assert.rejects(appeared.run(), (error) => {
    assert.deepEqual(error.report.confirmedNotCreated, ["academic_terms"]);
    assert.deepEqual(error.report.uncertain, []); return true;
  });
  assert.deepEqual(appeared.writes, []);
});

async function failedReport(operation) {
  try { await operation; assert.fail("Expected refusal"); }
  catch (error) { assert.equal(error.name, "AcademicPreparationError"); return error.report; }
}
function noIndexes(f) { assert.equal(f.writes.some((w) => w.operation === "createIndexes"), false); }

test("successful create acknowledgement does not establish ownership or permit index creation", async () => {
  const f = fixture();
  const result = await failedReport(f.run());
  assert.deepEqual(result.confirmedCreated, []);
  assert.deepEqual(result.uncertain, [{ name: "academic_terms", outcome: "existence-acknowledged-ownership-unproven" }]);
  assert.deepEqual(result.notAttempted, academicPlan().collections.slice(1).map((s) => s.name));
  assert.match(result.primaryError, /Index creation refused/);
  assert.deepEqual(f.writes.map((w) => w.operation), ["createCollection"]); noIndexes(f);
  const spec = academicPlan().collections[0];
  assert.deepEqual(f.writes[0].options, { validator: spec.validator, validationLevel: "strict", validationAction: "error" });
});
test("identical collection created after preflight is never indexed or claimed as owned", async () => {
  const f = fixture(); let requests = 0;
  f.db.createCollection = async (name) => {
    requests++;
    f.existing(academicPlan().collections.find((s) => s.name === name));
    f.indexMap.set(name, [{ name: "_id_", key: { _id: 1 }, v: 2 }]);
    // Real MongoDB returns success for this identical pre-existing namespace.
  };
  const result = await failedReport(f.run());
  assert.equal(requests, 1); assert.deepEqual(result.confirmedCreated, []);
  assert.equal(result.uncertain[0].name, "academic_terms"); noIndexes(f);
  assert.equal(f.indexMap.get("academic_terms").length, 1);
});
test("lost acknowledgement after actual fake creation is uncertain and never retried", async () => {
  const f = fixture(); const create = f.db.createCollection; let requests = 0;
  f.db.createCollection = async (...args) => { requests++; await create(...args); throw new Error("Synthetic lost acknowledgement private detail"); };
  const result = await failedReport(f.run());
  assert.ok(f.metadata.some((r) => r.name === "academic_terms"));
  assert.equal(requests, 1); assert.deepEqual(result.confirmedCreated, []);
  assert.equal(result.uncertain[0].name, "academic_terms");
  assert.equal(result.uncertain[0].outcome, "creation-or-ownership-unconfirmed");
  assert.doesNotMatch(JSON.stringify(result), /private detail|none created/); noIndexes(f);
});
test("definite server rejection is distinguished from ambiguous failures and write-concern errors", async () => {
  for (const [name, code, writeConcernError, certain] of [
    ["MongoServerError", 13, undefined, true], ["MongoServerError", 48, undefined, true],
    ["MongoNetworkError", undefined, undefined, false], ["MongoServerError", 50, undefined, false],
    ["MongoWriteConcernError", 13, {}, false], ["MongoServerError", 13, {}, false],
  ]) {
    const f = fixture(); let requests = 0;
    f.db.createCollection = async () => { requests++; throw Object.assign(new Error("private"), { name, code, writeConcernError }); };
    const result = await failedReport(f.run());
    assert.equal(requests, 1); assert.deepEqual(result.confirmedNotCreated, certain ? ["academic_terms"] : []);
    assert.equal(result.uncertain.length, certain ? 0 : 1); noIndexes(f);
  }
});
test("shutdown failure preserves primary error and uncertain progress without exposing raw errors", async () => {
  const f = fixture(); const create = f.db.createCollection;
  f.db.createCollection = async (...args) => { await create(...args); throw new Error("private lost reply"); };
  const result = await failedReport(f.run({ connect: async () => ({ db: f.db, close: async () => { throw new Error("private shutdown error"); } }) }));
  assert.match(result.primaryError, /Preparation failed/);
  assert.equal(result.shutdownError, "MongoDB connection shutdown failed.");
  assert.equal(result.uncertain[0].name, "academic_terms");
  assert.doesNotMatch(JSON.stringify(result), /private/); noIndexes(f);
});
test("shutdown failure after successful validation preserves completed work and primary success", async () => {
  const f = fixture(); const specs = academicPlan().collections; specs.forEach(f.existing);
  const result = await failedReport(f.run({ connect: async () => ({ db: f.db, close: async () => { throw new Error("shutdown"); } }) }));
  assert.equal(result.primaryError, null); assert.ok(result.shutdownError);
  assert.deepEqual(result.skipped, specs.map((s) => s.name));
  assert.deepEqual(result.uncertain, []); assert.deepEqual(result.notAttempted, []);
  assert.deepEqual(f.writes, []);
});
