import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { healthHandler } from "../../server/handlers/health.js";

function captureResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("health returns only a non-cacheable 200 liveness response", () => {
  const response = captureResponse();
  assert.equal(healthHandler({}, response), response);
  assert.equal(response.statusCode, 200);
  assert.deepStrictEqual(response.headers, { "Cache-Control": "no-store" });
  assert.deepStrictEqual(response.body, { status: "ok" });
});

test("health does not inspect or echo request data", () => {
  const request = new Proxy({}, {
    get() {
      assert.fail("The liveness handler must not read request data.");
    },
  });
  const response = captureResponse();
  healthHandler(request, response);
  assert.deepStrictEqual(response.body, { status: "ok" });
});

test("health imports without Express or application environment configuration", () => {
  const moduleUrl = new URL("../../server/handlers/health.js", import.meta.url);
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(moduleUrl.href)});`],
    {
      env: { NODE_DISABLE_COMPILE_CACHE: "1" },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
