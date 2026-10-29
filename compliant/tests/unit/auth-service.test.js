import assert from "node:assert/strict";
import test from "node:test";
import { createAuthService } from "../../server/auth/service.js";
import { createSyntheticRepository, SYNTHETIC_PASSWORD } from "../fixtures/auth-repository.js";

test("concurrent login capacity is reserved before repository awaits and released afterward", async () => {
  const { repository } = createSyntheticRepository();
  const original = repository.findCredentialByEmail;
  let release;
  let started;
  const gate = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { started = resolve; });
  repository.findCredentialByEmail = async (...args) => {
    started();
    await gate;
    return original(...args);
  };
  const service = createAuthService({ repository, now: () => 0, maxConcurrentLogins: 1 });
  const input = { email: "admin@example.test", password: SYNTHETIC_PASSWORD };
  const first = service.login(input, "127.0.0.1");
  await entered;
  try {
    await assert.rejects(service.login(input, "127.0.0.1"), (error) =>
      error.status === 429 && error.retryAfterSeconds === 1);
  } finally { release(); }
  await first;
  assert.equal((await service.login(input, "127.0.0.1")).context.user.id, "synthetic-admin");
});

test("incomplete repositories and invalid concurrency limits fail at configuration time", () => {
  assert.throws(() => createAuthService({ repository: {} }), TypeError);
  const { repository } = createSyntheticRepository();
  for (const maxConcurrentLogins of [0, -1, 1.5, 17, NaN]) {
    assert.throws(() => createAuthService({ repository, maxConcurrentLogins }), RangeError);
  }
});
