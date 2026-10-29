import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = "campus360_session";

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function isValidSessionToken(token) {
  if (typeof token !== "string" || token.length !== 43 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return false;
  }
  const bytes = Buffer.from(token, "base64url");
  // Round-tripping rejects alternate encodings with nonzero unused padding bits.
  return bytes.length === 32 && bytes.toString("base64url") === token;
}

export function hashSessionToken(token) {
  if (!isValidSessionToken(token)) throw new TypeError("Invalid session token.");
  return createHash("sha256").update(Buffer.from(token, "base64url")).digest("hex");
}

export function verifySessionToken(token, expectedHash) {
  if (!isValidSessionToken(token) || typeof expectedHash !== "string"
    || expectedHash.length !== 64 || !/^[0-9a-f]+$/.test(expectedHash)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(hashSessionToken(token), "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}

/** No environment lookup: insecure HTTP must be explicitly limited to loopback. */
export function createSessionCookies({ origin, allowInsecureLoopback = false }) {
  const url = new URL(origin);
  const secure = url.protocol === "https:";
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.origin !== origin || (!secure && !(url.protocol === "http:"
    && loopback && allowInsecureLoopback === true))) {
    throw new TypeError("Cookies require HTTPS or explicitly allowed loopback HTTP.");
  }
  const attributes = `; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;

  return Object.freeze({
    create(token) {
      if (!isValidSessionToken(token)) throw new TypeError("Invalid session token.");
      return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_TTL_MS / 1000}${attributes}`;
    },
    clear() {
      return `${COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${attributes}`;
    },
  });
}

/** BSON dates only; malformed expiry values fail closed. The clock returns ms. */
export function createSessionLifetime({ now = Date.now } = {}) {
  if (typeof now !== "function") throw new TypeError("Clock must be a function.");
  function currentTime() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000 - SESSION_TTL_MS) {
      throw new RangeError("Clock must return a valid nonnegative timestamp.");
    }
    return value;
  }
  return Object.freeze({
    createExpiry() {
      return new Date(currentTime() + SESSION_TTL_MS);
    },
    isExpired(expiresAt) {
      return !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())
        || expiresAt.getTime() <= currentTime();
    },
  });
}
