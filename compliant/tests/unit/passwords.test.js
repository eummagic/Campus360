import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { verifyLegacyPassword } from "../../server/auth/passwords.js";

const { vectors } = JSON.parse(
  readFileSync(new URL("../fixtures/password-vectors.json", import.meta.url), "utf8"),
);
const [ascii, unicode] = vectors;

for (const vector of vectors) {
  test(`verifies independent fixed vector: ${vector.name}`, async () => {
    assert.equal(await verifyLegacyPassword(vector.hash, vector.password), true);
  });

  test(`rejects a wrong password: ${vector.name}`, async () => {
    assert.equal(
      await verifyLegacyPassword(vector.hash, "incorrect-demo-password"),
      false,
    );
  });
}

test("verifies the NFKC-equivalent Unicode password", async () => {
  assert.notEqual(unicode.password, unicode.normalizedPassword);
  assert.equal(
    await verifyLegacyPassword(unicode.hash, unicode.normalizedPassword),
    true,
  );
});

test("does not trim password whitespace", async () => {
  assert.equal(await verifyLegacyPassword(ascii.hash, ` ${ascii.password}`), false);
  assert.equal(await verifyLegacyPassword(ascii.hash, `${ascii.password} `), false);
});

test("rejects a well-formed but modified stored key", async () => {
  const lastCharacter = ascii.hash.at(-1) === "0" ? "1" : "0";
  const modifiedHash = ascii.hash.slice(0, -1) + lastCharacter;
  assert.equal(await verifyLegacyPassword(modifiedHash, ascii.password), false);
});

test("rejects invalid inputs before invoking scrypt and propagates crypto failures", async (t) => {
  const failure = new Error("Synthetic crypto failure");
  let calls = 0;
  const originalScrypt = crypto.scrypt;

  // A fresh module instance captures this synthetic crypto stub. Synchronize
  // built-in named exports, and restore them even if an assertion fails.
  t.mock.method(crypto, "scrypt", (...args) => {
    calls += 1;
    queueMicrotask(() => args.at(-1)(failure));
  });
  syncBuiltinESMExports();

  try {
    const { verifyLegacyPassword: verifyWithFailure } = await import(
      "../../server/auth/passwords.js?synthetic-crypto-failure"
    );
    const invalidHashes = [
      undefined,
      null,
      123,
      {},
      [],
      "",
      ascii.hash.slice(1),
      ascii.hash + "0",
      ascii.hash.replace(":", ""),
      ascii.hash.replace(":", "::"),
      "g" + ascii.hash.slice(1),
      ascii.hash.slice(0, 33) + "g" + ascii.hash.slice(34),
      ascii.hash.toUpperCase(),
      " " + ascii.hash.slice(1),
      ascii.hash.slice(0, -1) + "\n",
      "x".repeat(10000),
    ];
    for (const [index, hash] of invalidHashes.entries()) {
      assert.equal(
        await verifyWithFailure(hash, ascii.password),
        false,
        `invalid hash case ${index}`,
      );
    }

    const invalidPasswords = [undefined, null, 123, {}, [], "", "x".repeat(129)];
    for (const [index, password] of invalidPasswords.entries()) {
      assert.equal(
        await verifyWithFailure(ascii.hash, password),
        false,
        `invalid password case ${index}`,
      );
    }
    assert.equal(calls, 0, "invalid inputs must not invoke scrypt");

    // Boundary values reach crypto. This does not claim that they match a hash
    // or satisfy the separate minimum length policy for new credentials.
    for (const password of ["x", "x".repeat(128)]) {
      await assert.rejects(
        verifyWithFailure(ascii.hash, password),
        (error) => error === failure,
      );
    }
    assert.equal(calls, 2);

    await assert.rejects(
      verifyWithFailure(ascii.hash, ascii.password),
      (error) => error === failure,
    );
    assert.equal(calls, 3);
  } finally {
    crypto.scrypt = originalScrypt;
    syncBuiltinESMExports();
  }
});

test("imports without application environment settings or external dependencies", () => {
  const moduleUrl = new URL("../../server/auth/passwords.js", import.meta.url);
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(moduleUrl.href)});`],
    {
      env: { NODE_DISABLE_COMPILE_CACHE: "1" },
      encoding: "utf8",
      timeout: 10000,
    },
  );

  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "");
});
