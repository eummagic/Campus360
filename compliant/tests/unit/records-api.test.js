import assert from "node:assert/strict";
import test from "node:test";
import { api } from "../../public/js/records-api.js";

test("directory API route 404 explains stale backend instead of implying an empty directory", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/directory?offset=0");
    assert.equal(options.credentials, "same-origin");
    return Response.json({ error: "Not found." }, { status: 404 });
  };
  await assert.rejects(api("/api/directory?offset=0"), {
    message: "API route unavailable (HTTP 404). Restart the local backend to load the current application.",
  });
});

test("API helper distinguishes empty results, missing records, authorization and service failures", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ students: [], hasMore: false });
  assert.deepEqual(await api("/api/directory?offset=0"), { students: [], hasMore: false });
  for (const [status, error, expected] of [
    [401, "Authentication required.", "Sign in through the portal first."],
    [403, "Not authorized.", "You do not have permission to view or change this information."],
    [404, "Student record not found.", "Student record not found."],
    [503, "Student information is temporarily unavailable.", "Student information is temporarily unavailable."],
  ]) {
    globalThis.fetch = async () => Response.json({ error }, { status });
    await assert.rejects(api("/api/directory"), { message: expected });
  }
});
