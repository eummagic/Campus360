import express from "express";
import { AuthError, authErrorHandler } from "../auth/errors.js";
import { requireUser, requireAdmin } from "../middleware/authentication.js";
import { requireCsrf, requireJson, requireOrigin } from "../middleware/request-policy.js";
import { StudentError } from "../students/service.js";

export function createStudentRouter({ authService, studentService, origin, adminScope = null }) {
  const router = express.Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(requireUser(authService));
  const admin = requireAdmin({ allowedScopes: [adminScope] });
  router.get("/portal", (request, response) => {
    const has = (role) => request.auth.roles.some((entry) => entry.role === role && entry.scope === adminScope);
    response.json({ canManageStudents: has("admin"), canViewStudent: has("student") });
  });
  router.get("/admin/programs", admin, async (request, response) => {
    response.json({ programs: await studentService.programs(request.auth) });
  });
  router.get("/admin/students", admin, async (request, response) => {
    response.json({ students: await studentService.list(request.auth) });
  });
  router.post("/admin/students", admin, requireOrigin(origin), requireJson,
    express.json({ limit: "8kb", strict: true }), requireCsrf, async (request, response) => {
      response.status(201).json({ student: await studentService.create(request.auth, request.body) });
    });
  router.get("/student/me", async (request, response) => {
    if (!request.auth.roles.some((entry) => entry.role === "student" && entry.scope === adminScope)) {
      throw new AuthError("FORBIDDEN");
    }
    response.json({ student: await studentService.mine(request.auth) });
  });
  router.use((error, request, response, next) => {
    if (error instanceof StudentError) return response.status(error.status).json({ error: error.message });
    return authErrorHandler(error, request, response, next);
  });
  return router;
}
