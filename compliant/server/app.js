import express from "express";
import { fileURLToPath } from "node:url";
import { healthHandler } from "./handlers/health.js";
import { createAuthRouter } from "./routes/auth.js";
import { createStudentRouter } from "./routes/students.js";
import { createAcademicRouter } from "./routes/academics.js";
import { createRecordRouter } from "./routes/records.js";
import { createAcademicManagementRouter } from "./routes/academic-management.js";

// Resolve relative to this module so startup does not depend on the shell's cwd.
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

export function createApp({ authService, studentService, academicService, managementService, directoryService, profileService, adminScope = null,
  authOrigin = "http://127.0.0.1:3001", allowInsecureLoopback = false } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((_request, response, next) => {
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Referrer-Policy", "no-referrer");
    response.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });

  app.get(["/health", "/api/health"], healthHandler);
  app.use("/api/auth", createAuthRouter({
    service: authService, origin: authOrigin, allowInsecureLoopback,
  }));
  app.use("/api/admin/academics", createAcademicManagementRouter({ authService, managementService, adminScope, origin: authOrigin }));
  app.use("/api/admin/academics", createAcademicRouter({ authService, academicService, adminScope }));
  app.use("/api", createRecordRouter({ authService, directoryService, profileService, origin: authOrigin }));
  if (authService && studentService) {
    app.use("/api", createStudentRouter({ authService, studentService, origin: authOrigin, adminScope }));
  }
  app.use(express.static(publicDirectory, { dotfiles: "ignore", index: "index.html" }));

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found." });
  });

  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    response.status(500).json({ error: "Request failed." });
  });

  return app;
}
