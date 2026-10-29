import { requireAdmin } from "../middleware/authentication.js";

// Reuse the same explicit scope allowlist as student administration.
export function createAcademicPolicy(adminScope = null) {
  const check = requireAdmin({ allowedScopes: [adminScope] });
  return (context) => check({ auth: context }, null, () => {});
}
