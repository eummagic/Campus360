import { AuthError } from "../auth/errors.js";
import { isValidSessionToken } from "../auth/session.js";

function readSessionCookie(header) {
  if (typeof header !== "string" || header.length > 8192) return null;
  let token = null;
  let count = 0;
  for (const part of header.split(";")) {
    const equals = part.indexOf("=");
    const name = (equals === -1 ? part : part.slice(0, equals)).trim();
    if (name !== "campus360_session") continue;
    count += 1;
    token = equals === -1 ? null : part.slice(equals + 1);
  }
  return count === 1 && isValidSessionToken(token) ? token : null;
}

export function requireUser(service) {
  return async (request, _response, next) => {
    // Always replace request authority with a newly verified server-side context.
    request.auth = await service.inspect(readSessionCookie(request.headers.cookie));
    next();
  };
}

export function requireAdmin({ allowedScopes = [null] } = {}) {
  if (!Array.isArray(allowedScopes) || allowedScopes.some((scope) =>
    !(scope === null || (typeof scope === "string" && scope.length > 0 && scope.length <= 64)))) {
    throw new TypeError("An explicit administrator scope allowlist is required.");
  }
  const scopes = new Set(allowedScopes);
  return (request, _response, next) => {
    if (!request.auth) throw new AuthError("SESSION");
    if (!request.auth.roles.some(({ role, scope }) => role === "admin" && scopes.has(scope))) {
      throw new AuthError("FORBIDDEN");
    }
    next();
  };
}
