const responses = {
  INPUT: [400, "Invalid request."],
  CREDENTIALS: [401, "Invalid email or password."],
  SESSION: [401, "Authentication required."],
  FORBIDDEN: [403, "Not authorized."],
  THROTTLED: [429, "Too many attempts. Try again later."],
  UNAVAILABLE: [503, "Authentication unavailable."],
};

export class AuthError extends Error {
  constructor(code, retryAfterSeconds) {
    const [status, message] = responses[code];
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function authErrorHandler(error, _request, response, next) {
  if (response.headersSent) return next(error);
  if (error instanceof AuthError) {
    if (error.status === 429) response.set("Retry-After", String(error.retryAfterSeconds));
    return response.status(error.status).json({ error: error.message });
  }
  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ error: "Invalid JSON." });
  }
  if (error.type === "entity.too.large") {
    return response.status(413).json({ error: "Request too large." });
  }
  return next(error);
}
