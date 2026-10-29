// Explicit opt-in only: node --test tests/mongo/essential.mongo.js.
// Never reads application database settings, environment files, or credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { COLLECTIONS, AUTH_INDEXES, buildValidator } from "../../server/db/schema.js";
import { APP_SESSIONS_SPEC, APP_SESSIONS_VALIDATOR } from "../../server/db/app-sessions-schema.js";
import { createMongoConnection } from "../../server/db/connection.js";
import { createMongoAuthRepository } from "../../server/db/auth-repository.js";
import { createAuthService } from "../../server/auth/service.js";
import { createSessionToken, hashSessionToken, SESSION_TTL_MS } from "../../server/auth/session.js";
import { requireAdmin } from "../../server/middleware/authentication.js";

export const testUri = "mongodb://127.0.0.1:27028/?replicaSet=campus360-test-rs&directConnection=true";

// The controller must first inspect its fresh container's image, labels, exact
// port binding and tmpfs mounts. No default or hosted database URI is accepted.
export async function isolatedFixture(suffix) {
  const run = process.env.CAMPUS360_TEST_RUN;
  if (!/^[0-9a-f]{32}$/.test(run ?? "") || !/^[a-z]+$/.test(suffix)) {
    throw new Error("Explicit isolated test-run identity required.");
  }
  const database = `campus360_test_${run}_${suffix}`;
  const client = new MongoClient(testUri, { serverSelectionTimeoutMS: 5000, timeoutMS: 10_000 });
  try {
    await client.connect();
    const hello = await client.db("admin").command({ hello: 1 });
    assert.equal(hello.setName, "campus360-test-rs");
    assert.equal(hello.isWritablePrimary, true);
    assert.equal(hello.me, "localhost:27017");
    const databases = await client.db("admin").command({ listDatabases: 1, nameOnly: true });
    assert.ok(databases.databases.every(({ name }) => ["admin", "config", "local"].includes(name)
      || name.startsWith(`campus360_test_${run}_`)), "Unexpected database: isolation is uncertain");
    assert.ok(!databases.databases.some(({ name }) => name === database), "Test database must be new");
    const db = client.db(database);
    // Minimal synthetic test fixtures, not a seed or legacy initializer.
    for (const name of ["user", "account"]) {
      await db.createCollection(name);
      await db.collection(name).createIndexes(AUTH_INDEXES.find((group) => group.collection === name).indexes);
    }
    for (const spec of COLLECTIONS.filter(({ name }) =>
      ["profiles", "user_roles", "audit_events", "departments", "programs", "student_records"].includes(name))) {
      await db.createCollection(spec.name, { validator: buildValidator(spec), validationLevel: "strict", validationAction: "error" });
      if (spec.indexes.length) await db.collection(spec.name).createIndexes(spec.indexes);
    }
    await db.createCollection("app_sessions", { validator: APP_SESSIONS_VALIDATOR, validationLevel: "strict", validationAction: "error" });
    await db.collection("app_sessions").createIndexes(APP_SESSIONS_SPEC.indexes);
    const userId = new ObjectId();
    const now = new Date();
    const { vectors: [vector] } = JSON.parse(readFileSync(new URL("../fixtures/password-vectors.json", import.meta.url), "utf8"));
    await db.collection("user").insertOne({ _id: userId, email: "admin@example.test", name: "Test Administrator", emailVerified: true, createdAt: now, updatedAt: now });
    await db.collection("account").insertOne({ _id: new ObjectId(), userId, accountId: userId.toHexString(), providerId: "credential", password: vector.hash, createdAt: now, updatedAt: now });
    await db.collection("profiles").insertOne({ _id: userId, display_name: "Test Administrator", contact_email: "admin@example.test", created_at: now, updated_at: now });
    const role = { user_id: userId, role: "admin", scope: "demo", assigned_at: now, assigned_by: null };
    await db.collection("user_roles").insertOne({ ...role });
    return { client, db, database, userId, role, vector };
  } catch (error) { await client.close(); throw error; }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/essential.mongo.js")) {
  test("essential real-driver checks in the explicitly isolated replica set", { timeout: 90_000 }, async (t) => {
    const fixture = await isolatedFixture("essential");
    const { client, db, database, userId, role, vector } = fixture;
    t.after(() => client.close());
    console.log(`Isolated database: ${database}; replica set: campus360-test-rs; endpoint: 127.0.0.1:27028`);
    const connection = createMongoConnection({ uri: testUri, database });
    t.after(() => connection.close());
    const handle = await connection.connect();
    let time = Date.now();
    const now = () => time;
    const repository = createMongoAuthRepository({ ...handle, now });
    const service = createAuthService({ repository, now });
    let login;
    let stored;

    await t.test("connection, native ObjectId mapping and authentication lookup", async () => {
      const account = await db.collection("account").findOne({ userId });
      assert.ok(account._id instanceof ObjectId && account.userId instanceof ObjectId);
      assert.equal(account.accountId, userId.toHexString());
      assert.ok((await db.collection("profiles").findOne({ _id: userId }))._id instanceof ObjectId);
      const credential = await repository.findCredentialByEmail("admin@example.test");
      assert.equal(credential.userId, userId.toHexString());
      assert.ok(typeof credential.passwordHash === "string");
      assert.equal((await repository.findUserById(credential.userId)).displayName, "Test Administrator");
    });
    await t.test("login creates a persisted hashed session and matching audit", async () => {
      login = await service.login({ email: "admin@example.test", password: vector.password }, "127.0.0.1");
      stored = await repository.findSessionByHash(hashSessionToken(login.token));
      assert.ok(stored);
      assert.equal((await service.inspect(login.token)).user.id, userId.toHexString());
      const row = await db.collection("app_sessions").findOne({ token_hash: stored.tokenHash });
      assert.ok(row.user_id instanceof ObjectId);
      assert.ok(!("token" in row));
      assert.equal(await db.collection("audit_events").countDocuments({ action: "auth.session.created", entity_id: row._id }), 1);
      const fresh = createAuthService({ repository: createMongoAuthRepository({ ...handle, now }), now });
      assert.equal((await fresh.inspect(login.token)).user.id, userId.toHexString());
    });
    await t.test("expiry is enforced before TTL cleanup; Mongo rejects an excessive lifetime", async () => {
      const before = time;
      time = stored.expiresAt.getTime();
      await assert.rejects(service.inspect(login.token), { status: 401 });
      assert.equal(await db.collection("app_sessions").countDocuments({ token_hash: stored.tokenHash }), 1);
      time = before;
      await assert.rejects(db.collection("app_sessions").insertOne({
        _id: new ObjectId(), user_id: userId, token_hash: hashSessionToken(createSessionToken()),
        csrf_token: createSessionToken(), created_at: new Date(time), expires_at: new Date(time + SESSION_TTL_MS + 1),
      }), { code: 121 });
    });
    await t.test("role revocation takes effect on the next session inspection", async () => {
      await db.collection("user_roles").deleteOne({ user_id: userId, role: "admin", scope: "demo" });
      const context = await service.inspect(login.token);
      assert.equal(context.roles.length, 0);
      assert.throws(() => requireAdmin({ allowedScopes: ["demo"] })({ auth: context }, {}, () => {}), { status: 403 });
      await db.collection("user_roles").insertOne({ ...role });
    });
    await t.test("unique token hash rejects a duplicate without adding an audit", async () => {
      await assert.rejects(repository.createSession(stored), { code: 11000 });
      assert.equal(await db.collection("app_sessions").countDocuments({}), 1);
      assert.equal(await db.collection("audit_events").countDocuments({}), 1);
    });
    await t.test("real audit validation failure rolls back session insertion and deletion", async () => {
      // Test-only wrapper sends an invalid date through the real native driver;
      // MongoDB, not a fake transaction implementation, rejects the audit write.
      const brokenDb = { client: handle.client, collection(name) {
        const collection = handle.db.collection(name);
        return name === "audit_events" ? { insertOne(document, options) {
          return collection.insertOne({ ...document, created_at: "invalid" }, options);
        } } : collection;
      } };
      const broken = createMongoAuthRepository({ ...handle, db: brokenDb, now });
      const tokenHash = hashSessionToken(createSessionToken());
      await assert.rejects(broken.createSession({ ...stored, tokenHash }), { code: 121 });
      assert.equal(await db.collection("app_sessions").countDocuments({ token_hash: tokenHash }), 0);
      await assert.rejects(broken.deleteSessionByHash(stored.tokenHash), { code: 121 });
      assert.equal(await db.collection("app_sessions").countDocuments({ token_hash: stored.tokenHash }), 1);
      assert.equal(await db.collection("audit_events").countDocuments({}), 1);
    });
    await t.test("logout persists revocation and exactly one deletion audit", async () => {
      await service.logout(await service.inspect(login.token));
      await assert.rejects(service.inspect(login.token), { status: 401 });
      assert.equal(await db.collection("app_sessions").countDocuments({}), 0);
      assert.equal(await db.collection("audit_events").countDocuments({ action: "auth.session.created" }), 1);
      assert.equal(await db.collection("audit_events").countDocuments({ action: "auth.session.deleted" }), 1);
    });
  });
}
