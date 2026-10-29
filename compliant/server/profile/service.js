import { StudentError } from "../students/service.js";

export function validateDisplayName(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1
    || typeof input.displayName !== "string" || !Object.hasOwn(input, "displayName")) throw new StudentError(400, "Provide displayName only.");
  const name = input.displayName.trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new StudentError(400, "Display name must contain 1–120 characters without control characters.");
  return name;
}
export function createProfileService({ repository } = {}) {
  return Object.freeze({
    async update(context, input) {
      const name = validateDisplayName(input);
      try { return await repository.updateDisplayName(context.user.id, name); }
      catch (error) { if (error instanceof StudentError) throw error; throw new StudentError(503, "Profile update is temporarily unavailable."); }
    },
  });
}
