import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createMongoAuthRepository } from "../../server/db/auth-repository.js";
import { createAuthService } from "../../server/auth/service.js";
import { SESSION_TTL_MS } from "../../server/auth/session.js";
import { createFakeMongo, FakeObjectId, clone } from "../fixtures/mongo.js";

const userId = "0123456789abcdef01234567";
const timestamp = Date.UTC(2026, 9, 26);
const { vectors: [vector] } = JSON.parse(readFileSync(new URL("../fixtures/password-vectors.json", import.meta.url), "utf8"));
function setup() {
  const f = createFakeMongo();
  f.state.user.push({ _id: new FakeObjectId(userId), email: "admin@example.test" });
  f.state.account.push({ _id: new FakeObjectId(), userId: new FakeObjectId(userId), providerId: "credential", accountId: userId, password: vector.hash });
  f.state.profiles.push({ _id: new FakeObjectId(userId), display_name: "Synthetic Admin" });
  f.state.user_roles.push({ user_id: new FakeObjectId(userId), role: "admin", scope: "demo" });
  let time = timestamp;
  const now = () => time;
  const repository = createMongoAuthRepository({ ...f, ObjectId: FakeObjectId, now });
  const record = { userId, tokenHash: "a".repeat(64), csrfToken: "A".repeat(43),
    createdAt: new Date(timestamp), expiresAt: new Date(timestamp + SESSION_TTL_MS) };
  return { ...f, repository, record, now, setTime(value) { time = value; } };
}

test("repository requires its database's client and an injected ObjectId constructor", () => {
  assert.throws(() => createMongoAuthRepository(), /dependencies/);
  const f = setup();
  assert.throws(() => createMongoAuthRepository({ ...f, client: {}, ObjectId: FakeObjectId }), /dependencies/);
});

test("credential and profile lookup use exact ObjectId references and allowlisted projections", async () => {
  const f = setup();
  assert.deepStrictEqual(await f.repository.findCredentialByEmail("admin@example.test"), { userId, passwordHash: vector.hash });
  assert.deepStrictEqual(await f.repository.findUserById(userId), { id: userId, email: "admin@example.test", displayName: "Synthetic Admin" });
  const query = f.calls.find(({ name }) => name === "account.query");
  assert.ok(query.filter.userId instanceof FakeObjectId);
  assert.equal(query.filter.providerId, "credential");
  assert.deepStrictEqual(Object.keys(query.filter), ["userId", "providerId"]);
  assert.deepStrictEqual(query.options.projection, { _id: 1, userId: 1, providerId: 1, accountId: 1, password: 1 });
  assert.equal(await f.repository.findCredentialByEmail("missing@example.test"), null);
  assert.equal(await f.repository.findUserById("f".repeat(24)), null);
});

test("strict IDs reject strings of other shapes before querying, with no fallback", async () => {
  const f = setup();
  for (const value of [null, 123, "", userId.toUpperCase(), userId + "\n", "x".repeat(24), new FakeObjectId(userId)]) {
    await assert.rejects(f.repository.findUserById(value), /Inconsistent/);
    await assert.rejects(f.repository.listRoles(value), /Inconsistent/);
  }
  assert.equal(f.calls.length, 0);
  f.state.account[0].userId = userId;
  assert.equal(await f.repository.findCredentialByEmail("admin@example.test"), null);
  const queries = f.calls.filter(({ name }) => name.endsWith(".query"));
  assert.equal(queries.some(({ filter }) => "$or" in filter || "$in" in filter), false);
});

for (const kind of ["duplicate user", "duplicate credential", "wrong accountId", "string user ID", "missing profile", "bad profile", "bad email"]) {
  test(`inconsistent identity fails closed: ${kind}`, async () => {
    const f = setup();
    switch (kind) {
      case "duplicate user": f.state.user.push(clone(f.state.user[0])); break;
      case "duplicate credential": f.state.account.push(clone(f.state.account[0])); break;
      case "wrong accountId": f.state.account[0].accountId = new FakeObjectId(userId); break;
      case "string user ID": f.state.user[0]._id = userId; break;
      case "missing profile": f.state.profiles.length = 0; break;
      case "bad profile": f.state.profiles[0].display_name = " "; break;
      case "bad email": f.state.user[0].email = "Admin@example.test"; break;
    }
    const operation = ["missing profile", "bad profile", "bad email"].includes(kind)
      ? f.repository.findUserById(userId) : f.repository.findCredentialByEmail("admin@example.test");
    await assert.rejects(operation, /Inconsistent/);
  });
}

test("missing and unusable credential inputs remain unavailable to password verification", async () => {
  const f = setup();
  delete f.state.account[0].password;
  assert.equal(await f.repository.findCredentialByEmail("admin@example.test"), null);
  f.state.account.length = 0;
  assert.equal(await f.repository.findCredentialByEmail("admin@example.test"), null);
  await assert.rejects(f.repository.findCredentialByEmail(" Admin@example.test "), /Inconsistent/);
});

test("roles are fetched fresh, allowlisted, and reject ambiguity and invalid scopes", async () => {
  const f = setup();
  assert.deepStrictEqual(await f.repository.listRoles(userId), [{ role: "admin", scope: "demo" }]);
  f.state.user_roles.length = 0;
  assert.deepStrictEqual(await f.repository.listRoles(userId), []);
  for (const row of [{ role: "owner", scope: null }, { role: "admin" }, { role: "admin", scope: " " }]) {
    f.state.user_roles = [{ user_id: new FakeObjectId(userId), ...row }];
    await assert.rejects(f.repository.listRoles(userId), /Inconsistent/);
  }
  f.state.user_roles = Array.from({ length: 2 }, () => ({ user_id: new FakeObjectId(userId), role: "admin", scope: null }));
  await assert.rejects(f.repository.listRoles(userId), /Inconsistent/);
  f.state.user_roles = Array.from({ length: 101 }, (_, i) => ({ user_id: new FakeObjectId(userId), role: "admin", scope: `scope-${i}` }));
  await assert.rejects(f.repository.listRoles(userId), /Inconsistent/);
});

test("session creation maps DTOs and pairs writes sequentially with one audit event", async () => {
  const f = setup();
  await f.repository.createSession(f.record);
  assert.equal(f.state.app_sessions.length, 1);
  const row = f.state.app_sessions[0];
  assert.ok(row.user_id instanceof FakeObjectId);
  assert.deepStrictEqual(Object.keys(row).sort(), ["_id", "created_at", "csrf_token", "expires_at", "token_hash", "user_id"]);
  const event = f.state.audit_events[0];
  assert.equal(event.action, "auth.session.created");
  assert.equal(event.actor_id.toHexString(), userId);
  assert.equal(event.entity_type, "app_sessions");
  assert.equal(event.entity_id.toHexString(), row._id.toHexString());
  assert.deepStrictEqual(event.metadata, { expires_at: f.record.expiresAt.toISOString() });
  assert.equal(JSON.stringify(event).includes(f.record.tokenHash), false);
  assert.equal(JSON.stringify(event).includes(f.record.csrfToken), false);
  const writes = f.calls.filter(({ name }) => name.endsWith(".insertOne"));
  assert.deepStrictEqual(writes.map(({ name }) => name), ["app_sessions.insertOne", "audit_events.insertOne"]);
  assert.ok(writes.every(({ session }) => session === f.client.sessions[0]));
  assert.equal(f.client.sessions[0].ended, 1);
  assert.deepStrictEqual(f.client.sessions[0].options, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", maxCommitTimeMS: 5000, timeoutMS: 10_000 });
  const returned = await f.repository.findSessionByHash(f.record.tokenHash);
  assert.deepStrictEqual(returned, f.record);
  returned.expiresAt.setTime(0);
  assert.notEqual(row.expires_at.getTime(), 0);
});

test("session inputs reject extra authority, invalid formats, invalid dates, and invalid lifetimes", async () => {
  const f = setup();
  for (const value of [null, [], false, () => {}]) {
    await assert.rejects(f.repository.createSession(value), /Inconsistent/);
  }
  for (const changes of [{ role: "admin" }, { userId: "bad" }, { tokenHash: "A".repeat(64) },
    { csrfToken: "A".repeat(42) + "B" }, { createdAt: "2026-10-26" }, { expiresAt: new Date(NaN) },
    { expiresAt: new Date(timestamp) }, { expiresAt: new Date(timestamp + SESSION_TTL_MS + 1) },
    { createdAt: new Date(timestamp + 1) }]) {
    await assert.rejects(f.repository.createSession({ ...f.record, ...changes }), /Inconsistent/);
  }
  assert.equal(f.client.sessions.length, 0);
  await assert.rejects(f.repository.findSessionByHash("x"), /Inconsistent/);
  await assert.rejects(f.repository.deleteSessionByHash("x"), /Inconsistent/);
  assert.equal(f.calls.length, 0);
});

test("expiry excludes retained rows at the exact boundary and rejects a bad clock", async () => {
  const f = setup();
  await f.repository.createSession(f.record);
  f.setTime(timestamp + SESSION_TTL_MS - 1);
  assert.ok(await f.repository.findSessionByHash(f.record.tokenHash));
  f.setTime(timestamp + SESSION_TTL_MS);
  assert.equal(await f.repository.findSessionByHash(f.record.tokenHash), null);
  assert.equal(f.state.app_sessions.length, 1);
  f.setTime(NaN);
  await assert.rejects(f.repository.findSessionByHash(f.record.tokenHash), /Inconsistent/);
});

test("stored session ambiguity and malformed BSON-model references fail closed", async () => {
  const f = setup();
  await f.repository.createSession(f.record);
  const original = clone(f.state.app_sessions[0]);
  f.state.app_sessions.push(clone(original));
  await assert.rejects(f.repository.findSessionByHash(f.record.tokenHash), /Inconsistent/);
  for (const changes of [{ user_id: userId }, { csrf_token: "bad" }, { created_at: new Date(timestamp - 1) }]) {
    f.state.app_sessions = [{ ...clone(original), ...changes }];
    await assert.rejects(f.repository.findSessionByHash(f.record.tokenHash), /Inconsistent/);
  }
});

test("audit insertion failure rolls back creation in the fake transaction model", async () => {
  const f = setup();
  f.failures.add("audit_events.insertOne");
  await assert.rejects(f.repository.createSession(f.record), /Synthetic failure/);
  assert.equal(f.state.app_sessions.length, 0);
  assert.equal(f.state.audit_events.length, 0);
  assert.equal(f.client.sessions[0].ended, 1);
});

test("duplicate token and missing user create no extra session or audit", async () => {
  const f = setup();
  await f.repository.createSession(f.record);
  await assert.rejects(f.repository.createSession(f.record), { code: 11000 });
  assert.equal(f.state.app_sessions.length, 1);
  assert.equal(f.state.audit_events.length, 1);
  f.state.user.length = 0;
  await assert.rejects(f.repository.createSession({ ...f.record, tokenHash: "b".repeat(64) }), /Inconsistent/);
  assert.equal(f.state.app_sessions.length, 1);
  assert.equal(f.state.audit_events.length, 1);
});

test("simulated driver retry reuses IDs and produces only one committed audit", async () => {
  const f = setup();
  f.client.retryOnce = true;
  await f.repository.createSession(f.record);
  assert.equal(f.client.sessions[0].attempts, 2);
  assert.equal(f.state.app_sessions.length, 1);
  assert.equal(f.state.audit_events.length, 1);
  for (const name of ["app_sessions", "audit_events"]) {
    const attempts = f.calls.filter((call) => call.name === `${name}.insertDocument`);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].row._id.toHexString(), attempts[1].row._id.toHexString());
  }
});

test("logout derives its actor from storage and audits one actual deletion", async () => {
  const f = setup();
  await f.repository.createSession(f.record);
  assert.equal(await f.repository.deleteSessionByHash(f.record.tokenHash), true);
  assert.equal(f.state.app_sessions.length, 0);
  assert.equal(f.state.audit_events.length, 2);
  assert.equal(f.state.audit_events[1].action, "auth.session.deleted");
  assert.equal(f.state.audit_events[1].actor_id.toHexString(), userId);
  assert.equal(await f.repository.deleteSessionByHash(f.record.tokenHash), false);
  assert.equal(f.state.audit_events.length, 2);
  assert.ok(f.client.sessions.every(({ ended }) => ended === 1));
});

test("logout audit failure restores the session in the fake transaction model", async () => {
  const f = setup();
  await f.repository.createSession(f.record);
  f.failures.add("audit_events.insertOne");
  await assert.rejects(f.repository.deleteSessionByHash(f.record.tokenHash), /Synthetic failure/);
  assert.equal(f.state.app_sessions.length, 1);
  assert.equal(f.state.audit_events.length, 1);
  assert.equal(f.client.sessions[1].ended, 1);
});

test("session insertion and deletion errors end transactions without adding success audits", async () => {
  const f = setup();
  f.failures.add("app_sessions.insertOne");
  await assert.rejects(f.repository.createSession(f.record), /Synthetic failure/);
  assert.equal(f.state.audit_events.length, 0);
  f.failures.clear();
  await f.repository.createSession(f.record);
  f.failures.add("app_sessions.deleteOne");
  await assert.rejects(f.repository.deleteSessionByHash(f.record.tokenHash), /Synthetic failure/);
  assert.equal(f.state.app_sessions.length, 1);
  assert.equal(f.state.audit_events.length, 1);
  assert.ok(f.client.sessions.every(({ ended }) => ended === 1));
});

test("service maps session lookup and logout audit failures to generic 503 responses", async () => {
  const f = setup();
  const service = createAuthService({ repository: f.repository, now: f.now });
  const login = await service.login({ email: "admin@example.test", password: vector.password }, "127.0.0.1");
  f.failures.add("app_sessions.find");
  await assert.rejects(service.inspect(login.token), { status: 503, message: "Authentication unavailable." });
  f.failures.clear();
  const context = await service.inspect(login.token);
  f.failures.add("audit_events.insertOne");
  await assert.rejects(service.logout(context), { status: 503, message: "Authentication unavailable." });
  assert.equal(f.state.app_sessions.length, 1);
  assert.equal(f.state.audit_events.length, 1);
});

test("existing auth service logs in, sees role revocation, and rejects logout replay using the fake repository", async () => {
  const f = setup();
  const service = createAuthService({ repository: f.repository, now: f.now });
  const login = await service.login({ email: "admin@example.test", password: vector.password }, "127.0.0.1");
  assert.equal((await service.inspect(login.token)).roles[0].role, "admin");
  f.state.user_roles.length = 0;
  assert.deepStrictEqual((await service.inspect(login.token)).roles, []);
  await service.logout(await service.inspect(login.token));
  await assert.rejects(service.inspect(login.token), { status: 401 });
  f.failures.add("user.find");
  await assert.rejects(service.login({ email: "admin@example.test", password: vector.password }, "127.0.0.1"),
    { status: 503, message: "Authentication unavailable." });
});
