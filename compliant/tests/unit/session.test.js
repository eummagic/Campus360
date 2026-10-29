import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_TTL_MS,
  createSessionCookies,
  createSessionLifetime,
  createSessionToken,
  hashSessionToken,
  isValidSessionToken,
  verifySessionToken,
} from "../../server/auth/session.js";

// Public synthetic vector: the bytes 0 through 31, not a stored session.
const token = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const hash = "630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd";

test("creates distinct canonical tokens containing 32 random bytes", () => {
  const tokens = Array.from({ length: 100 }, () => createSessionToken());
  assert.equal(new Set(tokens).size, 100);
  for (const value of tokens) {
    assert.equal(isValidSessionToken(value), true);
    assert.equal(Buffer.from(value, "base64url").length, 32);
  }
});

test("rejects malformed and noncanonical session tokens without normalizing them", () => {
  for (const value of [undefined, null, 123, {}, [], Buffer.alloc(32), "",
    token.slice(1), token + "=", token + "\n", " " + token.slice(1),
    "+" + token.slice(1), "/" + token.slice(1), "A".repeat(42) + "B"]) {
    assert.equal(isValidSessionToken(value), false);
    assert.equal(verifySessionToken(value, hash), false);
  }
});

test("hashes decoded token bytes against the fixed SHA-256 vector", () => {
  assert.equal(hashSessionToken(token), hash);
  assert.equal(verifySessionToken(token, hash), true);
  assert.notEqual(hashSessionToken(token), token);
  assert.throws(() => hashSessionToken("not-a-session"), TypeError);
});

test("rejects mismatched tokens and malformed digests safely", () => {
  assert.equal(verifySessionToken("B" + token.slice(1), hash), false);
  assert.equal(verifySessionToken(token, "0".repeat(64)), false);
  for (const digest of [undefined, null, 123, {}, "", hash.slice(1), hash + "0",
    hash.toUpperCase(), "g" + hash.slice(1), hash.slice(0, -1) + "\n"]) {
    assert.equal(verifySessionToken(token, digest), false);
  }
});

test("HTTPS cookie creation and clearing use matching security attributes", () => {
  const cookies = createSessionCookies({ origin: "https://campus.example.test" });
  const created = cookies.create(token);
  const cleared = cookies.clear();
  assert.equal(created, `campus360_session=${token}; Max-Age=28800; Path=/; HttpOnly; SameSite=Strict; Secure`);
  assert.equal(cleared, "campus360_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Strict; Secure");
  const attributes = (header) => header.split("; ").slice(1)
    .filter((part) => !part.startsWith("Max-Age=") && !part.startsWith("Expires="));
  assert.deepStrictEqual(attributes(created), attributes(cleared));
  assert.doesNotMatch(created + cleared, /Domain=/);
  assert.throws(() => cookies.create("bad\r\nCookie: value"), TypeError);
});

test("HTTP cookies require an explicit loopback exception", () => {
  for (const origin of ["http://127.0.0.1:3001", "http://localhost:3001", "http://[::1]:3001"]) {
    assert.throws(() => createSessionCookies({ origin }), TypeError);
    const cookies = createSessionCookies({ origin, allowInsecureLoopback: true });
    assert.doesNotMatch(cookies.create(token) + cookies.clear(), /; Secure/);
    assert.match(cookies.create(token), /; HttpOnly; SameSite=Strict$/);
  }
  for (const origin of ["http://campus.example.test", "ftp://localhost", "null",
    "https://user:password@campus.example.test", "https://campus.example.test/path"]) {
    assert.throws(() => createSessionCookies({ origin, allowInsecureLoopback: true }), TypeError);
  }
  assert.match(createSessionCookies({
    origin: "https://localhost", allowInsecureLoopback: true,
  }).create(token), /; Secure$/);
});

test("expiry uses the injected clock and expires at the exact boundary", () => {
  let time = 1000;
  const lifetime = createSessionLifetime({ now: () => time });
  const expiry = lifetime.createExpiry();
  assert.equal(expiry.getTime(), 1000 + SESSION_TTL_MS);
  assert.equal(lifetime.isExpired(expiry), false);
  time = expiry.getTime() - 1;
  assert.equal(lifetime.isExpired(expiry), false);
  time += 1;
  assert.equal(lifetime.isExpired(expiry), true);
  time += 1;
  assert.equal(lifetime.isExpired(expiry), true);
});

test("malformed expiry values fail closed and created dates are independent", () => {
  const lifetime = createSessionLifetime({ now: () => 1000 });
  for (const expiry of [undefined, null, {}, 999999999, "2099-01-01", new Date(NaN)]) {
    assert.equal(lifetime.isExpired(expiry), true);
  }
  lifetime.createExpiry().setTime(0);
  assert.equal(lifetime.createExpiry().getTime(), 1000 + SESSION_TTL_MS);
});

test("invalid or overflowing clocks cannot produce usable expiry dates", () => {
  assert.throws(() => createSessionLifetime({ now: 1 }), TypeError);
  for (const time of [NaN, Infinity, -1, 1.5, "1000", 8640000000000000]) {
    const lifetime = createSessionLifetime({ now: () => time });
    assert.throws(() => lifetime.createExpiry(), RangeError);
    assert.throws(() => lifetime.isExpired(new Date(10000)), RangeError);
  }
});
