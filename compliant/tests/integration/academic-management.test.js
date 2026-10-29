import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../../server/app.js";
import { createAuthService } from "../../server/auth/service.js";
import { createAcademicManagementService, AcademicManagementError } from "../../server/academics/management-service.js";
import { createSyntheticRepository, SYNTHETIC_PASSWORD } from "../fixtures/auth-repository.js";

const origin = "http://127.0.0.1:3001", base = "/api/admin/academics/";
const term = { name: "Term A", starts_on: null, ends_on: null, status: "planned" };
const subject = { program_id: "b".repeat(24), code: "CS101", name: "Computing", credits: 4, status: "active" };
async function setup(t, { configured = true, auth = true } = {}) {
  const fixture = createSyntheticRepository(), rows = { terms: [], subjects: [] }, calls = []; let failed = false;
  const repository = {
    async list(actor, kind, query) { calls.push({ actor, kind, query }); if (failed) throw Error("private URI and stack"); return { records: structuredClone(rows[kind].slice(query.offset, query.offset + query.limit)), offset: query.offset, hasMore: false }; },
    async create(actor, kind, input) {
      calls.push({ actor, kind, input }); if (failed) throw Error("private URI and stack");
      if (rows[kind].some((row) => kind === "terms" ? row.name === input.name : row.code === input.code && row.program_id === input.program_id)) throw new AcademicManagementError(409, "Duplicate academic record.");
      const record = { id: (rows[kind].length + 1).toString(16).padStart(24, "0"), ...input }; rows[kind].push(record); return { record };
    },
  };
  const app = createApp({ authService: auth ? createAuthService({ repository: fixture.repository }) : undefined,
    managementService: configured ? createAcademicManagementService({ repository, adminScope: "demo" }) : undefined,
    adminScope: "demo", authOrigin: origin, allowInsecureLoopback: true });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeIdleConnections(); }));
  await once(server, "listening");
  const send = (path, options = {}) => fetch("http://127.0.0.1:" + server.address().port + path, { signal: AbortSignal.timeout(10000), ...options });
  async function login(name = "admin") {
    const result = await send("/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: name + "@example.test", password: SYNTHETIC_PASSWORD }) });
    assert.equal(result.status, 200); const body = await result.json();
    return { Cookie: result.headers.getSetCookie()[0].split(";")[0], Origin: origin, "Content-Type": "application/json", "X-CSRF-Token": body.csrfToken };
  }
  return { ...fixture, calls, rows, send, login, fail() { failed = true; } };
}

test("term/subject HTTP denies anonymous, student, teacher and wrong-scope administrator before repository access", async (t) => {
  const f = await setup(t);
  for (const kind of ["terms", "subjects"]) {
    assert.equal((await f.send(base + kind)).status, 401);
    assert.equal((await f.send(base + kind, { method: "POST" })).status, 401);
  }
  for (const name of ["student", "teacher", "otheradmin"]) {
    const headers = { ...await f.login(name), "X-Role": "admin", "X-Scope": "demo", "X-User-Id": "synthetic-admin" };
    for (const kind of ["terms", "subjects"]) {
      assert.equal((await f.send(base + kind, { headers })).status, 403);
      assert.equal((await f.send(base + kind, { method: "POST", headers, body: JSON.stringify(term) })).status, 403);
    }
  }
  assert.equal(f.calls.length, 0);
});
test("term/subject HTTP creates, confirms and lists normalized records then observes scope revocation", async (t) => {
  const f = await setup(t), headers = await f.login();
  for (const [kind, input] of [["terms", term], ["subjects", subject]]) {
    const before = await f.send(base + kind, { headers }); assert.deepEqual((await before.json()).records, []);
    const response = await f.send(base + kind, { method: "POST", headers, body: JSON.stringify({ ...input, name: "  " + input.name + "  " }) });
    assert.equal(response.status, 201); const created = (await response.json()).record;
    assert.equal(created.name, input.name);
    const list = await f.send(base + kind + "?offset=0", { headers }); assert.equal(list.status, 200); assert.equal(list.headers.get("cache-control"), "no-store");
    assert.deepEqual((await list.json()).records, [created]);
  }
  assert.ok(f.calls.every((call) => call.actor === "synthetic-admin"));
  f.roles.set("synthetic-admin", [{ role: "admin", scope: "other" }]);
  assert.equal((await f.send(base + "terms", { headers })).status, 403);
  assert.equal((await f.send(base + "subjects", { method: "POST", headers, body: JSON.stringify(subject) })).status, 403);
});
test("term/subject HTTP rejects invalid/protected fields, query injection and malformed JSON", async (t) => {
  const f = await setup(t), headers = await f.login();
  for (const [kind, input] of [["terms", { ...term, actor_id: "forged" }], ["terms", { ...term, starts_on: "2026-02-30" }], ["terms", { ...term, status: "deleted" }], ["subjects", { ...subject, credits: "4" }], ["subjects", { ...subject, program_id: { $ne: null } }], ["subjects", { ...subject, scope: "demo" }]]) {
    assert.equal((await f.send(base + kind, { method: "POST", headers, body: JSON.stringify(input) })).status, 400);
  }
  for (const query of ["offset=1001", "offset=0&offset=50", "offset[$ne]=0", "scope=demo", "limit=50000"]) assert.equal((await f.send(base + "terms?" + query, { headers })).status, 400);
  assert.equal((await f.send(base + "terms?userId=forged", { method: "POST", headers, body: JSON.stringify(term) })).status, 400);
  assert.equal((await f.send(base + "terms", { method: "POST", headers, body: "{" })).status, 400);
  assert.equal((await f.send(base + "terms", { method: "POST", headers, body: JSON.stringify({ ...term, name: "x".repeat(9000) }) })).status, 413);
  assert.equal(f.calls.length, 0);
});
test("term/subject writes enforce origin, JSON and session-bound CSRF before repository access", async (t) => {
  const f = await setup(t), headers = await f.login();
  for (const change of [{ Origin: "https://evil.example.test" }, { Origin: "null" }, { Origin: "" }, { "Sec-Fetch-Site": "cross-site" }, { "X-CSRF-Token": "forged" }, { "X-CSRF-Token": "" }]) {
    assert.equal((await f.send(base + "terms", { method: "POST", headers: { ...headers, ...change }, body: JSON.stringify(term) })).status, 403);
  }
  assert.equal((await f.send(base + "subjects", { method: "POST", headers: { ...headers, "Content-Type": "text/plain" }, body: JSON.stringify(subject) })).status, 415);
  assert.equal(f.calls.length, 0);
});
test("HTTP concurrent duplicate submissions yield one created record and one conflict in the synthetic repository", async (t) => {
  const f = await setup(t), headers = await f.login();
  for (const [kind, input] of [["terms", term], ["subjects", subject]]) {
    const responses = await Promise.all([1, 2].map(() => f.send(base + kind, { method: "POST", headers, body: JSON.stringify(input) })));
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]); assert.equal(f.rows[kind].length, 1);
  }
});
test("academic management masks repository failure and refuses missing service/auth configuration", async (t) => {
  for (const options of [{}, { configured: false }, { auth: false }]) {
    const f = await setup(t, options), headers = options.auth === false ? {} : await f.login(); f.fail();
    for (const method of ["GET", "POST"]) {
      const result = await f.send(base + "terms", { method, headers, ...(method === "POST" ? { body: JSON.stringify(term) } : {}) });
      assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(await result.json()), /private|stack|mongodb:|password/i);
    }
  }
});
test("management static shell and navigation are served without private records", async (t) => {
  const f = await setup(t);
  const page = await f.send("/pages/academic-management.html"); assert.equal(page.status, 200);
  const html = await page.text(); assert.match(html, /Create a term/); assert.match(html, /Create a subject/); assert.match(html, /fieldset disabled/);
  assert.doesNotMatch(html, /synthetic-admin|Term A|CS101/);
  assert.equal((await f.send("/js/academic-management.js")).status, 200);
  assert.match(await (await f.send("/pages/academics.html")).text(), /href="\/pages\/academic-management.html"/);
  assert.equal((await f.send(base + "terms", { method: "DELETE" })).status, 404);
});
