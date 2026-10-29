import express from "express";
import { AuthError, authErrorHandler } from "../auth/errors.js";
import { sessionView } from "../auth/service.js";
import { createSessionCookies } from "../auth/session.js";
import { requireUser } from "../middleware/authentication.js";
import { requireCsrf, requireJson, requireOrigin } from "../middleware/request-policy.js";

export function createAuthRouter({ service, origin, allowInsecureLoopback }) {
  const router = express.Router();
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  if (!service) {
    // The normal startup has no repository. Never silently enable demo accounts.
    const unavailable = () => { throw new AuthError("UNAVAILABLE"); };
    router.get("/session", unavailable);
    router.post(["/login", "/logout"], unavailable);
  } else {
    const cookies = createSessionCookies({ origin, allowInsecureLoopback });
    const trustedOrigin = requireOrigin(origin);
    const parseJson = express.json({ limit: "8kb", strict: true });
    const authenticated = requireUser(service);

    router.post("/login", trustedOrigin, requireJson, parseJson, async (request, response) => {
      const result = await service.login(request.body, request.socket.remoteAddress);
      response.set("Set-Cookie", cookies.create(result.token));
      response.status(200).json(sessionView(result.context));
    });

    router.get("/session", authenticated, (request, response) => {
      response.json(sessionView(request.auth));
    });

    router.post("/logout", trustedOrigin, requireJson, parseJson,
      authenticated, requireCsrf, async (request, response) => {
        if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)
          || Object.keys(request.body).length !== 0) throw new AuthError("INPUT");
        await service.logout(request.auth);
        response.set("Set-Cookie", cookies.clear());
        response.status(204).end();
      });
  }
  router.use(authErrorHandler);
  return router;
}
