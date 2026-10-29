import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const HASH_FORMAT = /^[0-9a-f]{32}:[0-9a-f]{128}$/;
const SCRYPT_OPTIONS = Object.freeze({
  N: 16384,
  r: 16,
  p: 1,
  maxmem: 67108864,
});

/**
 * Verify the default Better Auth 1.7.13 / utils 0.5.1 password format.
 * The salt is hexadecimal TEXT passed to scrypt as UTF-8, not decoded bytes.
 * Passwords are NFKC-normalized but never trimmed. The 128-code-unit bound
 * matches this project's configured login limit; creation policy is separate.
 * Invalid input returns false. Operational crypto failures reject the promise.
 * This module neither creates credentials nor reads configuration or storage.
 */
export async function verifyLegacyPassword(hash, password) {
  if (
    typeof hash !== "string" ||
    hash.length !== 161 ||
    !HASH_FORMAT.test(hash) ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 128
  ) {
    return false;
  }

  const [salt, keyHex] = hash.split(":");
  const actualKey = await deriveKey(
    password.normalize("NFKC"),
    salt,
    64,
    SCRYPT_OPTIONS,
  );

  return timingSafeEqual(actualKey, Buffer.from(keyHex, "hex"));
}
