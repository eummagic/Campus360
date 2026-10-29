import { verifyLegacyPassword } from "./passwords.js";
import {
  SESSION_TTL_MS, createSessionLifetime, createSessionToken,
  hashSessionToken, isValidSessionToken, verifySessionToken,
} from "./session.js";
import { createLoginThrottle } from "./throttle.js";
import { AuthError } from "./errors.js";

// Public synthetic hash, used only for comparable work on unknown/broken accounts.
const DUMMY_HASH = "000102030405060708090a0b0c0d0e0f:eedf8cd62212c4ef27d18a5f1f23f875e2571a8d6bc3cea577255d2cfe8729d8d4646badd72958bccbc96ef736af3a9cc0a4735cee8541bee27d392aeafffc3c";
const rolesAllowed = new Set(["student", "teacher", "admin", "driver", "finance"]);
const boundedString = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max;

export function sessionView(context) {
  return {
    user: { id: context.user.id, email: context.user.email, displayName: context.user.displayName },
    roles: context.roles.map(({ role, scope }) => ({ role, scope })),
    expiresAt: context.expiresAt.toISOString(),
    csrfToken: context.csrfToken,
  };
}

/**
 * Repository contract: findCredentialByEmail -> {userId, passwordHash} or null;
 * findUserById -> {id, email, displayName} or null; listRoles -> [{role, scope}];
 * createSession(record), findSessionByHash(hash), deleteSessionByHash(hash).
 * IDs are opaque normalized strings. This service makes no BSON conversions.
 * No default repository, account provisioning, database, or audit implementation.
 */
export function createAuthService({ repository, now = Date.now, throttle,
  maxConcurrentLogins = 2 }) {
  for (const method of ["findCredentialByEmail", "findUserById", "listRoles",
    "createSession", "findSessionByHash", "deleteSessionByHash"]) {
    if (typeof repository?.[method] !== "function") throw new TypeError("Incomplete auth repository.");
  }
  if (!Number.isSafeInteger(maxConcurrentLogins) || maxConcurrentLogins < 1 || maxConcurrentLogins > 16) {
    throw new RangeError("Invalid login concurrency limit.");
  }
  const limiter = throttle ?? createLoginThrottle({ now });
  const lifetime = createSessionLifetime({ now });
  let activeLogins = 0;

  async function call(method, ...args) {
    try { return await repository[method](...args); }
    catch { throw new AuthError("UNAVAILABLE"); }
  }

  async function identity(userId) {
    const user = await call("findUserById", userId);
    if (!user) throw new AuthError("SESSION");
    if (user.id !== userId || !boundedString(user.id, 128)
      || !boundedString(user.email, 320) || !boundedString(user.displayName, 120)) {
      throw new AuthError("UNAVAILABLE");
    }
    const roles = await call("listRoles", userId);
    if (!Array.isArray(roles) || roles.length > 100 || roles.some((entry) =>
      !entry || !rolesAllowed.has(entry.role) || !(entry.scope === null || boundedString(entry.scope, 64)))) {
      throw new AuthError("UNAVAILABLE");
    }
    return {
      user: Object.freeze({ id: user.id, email: user.email, displayName: user.displayName }),
      roles: Object.freeze(roles.map(({ role, scope }) => Object.freeze({ role, scope }))),
    };
  }

  return Object.freeze({
    async login(input, ip) {
      if (!input || typeof input !== "object" || Array.isArray(input)
        || Object.keys(input).some((key) => !["email", "password"].includes(key))
        || !boundedString(input.email, 320) || !boundedString(input.password, 128)) {
        throw new AuthError("INPUT");
      }
      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email)) {
        throw new AuthError("INPUT");
      }
      const reservation = limiter.attempt({ ip, email });
      if (!reservation.allowed) throw new AuthError("THROTTLED", reservation.retryAfterSeconds);
      if (activeLogins >= maxConcurrentLogins) throw new AuthError("THROTTLED", 1);
      activeLogins += 1;
      try {
        const credential = await call("findCredentialByEmail", email);
        const usable = boundedString(credential?.userId, 128)
          && typeof credential?.passwordHash === "string"
          && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(credential.passwordHash)
          && credential.passwordHash.length === 161;
        const valid = await verifyLegacyPassword(usable ? credential.passwordHash : DUMMY_HASH, input.password);
        if (!usable || !valid) throw new AuthError("CREDENTIALS");
        let principal;
        try { principal = await identity(credential.userId); }
        catch (error) {
          if (error instanceof AuthError && error.status === 401) throw new AuthError("CREDENTIALS");
          throw error;
        }
        if (principal.user.email.trim().toLowerCase() !== email) throw new AuthError("CREDENTIALS");
        const token = createSessionToken();
        const expiresAt = lifetime.createExpiry();
        const record = {
          tokenHash: hashSessionToken(token), userId: principal.user.id,
          csrfToken: createSessionToken(), expiresAt,
          createdAt: new Date(expiresAt.getTime() - SESSION_TTL_MS),
        };
        await call("createSession", record);
        return { token, context: { ...principal, ...record } };
      } finally { activeLogins -= 1; }
    },

    async inspect(token) {
      if (!isValidSessionToken(token)) throw new AuthError("SESSION");
      const tokenHash = hashSessionToken(token);
      const record = await call("findSessionByHash", tokenHash);
      if (!record || !verifySessionToken(token, record.tokenHash) || lifetime.isExpired(record.expiresAt)) {
        throw new AuthError("SESSION");
      }
      if (!boundedString(record.userId, 128) || !isValidSessionToken(record.csrfToken)) {
        throw new AuthError("UNAVAILABLE");
      }
      const principal = await identity(record.userId);
      return { ...principal, tokenHash, csrfToken: record.csrfToken, expiresAt: new Date(record.expiresAt) };
    },

    async logout(context) {
      await call("deleteSessionByHash", context.tokenHash);
    },
  });
}
