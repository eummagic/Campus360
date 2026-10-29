// One opt-in acceptance journey, not part of ordinary unit-test discovery.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { ObjectId } from "mongodb";
import { isolatedFixture } from "./essential.mongo.js";
import { createApp } from "../../server/app.js";
import { createMongoAuthRepository } from "../../server/db/auth-repository.js";
import { createMongoStudentRepository } from "../../server/db/student-repository.js";
import { createAuthService } from "../../server/auth/service.js";
import { createStudentService } from "../../server/students/service.js";
import { verifyLegacyPassword } from "../../server/auth/passwords.js";
import { createMongoConnection } from "../../server/db/connection.js";
import { testUri } from "./essential.mongo.js";

test("admin creates a persisted student account, then that student signs in and reads their own page", { timeout: 120_000 }, async (t) => {
  const fixture = await isolatedFixture("demo");
  const { client, db, database, vector } = fixture;
  t.after(() => client.close());
  const timestamp = new Date();
  const departmentId = new ObjectId();
  const programId = new ObjectId();
  await db.collection("departments").insertOne({ _id: departmentId, code: "TEST", name: "Test Department", status: "active", created_at: timestamp, updated_at: timestamp });
  await db.collection("programs").insertOne({ _id: programId, department_id: departmentId, code: "BCA", name: "Computer Applications", status: "active", created_at: timestamp, updated_at: timestamp });
  const connection = createMongoConnection({ uri: testUri, database });
  t.after(() => connection.close());
  const handle = await connection.connect();
  const authService = createAuthService({ repository: createMongoAuthRepository(handle) });
  const studentService = createStudentService({ repository: createMongoStudentRepository({ ...handle, adminScope: "demo" }) });
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on("request", createApp({ authService, studentService, adminScope: "demo", authOrigin: origin, allowInsecureLoopback: true }));
  async function request(path, { cookie, csrf, body, method = "GET" } = {}) {
    return fetch(origin + path, { method, headers: {
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(body ? { Origin: origin, "Content-Type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@example.test", password: vector.password } });
  assert.equal(login.status, 200);
  const adminCookie = login.headers.get("set-cookie").split(";")[0];
  const { csrfToken } = await login.json();
  const student = { name: "New Demo Student", email: "new.student@example.test", password: "SyntheticStudent!2026",
    registrationNumber: " DEMO-001 ", programId: programId.toHexString() };
  assert.equal((await request("/api/admin/students")).status, 401);
  assert.equal((await request("/api/admin/students", { method: "POST", cookie: adminCookie, body: student })).status, 403);
  assert.equal((await request("/api/admin/students", { method: "POST", cookie: adminCookie, csrf: csrfToken, body: { ...student, role: "admin" } })).status, 400);
  const created = await request("/api/admin/students", { method: "POST", cookie: adminCookie, csrf: csrfToken, body: student });
  assert.equal(created.status, 201);
  const confirmation = (await created.json()).student;
  assert.equal(confirmation.registrationNumber, "DEMO-001");
  assert.ok(!("password" in confirmation) && !("passwordHash" in confirmation));
  const createdId = new ObjectId(confirmation.userId);
  const account = await db.collection("account").findOne({ userId: createdId });
  assert.ok(account.userId instanceof ObjectId && typeof account.accountId === "string");
  assert.ok(await verifyLegacyPassword(account.password, student.password));
  assert.equal(await db.collection("profiles").countDocuments({ _id: createdId }), 1);
  assert.equal(await db.collection("user_roles").countDocuments({ user_id: createdId, role: "student", scope: "demo" }), 1);
  assert.equal(await db.collection("student_records").countDocuments({ user_id: createdId, registration_number: "DEMO-001" }), 1);
  assert.equal(await db.collection("audit_events").countDocuments({ action: "student.created", entity_id: new ObjectId(confirmation.id) }), 1);
  const listing = await request("/api/admin/students", { cookie: adminCookie });
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).students[0].registrationNumber, "DEMO-001");
  const duplicate = await request("/api/admin/students", { method: "POST", cookie: adminCookie, csrf: csrfToken, body: { ...student, email: "another@example.test" } });
  assert.equal(duplicate.status, 409);
  assert.equal(await db.collection("user").countDocuments({ email: "another@example.test" }), 0);
  const brokenDb = { client: handle.client, collection(name) {
    const collection = handle.db.collection(name);
    return name === "audit_events" ? { insertOne(document, options) {
      return collection.insertOne({ ...document, created_at: "invalid" }, options);
    } } : collection;
  } };
  const brokenRepository = createMongoStudentRepository({ ...handle, db: brokenDb, adminScope: "demo" });
  await assert.rejects(brokenRepository.createStudent(fixture.userId.toHexString(), {
    name: "Rollback Fixture", email: "rollback@example.test", registrationNumber: "ROLLBACK-001",
    programId: programId.toHexString(), passwordHash: account.password,
  }), { code: 121 });
  assert.equal(await db.collection("user").countDocuments({ email: "rollback@example.test" }), 0);
  assert.equal(await db.collection("profiles").countDocuments({}), 2);
  assert.equal(await db.collection("account").countDocuments({}), 2);
  assert.equal(await db.collection("student_records").countDocuments({}), 1);
  const competing = await Promise.all(["race-one@example.test", "race-two@example.test"].map((email) =>
    request("/api/admin/students", { method: "POST", cookie: adminCookie, csrf: csrfToken,
      body: { ...student, email, registrationNumber: "DEMO-RACE" } })));
  assert.deepStrictEqual(competing.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await db.collection("student_records").countDocuments({ registration_number: "DEMO-RACE" }), 1);
  const studentLogin = await request("/api/auth/login", { method: "POST", body: { email: student.email, password: student.password } });
  assert.equal(studentLogin.status, 200);
  const studentCookie = studentLogin.headers.get("set-cookie").split(";")[0];
  const studentSession = await studentLogin.json();
  const mine = await request("/api/student/me?userId=forged", { cookie: studentCookie });
  assert.equal(mine.status, 200);
  assert.equal((await mine.json()).student.userId, confirmation.userId);
  assert.equal((await request("/api/admin/students", { cookie: studentCookie })).status, 403);
  const studentPost = await request("/api/admin/students", { method: "POST", cookie: studentCookie, csrf: studentSession.csrfToken, body: { ...student, email: "forbidden@example.test" } });
  assert.equal(studentPost.status, 403);
  assert.equal((await request("/")).status, 200);
  assert.equal((await request("/js/app.js")).status, 200);
  assert.equal((await request("/css/app.css")).status, 200);
  console.log(`Demo acceptance passed against ${database}.`);
  // Optional short window for a browser smoke check; no default server is left running.
  if (process.env.CAMPUS360_TEST_PREVIEW === "true") {
    console.log(`Temporary browser preview: ${origin}`);
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
});
