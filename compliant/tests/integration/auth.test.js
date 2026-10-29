import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { createApp } from "../../server/app.js";
import { createAuthService } from "../../server/auth/service.js";
import { authErrorHandler } from "../../server/auth/errors.js";
import { SESSION_TTL_MS, hashSessionToken, isValidSessionToken } from "../../server/auth/session.js";
import { requireAdmin, requireUser } from "../../server/middleware/authentication.js";
import { createSyntheticRepository, SYNTHETIC_PASSWORD } from "../fixtures/auth-repository.js";

async function setup(t, { enabled = true } = {}) {
  const fixture = createSyntheticRepository();
  let time = 1700000000000;
  const service = createAuthService({ repository: fixture.repository, now: () => time });
  let app;
  const server = createServer((request, response) => app(request, response));
  server.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;

  app = express();
  app.disable("x-powered-by");
  // Test harness endpoints exercise the exported middleware; these routes are
  // not present in the application shipped by createApp().
  app.get("/admin-check", requireUser(service), requireAdmin({ allowedScopes: ["demo"] }),
    (request, response) => response.json({ userId: request.auth.user.id }));
  app.get("/global-admin-check", requireUser(service), requireAdmin(),
    (_request, response) => response.json({ allowed: true }));
  app.use(createApp({ authService: enabled ? service : undefined,
    authOrigin: origin, allowInsecureLoopback: true }));
  app.use(authErrorHandler);

  async function send(path, { method = "GET", body = {}, cookie, csrfToken,
    requestOrigin = origin, headers = {}, rawBody } = {}) {
    const finalHeaders = new Headers(headers);
    if (method !== "GET") {
      if (requestOrigin !== null) finalHeaders.set("Origin", requestOrigin);
      if (!finalHeaders.has("Content-Type")) finalHeaders.set("Content-Type", "application/json");
    }
    if (cookie) finalHeaders.set("Cookie", cookie);
    if (csrfToken) finalHeaders.set("X-CSRF-Token", csrfToken);
    return fetch(`${origin}${path}`, { method, headers: finalHeaders,
      body: method === "GET" ? undefined : (rawBody ?? JSON.stringify(body)),
      signal: AbortSignal.timeout(10000) });
  }
  async function login(name = "admin") {
    const response = await send("/api/auth/login", { method: "POST",
      body: { email: `${name}@example.test`, password: SYNTHETIC_PASSWORD } });
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 1);
    const cookie = cookies[0].split(";")[0];
    return { response, body: await response.json(), cookie, token: cookie.split("=")[1] };
  }
  return { ...fixture, send, login, origin, advance(ms) { time += ms; } };
}

test("login returns an allowlisted view and cookie, storing only a hashed session token", async (t) => {
  const app = await setup(t);
  const login = await app.login();
  assert.deepStrictEqual(login.body.user, {
    id: "synthetic-admin", email: "admin@example.test", displayName: "Synthetic admin",
  });
  assert.deepStrictEqual(login.body.roles, [{ role: "admin", scope: "demo" }]);
  assert(isValidSessionToken(login.token));
  assert(isValidSessionToken(login.body.csrfToken));
  assert.equal(login.body.expiresAt, new Date(1700000000000 + SESSION_TTL_MS).toISOString());
  assert.match(login.response.headers.get("set-cookie"), /Max-Age=28800; Path=\/; HttpOnly; SameSite=Strict$/);
  assert.equal(login.response.headers.get("cache-control"), "no-store");
  const stored = app.sessions.get(hashSessionToken(login.token));
  assert.equal(stored.userId, "synthetic-admin");
  assert.equal(stored.tokenHash, hashSessionToken(login.token));
  assert.equal(JSON.stringify(stored).includes(login.token), false);
  assert.doesNotMatch(JSON.stringify(login.body), /password|tokenHash|internalOnly/);
  assert.equal(JSON.stringify(login.body).includes(login.token), false);
  const session = await app.send("/api/auth/session", { cookie: login.cookie });
  assert.equal(session.status, 200);
  assert.equal(session.headers.get("cache-control"), "no-store");
  assert.deepStrictEqual(await session.json(), login.body);
});

test("unknown accounts, wrong passwords, missing credentials, and broken hashes share generic 401", async (t) => {
  const app = await setup(t);
  app.credentials.delete("teacher@example.test");
  app.credentials.get("student@example.test").passwordHash = "unsupported-hash";
  for (const [email, password] of [["unknown@example.test", SYNTHETIC_PASSWORD],
    ["admin@example.test", "wrong-password"], ["teacher@example.test", SYNTHETIC_PASSWORD],
    ["student@example.test", SYNTHETIC_PASSWORD]]) {
    const response = await app.send("/api/auth/login", { method: "POST", body: { email, password } });
    assert.equal(response.status, 401);
    assert.deepStrictEqual(await response.json(), { error: "Invalid email or password." });
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal(app.sessions.size, 0);
});

test("login normalizes email and never reuses a client-supplied session token", async (t) => {
  const app = await setup(t);
  const fixedToken = "A".repeat(43);
  const response = await app.send("/api/auth/login", { method: "POST",
    cookie: `campus360_session=${fixedToken}`,
    body: { email: " ADMIN@EXAMPLE.TEST ", password: SYNTHETIC_PASSWORD } });
  assert.equal(response.status, 200);
  assert(!response.headers.get("set-cookie").includes(fixedToken));
  assert.equal((await response.json()).user.id, "synthetic-admin");
});

test("anonymous, malformed, duplicate, and query-only cookies cannot authenticate", async (t) => {
  const app = await setup(t);
  const login = await app.login("student");
  for (const cookie of [undefined, "campus360_session=bad", `${login.cookie}; ${login.cookie}`,
    `campus360_session=${login.token}=`]) {
    const response = await app.send("/api/auth/session?userId=synthetic-admin&roles=admin", {
      cookie, headers: { Authorization: "Bearer synthetic-admin", "X-Role": "admin" },
    });
    assert.equal(response.status, 401);
  }
  assert.equal((await app.send("/admin-check")).status, 401);
});

for (const role of ["student", "teacher"]) {
  test(`${role} cannot obtain administrator access through forged roles or IDs`, async (t) => {
    const app = await setup(t);
    const login = await app.login(role);
    const cookie = `${login.cookie}; roles=admin; userId=synthetic-admin`;
    const headers = { "X-Role": "admin", "X-User-Id": "synthetic-admin" };
    const session = await app.send("/api/auth/session?roles=admin&userId=synthetic-admin", { cookie, headers });
    assert.equal((await session.json()).user.id, `synthetic-${role}`);
    const denied = await app.send("/admin-check?role=admin", { cookie, headers });
    assert.equal(denied.status, 403);
    assert.deepStrictEqual(await denied.json(), { error: "Not authorized." });
  });
}

test("admin middleware supports multiple roles, checks current roles, and honors explicit scopes", async (t) => {
  const app = await setup(t);
  const admin = await app.login("dual");
  assert.equal((await app.send("/admin-check", { cookie: admin.cookie })).status, 200);
  assert.equal((await app.send("/global-admin-check", { cookie: admin.cookie })).status, 403);
  app.roles.set("synthetic-dual", [{ role: "student", scope: "demo" }]);
  assert.equal((await app.send("/admin-check", { cookie: admin.cookie })).status, 403);
  const other = await app.login("otheradmin");
  assert.equal((await app.send("/admin-check", { cookie: other.cookie })).status, 403);
});

test("logout clears matching cookie attributes and the old session cannot be replayed", async (t) => {
  const app = await setup(t);
  const login = await app.login();
  const response = await app.send("/api/auth/logout", { method: "POST", cookie: login.cookie,
    csrfToken: login.body.csrfToken });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("set-cookie"), /^campus360_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=\/; HttpOnly; SameSite=Strict$/);
  assert.equal(app.sessions.size, 0);
  assert.equal((await app.send("/api/auth/session", { cookie: login.cookie })).status, 401);
  assert.equal((await app.send("/admin-check", { cookie: login.cookie })).status, 401);
});

test("expiry is enforced at eight hours even when the expired repository row remains", async (t) => {
  const app = await setup(t);
  const login = await app.login();
  app.advance(SESSION_TTL_MS - 1);
  assert.equal((await app.send("/api/auth/session", { cookie: login.cookie })).status, 200);
  app.advance(1);
  assert.equal((await app.send("/api/auth/session", { cookie: login.cookie })).status, 401);
  assert.equal((await app.send("/admin-check", { cookie: login.cookie })).status, 401);
  assert.equal(app.sessions.size, 1);
});

test("login throttling ignores forwarded IP claims and expires with the injected clock", async (t) => {
  const app = await setup(t);
  for (let i = 0; i < 5; i += 1) {
    const response = await app.send("/api/auth/login", { method: "POST",
      headers: { "X-Forwarded-For": `192.0.2.${i}` },
      body: { email: "admin@example.test", password: "wrong-password" } });
    assert.equal(response.status, 401);
  }
  const blocked = await app.send("/api/auth/login", { method: "POST",
    body: { email: "ADMIN@example.test", password: SYNTHETIC_PASSWORD } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "900");
  assert.equal(app.calls.findCredentialByEmail, 5);
  app.advance(900000);
  await app.login();
});

test("login rejects absent, null, noncanonical and cross-origin origins before account lookup", async (t) => {
  const app = await setup(t);
  for (const requestOrigin of [null, "null", "https://other.example.test", `${app.origin}/`]) {
    const response = await app.send("/api/auth/login", { method: "POST", requestOrigin,
      body: { email: "admin@example.test", password: SYNTHETIC_PASSWORD } });
    assert.equal(response.status, 403);
  }
  const crossSite = await app.send("/api/auth/login", { method: "POST",
    headers: { "Sec-Fetch-Site": "cross-site" },
    body: { email: "admin@example.test", password: SYNTHETIC_PASSWORD } });
  assert.equal(crossSite.status, 403);
  assert.equal(app.calls.findCredentialByEmail, undefined);
});

test("logout requires same-origin JSON and the CSRF token bound to that session", async (t) => {
  const app = await setup(t);
  const admin = await app.login();
  const student = await app.login("student");
  for (const csrfToken of [undefined, "bad", student.body.csrfToken]) {
    assert.equal((await app.send("/api/auth/logout", { method: "POST", cookie: admin.cookie, csrfToken })).status, 403);
  }
  assert.equal((await app.send("/api/auth/logout", { method: "POST", cookie: admin.cookie,
    csrfToken: admin.body.csrfToken, requestOrigin: "https://other.example.test" })).status, 403);
  assert.equal((await app.send("/api/auth/logout", { method: "POST", cookie: admin.cookie,
    csrfToken: admin.body.csrfToken, headers: { "Content-Type": "text/plain" } })).status, 415);
  const forgedBody = await app.send("/api/auth/logout", { method: "POST", cookie: admin.cookie,
    csrfToken: admin.body.csrfToken, body: { userId: "synthetic-student", roles: ["admin"] } });
  assert.equal(forgedBody.status, 400);
  assert.deepStrictEqual(await forgedBody.json(), { error: "Invalid request." });
  assert.equal(app.sessions.size, 2);
  assert.equal(app.calls.deleteSessionByHash, undefined);
});

test("invalid input, forged login authority, malformed JSON and oversized bodies are rejected", async (t) => {
  const app = await setup(t);
  for (const body of [{}, [], { email: "bad", password: "x" },
    { email: { $ne: null }, password: "x" }, { email: "admin@example.test", password: {} },
    { email: "admin@example.test", password: "x".repeat(129) },
    { email: "admin@example.test", password: SYNTHETIC_PASSWORD, userId: "synthetic-admin", roles: ["admin"] }]) {
    assert.equal((await app.send("/api/auth/login", { method: "POST", body })).status, 400);
  }
  assert.equal((await app.send("/api/auth/login", { method: "POST", rawBody: "{" })).status, 400);
  assert.equal((await app.send("/api/auth/login", { method: "POST", rawBody: "x".repeat(9000) })).status, 413);
  assert.equal((await app.send("/api/auth/login", { method: "POST",
    headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal(app.calls.findCredentialByEmail, undefined);
});

for (const method of ["findCredentialByEmail", "findUserById", "listRoles", "createSession"]) {
  test(`login repository failure in ${method} returns generic 503 and no cookie`, async (t) => {
    const app = await setup(t);
    app.failures.add(method);
    const response = await app.send("/api/auth/login", { method: "POST",
      body: { email: "admin@example.test", password: SYNTHETIC_PASSWORD } });
    assert.equal(response.status, 503);
    assert.deepStrictEqual(await response.json(), { error: "Authentication unavailable." });
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(app.sessions.size, 0);
  });
}

test("repository failures during inspection or logout do not grant access or report successful revocation", async (t) => {
  const app = await setup(t);
  const login = await app.login();
  for (const method of ["findSessionByHash", "findUserById", "listRoles"]) {
    app.failures.add(method);
    const response = await app.send("/api/auth/session", { cookie: login.cookie });
    assert.equal(response.status, 503);
    assert.deepStrictEqual(await response.json(), { error: "Authentication unavailable." });
    assert.equal((await app.send("/admin-check", { cookie: login.cookie })).status, 503);
    app.failures.delete(method);
  }
  app.failures.add("deleteSessionByHash");
  const response = await app.send("/api/auth/logout", { method: "POST", cookie: login.cookie,
    csrfToken: login.body.csrfToken });
  assert.equal(response.status, 503);
  assert.deepStrictEqual(await response.json(), { error: "Authentication unavailable." });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(app.sessions.size, 1);
});

test("orphaned sessions and malformed repository roles fail closed", async (t) => {
  const app = await setup(t);
  const login = await app.login();
  app.roles.set("synthetic-admin", ["admin"]);
  assert.equal((await app.send("/admin-check", { cookie: login.cookie })).status, 503);
  app.users.delete("synthetic-admin");
  assert.equal((await app.send("/api/auth/session", { cookie: login.cookie })).status, 401);
});

test("normal application startup has unavailable auth endpoints rather than demo identities", async (t) => {
  const app = await setup(t, { enabled: false });
  const response = await app.send("/api/auth/login", { method: "POST",
    body: { email: "admin@example.test", password: SYNTHETIC_PASSWORD } });
  assert.equal(response.status, 503);
  assert.deepStrictEqual(await response.json(), { error: "Authentication unavailable." });
  assert.equal((await app.send("/api/auth/session")).status, 503);
  assert.equal(app.sessions.size, 0);
  assert.deepStrictEqual(app.calls, {});
  assert.equal((await app.send("/health")).status, 200);
});
