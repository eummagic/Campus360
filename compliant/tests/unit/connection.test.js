import assert from "node:assert/strict";
import test from "node:test";
import { createMongoConnection } from "../../server/db/connection.js";
import { createFakeMongo } from "../fixtures/mongo.js";

const config = { uri: "mongodb://synthetic.invalid/ignored_database", database: "campus360_test_unit" };
function setup() {
  const fake = createFakeMongo();
  const connection = createMongoConnection({ ...config, loadDriver: async () => fake.driver });
  return { ...fake, connection };
}

test("connection config is explicit, secret-free, and does not import the driver or connect", async () => {
  let loads = 0;
  const connection = createMongoConnection({ ...config, loadDriver() { loads += 1; throw new Error("unused"); } });
  assert.equal(loads, 0);
  await connection.close();
  assert.equal(loads, 0);
  assert.throws(() => createMongoConnection(), /Invalid MongoDB URI/);
  for (const database of [undefined, "", "admin/test", "a.b", "a\n", "$bad", "x".repeat(64)]) {
    assert.throws(() => createMongoConnection({ ...config, database }), /database name/);
  }
  for (const uri of [undefined, "https://synthetic-secret.invalid", "mongodb://", "mongodb://x\n"]) {
    assert.throws(() => createMongoConnection({ ...config, uri }), (error) => !error.message.includes("synthetic-secret"));
  }
});

test("explicit connect shares one client, selects the named DB, and closes once", async () => {
  const { connection, client, db } = setup();
  const [first, second] = await Promise.all([connection.connect(), connection.connect()]);
  assert.equal(first, second);
  assert.equal(first.db, db);
  assert.equal(first.client, client);
  assert.equal(client.connections, 1);
  assert.equal(client.databaseName, config.database);
  assert.deepStrictEqual(client.options, {
    appName: "campus360-compliant", maxPoolSize: 10, retryWrites: true, readPreference: "primary",
    serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, timeoutMS: 10_000,
  });
  await Promise.all([connection.close(), connection.close()]);
  assert.equal(client.closed, 1);
  await assert.rejects(connection.connect(), /closed/);
});

for (const label of ["standalone", "secondary", "no sessions", "missing collection", "view", "validator", "warning validation",
  "missing index", "nonunique", "wrong key", "sparse", "partial", "collation", "wrong TTL"]) {
  test(`startup rejects ${label} without schema writes and closes the fake client`, async () => {
    const f = setup();
    const sessionInfo = f.metadata.find(({ name }) => name === "app_sessions");
    const uniqueIndex = f.indexes.app_sessions[0];
    switch (label) {
      case "standalone": delete f.hello.setName; break;
      case "secondary": f.hello.isWritablePrimary = false; break;
      case "no sessions": f.hello.logicalSessionTimeoutMinutes = null; break;
      case "missing collection": f.metadata.pop(); break;
      case "view": sessionInfo.type = "view"; break;
      case "validator": sessionInfo.options.validator = {}; break;
      case "warning validation": sessionInfo.options.validationAction = "warn"; break;
      case "missing index": f.indexes.app_sessions.pop(); break;
      case "nonunique": uniqueIndex.unique = false; break;
      case "wrong key": uniqueIndex.key = { user_id: 1 }; break;
      case "sparse": uniqueIndex.sparse = true; break;
      case "partial": uniqueIndex.partialFilterExpression = { user_id: { $exists: true } }; break;
      case "collation": uniqueIndex.collation = { locale: "en", strength: 2 }; break;
      case "wrong TTL": f.indexes.app_sessions[2].expireAfterSeconds = 60; break;
    }
    await assert.rejects(f.connection.connect(), { message: "MongoDB startup unavailable." });
    assert.equal(f.client.closed, 1);
    assert.equal(f.calls.some(({ name }) => /insert|delete/.test(name)), false);
    await f.connection.close();
    assert.equal(f.client.closed, 1);
  });
}

test("driver-loading, connect, and readiness failures are sanitized and can be retried", async () => {
  const f = setup();
  for (const failure of ["connect", "hello"]) {
    f.failures.add(failure);
    await assert.rejects(f.connection.connect(), { message: "MongoDB startup unavailable." });
    f.failures.delete(failure);
  }
  await f.connection.connect();
  await f.connection.close();
  let attempt = 0;
  const connection = createMongoConnection({ ...config, loadDriver() {
    if (attempt++ === 0) throw new Error("synthetic-secret");
    return f.driver;
  } });
  await assert.rejects(connection.connect(), { message: "MongoDB startup unavailable." });
  await connection.connect();
  await connection.close();
});

test("closing during driver loading prevents any fake client connection", async () => {
  const f = createFakeMongo();
  let release;
  const connection = createMongoConnection({ ...config, loadDriver: () => new Promise((resolve) => { release = resolve; }) });
  const opening = connection.connect();
  const closing = connection.close();
  release(f.driver);
  await assert.rejects(opening, /startup unavailable/);
  await closing;
  assert.equal(f.client.connections, 0);
});

test("shutdown failures are sanitized", async () => {
  const f = setup();
  await f.connection.connect();
  f.failures.add("close");
  await assert.rejects(f.connection.close(), { message: "MongoDB shutdown unavailable." });
});
