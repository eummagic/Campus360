import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);

// Creates the same format accepted by the independently verified legacy reader.
// Only newly provisioned credentials use this; existing hashes are never changed.
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128
    || !password.trim() || /[\u0000-\u001f\u007f]/.test(password)) {
    throw new TypeError("Password must contain 8–128 characters without control characters.");
  }
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password.normalize("NFKC"), salt, 64, {
    N: 16384, r: 16, p: 1, maxmem: 67108864,
  });
  return `${salt}:${key.toString("hex")}`;
}
