import assert from "node:assert/strict";
import test from "node:test";
import { createLoginThrottle } from "../../server/auth/throttle.js";

const attempt = { ip: "127.0.0.1", email: "student@example.test" };

test("the default email/IP limit allows five reservations then rejects", () => {
  const throttle = createLoginThrottle({ now: () => 0 });
  for (let i = 0; i < 5; i += 1) assert.equal(throttle.attempt(attempt).allowed, true);
  assert.deepStrictEqual(throttle.attempt(attempt), { allowed: false, retryAfterSeconds: 900 });
});

test("the default IP limit prevents bypass by rotating email keys", () => {
  const throttle = createLoginThrottle({ now: () => 0 });
  for (let i = 0; i < 30; i += 1) {
    assert.equal(throttle.attempt({ ...attempt, email: `student${i}@example.test` }).allowed, true);
  }
  assert.equal(throttle.attempt({ ...attempt, email: "another@example.test" }).allowed, false);
});

test("email case/whitespace and equivalent IPv6 spellings share limits", () => {
  const throttle = createLoginThrottle({ now: () => 0, pairLimit: 1 });
  assert.equal(throttle.attempt({ ...attempt, email: " Student@Example.Test " }).allowed, true);
  assert.equal(throttle.attempt(attempt).allowed, false);
  const ipv6 = createLoginThrottle({ now: () => 0, ipLimit: 1 });
  assert.equal(ipv6.attempt({ ...attempt, ip: "::1" }).allowed, true);
  assert.equal(ipv6.attempt({ ip: "0:0:0:0:0:0:0:1", email: "other@example.test" }).allowed, false);
});

test("sliding windows release individual attempts at the exact expiry boundary", () => {
  let time = 0;
  const throttle = createLoginThrottle({ now: () => time, pairLimit: 2 });
  assert.equal(throttle.attempt(attempt).allowed, true);
  time = 450000;
  assert.equal(throttle.attempt(attempt).allowed, true);
  time = 899999;
  assert.deepStrictEqual(throttle.attempt(attempt), { allowed: false, retryAfterSeconds: 1 });
  time = 900000;
  assert.equal(throttle.attempt(attempt).allowed, true);
  assert.deepStrictEqual(throttle.attempt(attempt), { allowed: false, retryAfterSeconds: 450 });
});

test("denied attempts do not extend the sliding window", () => {
  let time = 0;
  const throttle = createLoginThrottle({ now: () => time, pairLimit: 1, windowMs: 1000 });
  throttle.attempt(attempt);
  time = 999;
  for (let i = 0; i < 10; i += 1) assert.equal(throttle.attempt(attempt).allowed, false);
  time = 1000;
  assert.equal(throttle.attempt(attempt).allowed, true);
});

test("capacity rejection is atomic and never evicts an active limit", () => {
  const throttle = createLoginThrottle({ now: () => 0, maxEntries: 3 });
  assert.equal(throttle.attempt(attempt).allowed, true);
  assert.equal(throttle.size, 2);
  assert.equal(throttle.attempt({ ...attempt, email: "second@example.test" }).allowed, true);
  assert.equal(throttle.size, 3);
  for (let i = 0; i < 100; i += 1) {
    assert.equal(throttle.attempt({ ip: "127.0.0.2", email: `new${i}@example.test` }).allowed, false);
    assert.equal(throttle.size, 3);
  }
  for (let i = 0; i < 4; i += 1) assert.equal(throttle.attempt(attempt).allowed, true);
  assert.equal(throttle.attempt(attempt).allowed, false);
});

test("a full store rejects new email keys even when their IP already exists", () => {
  const throttle = createLoginThrottle({ now: () => 0, maxEntries: 2 });
  throttle.attempt(attempt);
  assert.deepStrictEqual(throttle.attempt({ ...attempt, email: "other@example.test" }), {
    allowed: false, retryAfterSeconds: 900,
  });
  assert.equal(throttle.size, 2);
});

test("cleanup reclaims expired buckets and attempts also clean automatically", () => {
  let time = 0;
  const throttle = createLoginThrottle({ now: () => time, maxEntries: 2 });
  throttle.attempt(attempt);
  assert.equal(throttle.cleanup(), 0);
  time = 900000;
  assert.equal(throttle.cleanup(), 2);
  assert.equal(throttle.size, 0);
  assert.equal(throttle.cleanup(), 0);
  throttle.attempt(attempt);
  time += 900000;
  assert.equal(throttle.attempt({ ip: "127.0.0.2", email: "new@example.test" }).allowed, true);
  assert.equal(throttle.size, 2);
});

test("queued concurrent callers cannot exceed synchronous reservations", async () => {
  const throttle = createLoginThrottle({ now: () => 0 });
  const results = await Promise.all(Array.from({ length: 20 }, () =>
    Promise.resolve().then(() => throttle.attempt(attempt))));
  assert.equal(results.filter((result) => result.allowed).length, 5);
  assert.equal(throttle.size, 2);
});

test("a backward clock adjustment cannot reset a limit", () => {
  let time = 5000;
  const throttle = createLoginThrottle({ now: () => time, pairLimit: 1, windowMs: 1000 });
  throttle.attempt(attempt);
  time = 4500;
  assert.equal(throttle.attempt(attempt).allowed, false);
  time = 5999;
  assert.equal(throttle.attempt(attempt).allowed, false);
  time = 6000;
  assert.equal(throttle.attempt(attempt).allowed, true);
});

test("invalid configuration, keys, and clocks fail without allocating storage", () => {
  assert.throws(() => createLoginThrottle({ now: 1 }), TypeError);
  for (const option of ["windowMs", "pairLimit", "ipLimit", "maxEntries"]) {
    for (const value of [0, -1, 1.5, NaN, Infinity, "5"]) {
      assert.throws(() => createLoginThrottle({ [option]: value }), RangeError);
    }
  }
  assert.throws(() => createLoginThrottle({ maxEntries: 1 }), RangeError);
  const throttle = createLoginThrottle({ now: () => 0 });
  for (const invalid of [{ ...attempt, ip: "not-an-ip" }, { ...attempt, ip: null },
    { ...attempt, email: null }, { ...attempt, email: " " },
    { ...attempt, email: "a".repeat(321) }, { ...attempt, email: "a\nb" }]) {
    assert.throws(() => throttle.attempt(invalid), TypeError);
  }
  assert.equal(throttle.size, 0);
  for (const time of [NaN, Infinity, -1, 1.5, "0", Number.MAX_SAFE_INTEGER]) {
    const badClock = createLoginThrottle({ now: () => time });
    assert.throws(() => badClock.attempt(attempt), RangeError);
    assert.equal(badClock.size, 0);
  }
});
