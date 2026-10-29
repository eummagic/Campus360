import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../../server/app.js";
import { createAuthService } from "../../server/auth/service.js";
import { createAcademicService } from "../../server/academics/service.js";
import { createSyntheticRepository, SYNTHETIC_PASSWORD } from "../fixtures/auth-repository.js";

async function setup(t, { auth = true, academic = true, failure = false } = {}) {
  const fixture = createSyntheticRepository();
  let reads = 0;
  const expected = { departments: [{ id: "dept", code: "CS", name: "Computing", status: "active" }],
    programs: [{ id: "program", departmentId: "dept", code: "BCA", name: "Applications", status: "active" }],
    otherCollections: [{ name: "academic_terms", status: "not_provisioned" }] };
  const academicService = createAcademicService({ adminScope: "demo", repository: { async readOverview(id) {
    reads++; assert.equal(id, "synthetic-admin");
    if (failure) throw new Error("secret database detail");
    return structuredClone(expected);
  } } });
  const app = createApp({ adminScope: "demo", authOrigin: "http://127.0.0.1:3001", allowInsecureLoopback: true,
    authService: auth ? createAuthService({ repository: fixture.repository }) : undefined,
    academicService: academic ? academicService : undefined });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeIdleConnections(); }));
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = (path, options) => fetch(origin + path, { signal: AbortSignal.timeout(10000), ...options });
  async function login(name) {
    const response = await send("/api/auth/login", { method: "POST", headers: {
      Origin: "http://127.0.0.1:3001", "Content-Type": "application/json",
    }, body: JSON.stringify({ email: `${name}@example.test`, password: SYNTHETIC_PASSWORD }) });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie()[0].split(";")[0];
  }
  return { ...fixture, send, login, expected, reads: () => reads };
}
test("academic HTTP denies anonymous, student, teacher, wrong scope and forged role requests", async (t) => {
  const app = await setup(t);
  assert.equal((await app.send("/api/admin/academics/overview")).status, 401);
  for (const name of ["student", "teacher", "otheradmin"]) {
    const cookie = await app.login(name);
    const response = await app.send("/api/admin/academics/overview?role=admin&scope=demo", {
      headers: { Cookie: cookie, "X-Role": "admin", "X-User-Id": "synthetic-admin" },
    });
    assert.equal(response.status, 403);
  }
  assert.equal(app.reads(), 0);
});
test("academic HTTP returns read-only data and observes role revocation", async (t) => {
  const app = await setup(t);
  const cookie = await app.login("admin");
  const response = await app.send("/api/admin/academics/overview", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), app.expected);
  assert.equal((await app.send("/api/admin/academics/overview", { method: "POST", headers: { Cookie: cookie } })).status, 404);
  assert.equal(app.reads(), 1);
  app.roles.set("synthetic-admin", [{ role: "admin", scope: "other" }]);
  assert.equal((await app.send("/api/admin/academics/overview", { headers: { Cookie: cookie } })).status, 403);
  assert.equal(app.reads(), 1);
});
test("academic HTTP reports missing auth/service configuration and masks repository errors", async (t) => {
  for (const options of [{ auth: false }, { academic: false }, { failure: true }]) {
    const app = await setup(t, options);
    const cookie = options.auth === false ? "" : await app.login("admin");
    const response = await app.send("/api/admin/academics/overview", { headers: { Cookie: cookie } });
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /secret|stack|password|mongodb:/i);
  }
});
test("academic static shell and browser module are served without embedding private data", async (t) => {
  const app = await setup(t);
  const page = await app.send("/pages/academics.html");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Academic overview/);
  assert.doesNotMatch(html, /synthetic-admin|Computing/);
  assert.equal((await app.send("/js/academics.js")).status, 200);
  assert.match(await (await app.send("/")).text(), /href="\/pages\/academics.html"/);
});
