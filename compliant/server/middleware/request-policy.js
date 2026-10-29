import { AuthError } from "../auth/errors.js";
import { hashSessionToken, verifySessionToken } from "../auth/session.js";

export function requireOrigin(origin) {
  const url = new URL(origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
    throw new TypeError("A canonical application origin is required.");
  }
  return (request, _response, next) => {
    const site = request.headers["sec-fetch-site"];
    if (request.headers.origin !== origin || (site !== undefined && site !== "same-origin")) {
      throw new AuthError("FORBIDDEN");
    }
    next();
  };
}

export function requireJson(request, response, next) {
  if (!request.is("application/json")) {
    return response.status(415).json({ error: "JSON required." });
  }
  next();
}

export function requireCsrf(request, _response, next) {
  if (!verifySessionToken(request.get("X-CSRF-Token"), hashSessionToken(request.auth.csrfToken))) {
    throw new AuthError("FORBIDDEN");
  }
  next();
}
