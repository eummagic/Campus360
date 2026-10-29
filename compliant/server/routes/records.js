import express from "express";
import { AuthError, authErrorHandler } from "../auth/errors.js";
import { requireUser } from "../middleware/authentication.js";
import { requireOrigin, requireJson, requireCsrf } from "../middleware/request-policy.js";
import { StudentError } from "../students/service.js";

export function createRecordRouter({ authService, directoryService, profileService, origin }) {
  const router = express.Router();
  const authenticated = async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!authService) throw new AuthError("UNAVAILABLE");
    return requireUser(authService)(request, response, next);
  };
  const noQuery = (request, _response, next) => {
    if (Object.keys(request.query).length) throw new StudentError(400, "Unexpected query fields.");
    next();
  };
  const directory = () => { if (!directoryService) throw new StudentError(503, "Directory unavailable."); };
  router.get("/directory", authenticated, async (request, response) => {
    directory(); response.json(await directoryService.search(request.auth, request.query));
  });
  router.get("/directory/:recordId", authenticated, noQuery, async (request, response) => {
    directory(); response.json(await directoryService.detail(request.auth, request.params.recordId));
  });
  router.get("/profile", authenticated, noQuery, (request, response) => {
    response.json({ displayName: request.auth.user.displayName, email: request.auth.user.email });
  });
  router.patch("/profile", authenticated, noQuery, requireOrigin(origin), requireJson,
    express.json({ limit: "8kb", strict: true }), requireCsrf, async (request, response) => {
      if (!profileService) throw new StudentError(503, "Profile update unavailable.");
      response.json(await profileService.update(request.auth, request.body));
    });
  router.use((error, request, response, next) => {
    if (error instanceof StudentError) return response.status(error.status).json({ error: error.message });
    return authErrorHandler(error, request, response, next);
  });
  return router;
}
