import { createApp } from "./app.js";
import { createAuthService } from "./auth/service.js";
import { createMongoConnection } from "./db/connection.js";
import { createMongoAuthRepository } from "./db/auth-repository.js";
import { createMongoStudentRepository } from "./db/student-repository.js";
import { createStudentService } from "./students/service.js";
import { createSessionCookies } from "./auth/session.js";
import { createMongoAcademicRepository } from "./db/academic-repository.js";
import { createAcademicService } from "./academics/service.js";
import { createDirectoryService } from "./students/directory-service.js";
import { createProfileService } from "./profile/service.js";
import { createMongoProfileRepository } from "./db/profile-repository.js";

// Explicit opt-in startup. No dotenv, root configuration, implicit schema writes,
// default database, demo identities, or automatic account provisioning.
let connection;
let server;
try {
  const origin = process.env.APP_ORIGIN;
  const url = new URL(origin);
  if (url.origin !== origin || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || url.pathname !== "/" || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid local origin.");
  }
  const insecure = process.env.ALLOW_INSECURE_LOOPBACK === "true";
  createSessionCookies({ origin, allowInsecureLoopback: insecure });
  // This entry point binds HTTP only; HTTPS requires a separately configured server.
  if (url.protocol !== "http:") throw new Error("Local entry point requires loopback HTTP.");
  const adminScope = process.env.ADMIN_SCOPE === undefined ? null : process.env.ADMIN_SCOPE;
  const mongoUrl = new URL(process.env.MONGODB_URI);
  if (mongoUrl.protocol !== "mongodb:" || !["127.0.0.1", "localhost", "[::1]"].includes(mongoUrl.hostname)) {
    throw new Error("This entry point requires an explicitly local MongoDB URI.");
  }
  connection = createMongoConnection({ uri: process.env.MONGODB_URI, database: process.env.MONGODB_DB });
  const handle = await connection.connect();
  const authService = createAuthService({ repository: createMongoAuthRepository(handle) });
  const studentRepository = createMongoStudentRepository({ ...handle, adminScope });
  const studentService = createStudentService({ repository: studentRepository });
  const directoryService = createDirectoryService({ repository: studentRepository, adminScope });
  const profileService = createProfileService({ repository: createMongoProfileRepository(handle) });
  const academicService = createAcademicService({ repository: createMongoAcademicRepository({ ...handle, adminScope }), adminScope });
  const app = createApp({ authService, studentService, academicService, directoryService, profileService, adminScope, authOrigin: origin, allowInsecureLoopback: insecure });
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(Number(url.port || 80), url.hostname === "[::1]" ? "::1" : url.hostname, () => resolve(listener));
    listener.once("error", reject);
  });
  console.log("Campus360 local MongoDB server is ready at the configured APP_ORIGIN.");
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
    if (closing) return;
    closing = true;
    server.closeIdleConnections();
    const deadline = setTimeout(() => server.closeAllConnections(), 5000);
    deadline.unref();
    await new Promise((resolve) => server.close(resolve));
    clearTimeout(deadline);
    try { await connection.close(); } catch { process.exitCode = 1; }
  });
} catch {
  console.error("Campus360 could not start. Check compliant configuration, database readiness, and port availability.");
  if (connection) { try { await connection.close(); } catch { /* No raw connection errors. */ } }
  process.exitCode = 1;
}
