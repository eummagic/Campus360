import { StudentError } from "./service.js";
import { createAcademicPolicy } from "../access/academic.js";

export function validateDirectoryQuery(query = {}) {
  if (Object.keys(query).some((key) => !["q", "status", "programId", "offset"].includes(key))
    || Object.values(query).some((value) => typeof value !== "string")) throw new StudentError(400, "Invalid directory filters.");
  const q = (query.q ?? "").trim();
  const status = query.status || "";
  const programId = (query.programId || "").toLowerCase();
  const offset = query.offset ?? "0";
  if (q.length > 120 || /[\u0000-\u001f\u007f]/.test(q)
    || !["", "active", "inactive", "graduated"].includes(status)
    || (programId && !/^[0-9a-f]{24}$/.test(programId))
    || !/^(0|[1-9][0-9]{0,3})$/.test(offset) || Number(offset) > 1000) throw new StudentError(400, "Invalid directory filters.");
  return { q, status, programId, offset: Number(offset), limit: 50 };
}

export function createDirectoryService({ repository, adminScope = null } = {}) {
  const admin = createAcademicPolicy(adminScope);
  async function call(method, ...args) {
    try { return await repository[method](...args); }
    catch (error) { if (error instanceof StudentError) throw error; throw new StudentError(503, "Student information is temporarily unavailable."); }
  }
  return Object.freeze({
    search(context, query) {
      admin(context);
      return call("searchDirectory", context.user.id, validateDirectoryQuery(query));
    },
    detail(context, recordId) {
      if (!context) { admin(context); }
      if (!context.roles.some(({ role, scope }) => ["admin", "student"].includes(role) && scope === adminScope)) {
        throw new StudentError(403, "Not authorized.");
      }
      if (typeof recordId !== "string" || !/^[0-9a-f]{24}$/.test(recordId)) throw new StudentError(400, "Invalid student record identifier.");
      return call("getStudentDetail", context.user.id, recordId);
    },
  });
}
