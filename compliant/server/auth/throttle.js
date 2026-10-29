import { createHash } from "node:crypto";
import { isIP } from "node:net";

/**
 * Single-process sliding-window limiter. attempt() reserves synchronously,
 * before a future caller awaits password verification. Allowed attempts count
 * regardless of login outcome; denied attempts do not refresh their window.
 * maxEntries bounds IP and IP/email buckets together. No active bucket is
 * evicted to admit a new identity. Cleanup is explicit and runs on every attempt.
 * Callers must obtain IP from a trusted socket/proxy policy, never a request body.
 */
export function createLoginThrottle({
  now = Date.now,
  windowMs = 15 * 60 * 1000,
  pairLimit = 5,
  ipLimit = 30,
  maxEntries = 1000,
} = {}) {
  if (typeof now !== "function") throw new TypeError("Clock must be a function.");
  for (const value of [windowMs, pairLimit, ipLimit, maxEntries]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError("Throttle limits must be positive safe integers.");
    }
  }
  if (maxEntries < 2) throw new RangeError("At least two throttle buckets are required.");

  const buckets = new Map();
  let lastNow = 0;
  function currentTime() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value + windowMs)) {
      throw new RangeError("Clock must return a valid nonnegative timestamp.");
    }
    // A backward wall-clock adjustment must not reset an existing limit.
    lastNow = Math.max(lastNow, value);
    return lastNow;
  }
  function prune(time) {
    let removed = 0;
    for (const [key, attempts] of buckets) {
      const active = attempts.filter((stamp) => stamp > time - windowMs);
      if (active.length) buckets.set(key, active);
      else {
        buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
  function denied(waitMs) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
  }

  return Object.freeze({
    attempt({ ip, email }) {
      const family = typeof ip === "string" ? isIP(ip) : 0;
      if (!family || typeof email !== "string" || email.length > 320
        || !email.trim() || /[\u0000-\u001f\u007f]/.test(email)) {
        throw new TypeError("A trusted IP and bounded email key are required.");
      }
      const address = family === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
      const digest = (value) => createHash("sha256").update(value).digest("hex");
      const ipKey = `ip:${digest(address)}`;
      const pairKey = `pair:${digest(`${address}\0${email.trim().toLowerCase()}`)}`;
      const time = currentTime();
      prune(time);
      const ipAttempts = buckets.get(ipKey) ?? [];
      const pairAttempts = buckets.get(pairKey) ?? [];
      let waitMs = 0;
      if (ipAttempts.length >= ipLimit) waitMs = ipAttempts[0] + windowMs - time;
      if (pairAttempts.length >= pairLimit) {
        waitMs = Math.max(waitMs, pairAttempts[0] + windowMs - time);
      }
      if (waitMs > 0) return denied(waitMs);

      const required = Number(!buckets.has(ipKey)) + Number(!buckets.has(pairKey));
      // Fail closed on capacity; a full window is a conservative retry delay.
      if (buckets.size + required > maxEntries) return denied(windowMs);

      ipAttempts.push(time);
      pairAttempts.push(time);
      buckets.set(ipKey, ipAttempts);
      buckets.set(pairKey, pairAttempts);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    cleanup() {
      return prune(currentTime());
    },
    get size() {
      return buckets.size;
    },
  });
}
