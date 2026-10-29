import { createAcademicPolicy } from "../access/academic.js";
import { AuthError } from "../auth/errors.js";

export class AcademicUnavailable extends Error {
  constructor() { super("Academic overview unavailable. Check database configuration and required collections."); }
}

export function createAcademicService({ repository, adminScope = null } = {}) {
  if (typeof repository?.readOverview !== "function") throw new TypeError("Incomplete academic repository.");
  const authorize = createAcademicPolicy(adminScope);
  return Object.freeze({
    async overview(context) {
      authorize(context);
      try { return await repository.readOverview(context.user.id); }
      catch (error) {
        if (error instanceof AuthError) throw error;
        throw new AcademicUnavailable();
      }
    },
  });
}
