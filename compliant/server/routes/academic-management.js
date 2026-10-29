import express from "express";
import { AuthError, authErrorHandler } from "../auth/errors.js";
import { requireUser, requireAdmin } from "../middleware/authentication.js";
import { requireOrigin, requireJson, requireCsrf } from "../middleware/request-policy.js";
import { AcademicManagementError, unavailable } from "../academics/management-service.js";

export function createAcademicManagementRouter({ authService, managementService, adminScope = null, origin }) {
  const router = express.Router();
  const authorized = [async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!authService) throw new AuthError("UNAVAILABLE");
    return requireUser(authService)(request, response, next);
  }, requireAdmin({ allowedScopes: [adminScope] })];
  for (const kind of ["terms", "subjects"]) {
    router.get("/" + kind, ...authorized, async (request, response) => {
      if (!managementService) throw unavailable();
      response.json(await managementService.list(request.auth, kind, request.query));
    });
    router.post("/" + kind, ...authorized, requireOrigin(origin), requireJson,
      express.json({ limit: "8kb", strict: true }), requireCsrf, async (request, response) => {
        if (Object.keys(request.query).length) throw new AcademicManagementError(400, "Unexpected query fields.");
        if (!managementService) throw unavailable();
        response.status(201).json(await managementService.create(request.auth, kind, request.body));
      });
  }
  router.use((error, request, response, next) => {
    if (error instanceof AcademicManagementError) return response.status(error.status).json({ error: error.message });
    return authErrorHandler(error, request, response, next);
  });
  return router;
}
