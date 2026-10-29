import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createApp } from "../../server/app.js";

async function serve(t, app = createApp()) {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return (path) => fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5000) });
}

test("GET /health returns only a non-cacheable 200 liveness response", async (t) => {
  const get = await serve(t);
  const response = await get("/health");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.deepStrictEqual(await response.json(), { status: "ok" });
});

test("GET /api/health preserves the existing endpoint", async (t) => {
  const get = await serve(t);
  const response = await get("/api/health");
  assert.equal(response.status, 200);
  assert.deepStrictEqual(await response.json(), { status: "ok" });
});

test("GET / serves the actual index.html file", async (t) => {
  const get = await serve(t);
  const response = await get("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html\b/);
  assert.equal(
    await response.text(),
    readFileSync(new URL("../../public/index.html", import.meta.url), "utf8"),
  );
});

test("GET /css/app.css serves the actual stylesheet on the same origin", async (t) => {
  const get = await serve(t);
  const response = await get("/css/app.css");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/css\b/);
  assert.equal(
    await response.text(),
    readFileSync(new URL("../../public/css/app.css", import.meta.url), "utf8"),
  );
});

test("unknown routes and paths outside public return generic JSON 404s", async (t) => {
  const get = await serve(t);
  for (const path of ["/unknown-route", "/api/unknown", "/server/start.js", "/package.json", "/.env"]) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.deepStrictEqual(await response.json(), { error: "Not found." }, path);
  }
});

test("an unexpected error returns a generic 500 without sensitive error details", async (t) => {
  const app = createApp();
  const originalJson = app.response.json;
  const failure = new Error("synthetic-secret-value-not-for-the-client");
  failure.stack = "synthetic-stack-trace-not-for-the-client";
  failure.environment = "synthetic-environment-value-not-for-the-client";

  // Fail this isolated app's health response before any bytes are sent. This
  // exercises the real registered error middleware without adding a test route.
  t.mock.method(app.response, "json", function (body) {
    if (body?.status === "ok") throw failure;
    return originalJson.call(this, body);
  });

  const get = await serve(t, app);
  const response = await get("/health");
  assert.equal(response.status, 500);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  const body = await response.text();
  assert.deepStrictEqual(JSON.parse(body), { error: "Request failed." });
  assert.doesNotMatch(body, /synthetic|stack|environment/i);
});
