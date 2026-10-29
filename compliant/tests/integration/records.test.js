import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../../server/app.js";
import { createAuthService } from "../../server/auth/service.js";
import { createDirectoryService } from "../../server/students/directory-service.js";
import { createProfileService } from "../../server/profile/service.js";
import { StudentError } from "../../server/students/service.js";
import { createSyntheticRepository, SYNTHETIC_PASSWORD } from "../fixtures/auth-repository.js";

const recordId = "e".repeat(24);
async function setup(t) {
  const f = createSyntheticRepository(); const calls = []; let failure = false;
  const student = { id: recordId, name: "Student One", registrationNumber: "REG-001", status: "active", program: { id: "1".repeat(24), code: "BCA", name: "Applications" } };
  const directoryService = createDirectoryService({ adminScope: "demo", repository: {
    async searchDirectory(actor, filters) { calls.push({ actor, filters }); if (failure) throw new Error("private detail"); return { students: [student], hasMore: false, offset: filters.offset }; },
    async getStudentDetail(actor, id) {
      calls.push({ actor, id });
      if (id !== recordId || !["synthetic-student", "synthetic-admin"].includes(actor)) throw new StudentError(404, "Student record not found.");
      return { student, enrolments: [], enrolmentStatus: "not_provisioned", missingCollections: ["enrolments"] };
    },
  } });
  const profileService = createProfileService({ repository: { async updateDisplayName(actor, name) {
    calls.push({ actor, name }); if (failure) throw new Error("private detail");
    f.users.get(actor).displayName = name; return { displayName: name, changed: true };
  } } });
  const app = createApp({ authService: createAuthService({ repository: f.repository }), directoryService, profileService,
    adminScope: "demo", authOrigin: "http://127.0.0.1:3001", allowInsecureLoopback: true });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeIdleConnections(); }));
  await once(server, "listening");
  const send = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { signal: AbortSignal.timeout(10000), ...options });
  async function login(name) {
    const response = await send("/api/auth/login", { method: "POST", headers: { Origin: "http://127.0.0.1:3001", "Content-Type": "application/json" }, body: JSON.stringify({ email: `${name}@example.test`, password: SYNTHETIC_PASSWORD }) });
    assert.equal(response.status, 200);
    return { cookie: response.headers.getSetCookie()[0].split(";")[0], body: await response.json() };
  }
  return { ...f, send, login, calls, fail() { failure = true; } };
}
test("directory HTTP authenticates and denies teacher/student/wrong-scope admin despite forged headers", async (t) => {
  const f = await setup(t);
  for (const path of ["/api/directory", `/api/directory/${recordId}`, "/api/profile"]) assert.equal((await f.send(path)).status, 401);
  for (const name of ["student", "teacher", "otheradmin"]) {
    const { cookie } = await f.login(name);
    assert.equal((await f.send("/api/directory", { headers: { Cookie: cookie, "X-Role": "admin", "X-Scope": "demo", "X-User-Id": "synthetic-admin" } })).status, 403);
  }
  assert.equal(f.calls.length, 0);
});
test("directory HTTP normalizes filters, rejects injection/repeats and masks infrastructure failures", async (t) => {
  const f = await setup(t); const { cookie } = await f.login("admin"); const headers = { Cookie: cookie };
  const response = await f.send("/api/directory?q=%20Student%20&status=active&programId=" + "A".repeat(24), { headers });
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).students.length, 1);
  assert.deepEqual(f.calls[0], { actor: "synthetic-admin", filters: { q: "Student", status: "active", programId: "a".repeat(24), offset: 0, limit: 50 } });
  for (const query of ["q=a&q=b", "q[$ne]=x", "role=admin", "userId=forged", "offset=1001", "status=owner"]) assert.equal((await f.send(`/api/directory?${query}`, { headers })).status, 400);
  f.fail(); const failure = await f.send("/api/directory", { headers }); assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /private detail/);
  f.roles.set("synthetic-admin", [{ role: "admin", scope: "other" }]);
  assert.equal((await f.send("/api/directory", { headers })).status, 403);
});
test("student detail HTTP permits own record, rejects guessed records/IDs and teacher access", async (t) => {
  const f = await setup(t); const { cookie } = await f.login("student"); const headers = { Cookie: cookie };
  const response = await f.send(`/api/directory/${recordId}`, { headers }); assert.equal(response.status, 200);
  assert.equal((await response.json()).enrolmentStatus, "not_provisioned");
  assert.equal((await f.send(`/api/directory/${"f".repeat(24)}`, { headers })).status, 404);
  assert.equal((await f.send(`/api/directory/${recordId}?userId=synthetic-admin`, { headers })).status, 400);
  assert.equal((await f.send("/api/directory/invalid", { headers })).status, 400);
  const teacher = await f.login("teacher");
  assert.equal((await f.send(`/api/directory/${recordId}`, { headers: { Cookie: teacher.cookie } })).status, 403);
  const admin = await f.login("admin");
  assert.equal((await f.send(`/api/directory/${recordId}`, { headers: { Cookie: admin.cookie } })).status, 200);
});
test("profile HTTP updates only signed-in user, re-reads persisted name, and rejects protected fields", async (t) => {
  const f = await setup(t); const { cookie, body } = await f.login("student");
  const headers = { Cookie: cookie, Origin: "http://127.0.0.1:3001", "Content-Type": "application/json", "X-CSRF-Token": body.csrfToken };
  const patch = (input, changes = {}, path = "/api/profile") => f.send(path, { method: "PATCH", headers: { ...headers, ...changes }, body: JSON.stringify(input) });
  const response = await patch({ displayName: "  New Student  " }); assert.equal(response.status, 200);
  assert.equal((await response.json()).displayName, "New Student");
  assert.deepEqual(f.calls[0], { actor: "synthetic-student", name: "New Student" });
  const current = await f.send("/api/profile", { headers: { Cookie: cookie } });
  assert.deepEqual(await current.json(), { displayName: "New Student", email: "student@example.test" });
  for (const key of ["userId", "email", "role", "scope", "registrationNumber", "programId"]) assert.equal((await patch({ displayName: "Other", [key]: "forged" })).status, 400);
  assert.equal((await patch({ displayName: "x" }, {}, "/api/profile?userId=forged")).status, 400);
  assert.equal((await patch({ displayName: " " })).status, 400);
  assert.equal((await patch({ displayName: "x" }, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await patch({ displayName: "x" }, { "X-CSRF-Token": "bad" })).status, 403);
  assert.equal((await patch({ displayName: "x" }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal(f.calls.length, 1);
  f.fail(); const failed = await patch({ displayName: "Name" }); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private detail/);
});
test("directory/detail/profile page shells and modules are available without embedding records", async (t) => {
  const f = await setup(t);
  for (const path of ["/pages/directory.html", "/pages/student.html", "/pages/profile.html", "/js/records-api.js", "/js/directory.js", "/js/student-detail.js", "/js/profile.js"]) {
    const response = await f.send(path); assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /REG-001|synthetic-student/);
  }
});
