import express from "express";
import { AuthError, authErrorHandler } from "../auth/errors.js";
import { requireUser, requireAdmin } from "../middleware/authentication.js";
import { AcademicUnavailable } from "../academics/service.js";

export function createAcademicRouter({ authService, academicService, adminScope = null }) {
  const router = express.Router();
  router.get("/overview", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!authService) throw new AuthError("UNAVAILABLE");
    next();
  }, async (request, response, next) => requireUser(authService)(request, response, next),
  requireAdmin({ allowedScopes: [adminScope] }), async (request, response) => {
    if (!academicService) throw new AcademicUnavailable();
    response.json(await academicService.overview(request.auth));
  });
  router.use((error, request, response, next) => {
    if (error instanceof AcademicUnavailable) return response.status(503).json({ error: error.message });
    return authErrorHandler(error, request, response, next);
  });
  return router;
}
