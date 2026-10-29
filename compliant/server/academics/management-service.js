import { AuthError } from "../auth/errors.js";
import { createAcademicPolicy } from "../access/academic.js";

export class AcademicManagementError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const unavailable = () => new AcademicManagementError(503,
  "Academic management unavailable. Required collections, validators and indexes must be provisioned and verified separately.");
const bad = (message) => { throw new AcademicManagementError(400, message); };
function fields(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || required.some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => ![...required, ...optional].includes(key))) bad("Invalid or unexpected fields.");
}
function text(value, max, field) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) bad("Invalid " + field + ".");
  const result = value.normalize("NFKC").trim();
  if (!result || result.length > max) bad("Invalid " + field + ".");
  return result;
}
function day(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) bad("Dates must be valid YYYY-MM-DD values or null.");
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) bad("Invalid calendar date.");
  return value;
}
export function validateAcademicInput(kind, input) {
  if (kind === "terms") {
    fields(input, ["name", "starts_on", "ends_on", "status"]);
    const value = { name: text(input.name, 80, "term name"), starts_on: day(input.starts_on), ends_on: day(input.ends_on), status: input.status };
    if (!["planned", "active", "closed"].includes(value.status)) bad("Invalid term status.");
    if (value.starts_on && value.ends_on && value.starts_on > value.ends_on) bad("End date must not precede start date.");
    return value;
  }
  if (kind !== "subjects") bad("Unknown academic resource.");
  fields(input, ["program_id", "code", "name", "credits", "status"]);
  if (typeof input.program_id !== "string" || !/^[0-9a-f]{24}$/.test(input.program_id)) bad("Invalid program identifier.");
  if (input.credits !== null && (!Number.isInteger(input.credits) || input.credits < 0 || input.credits > 60)) bad("Credits must be an integer from 0 to 60 or null.");
  if (!["active", "inactive"].includes(input.status)) bad("Invalid subject status.");
  return { program_id: input.program_id, code: text(input.code, 32, "subject code"), name: text(input.name, 200, "subject name"), credits: input.credits, status: input.status };
}
export function validateAcademicQuery(query) {
  fields(query, [], ["offset"]);
  const offset = query.offset ?? "0";
  if (typeof offset !== "string" || !/^(0|[1-9][0-9]{0,3})$/.test(offset) || Number(offset) > 1000) bad("Invalid page offset.");
  return { offset: Number(offset), limit: 50 };
}
export function createAcademicManagementService({ repository, adminScope = null } = {}) {
  if (typeof repository?.list !== "function" || typeof repository?.create !== "function") throw new TypeError("Incomplete academic management repository.");
  const authorize = createAcademicPolicy(adminScope);
  async function call(context, operation) {
    authorize(context);
    try { return await operation(); }
    catch (error) {
      if (error instanceof AuthError || error instanceof AcademicManagementError) throw error;
      throw unavailable();
    }
  }
  return Object.freeze({
    list(context, kind, query) { return call(context, () => repository.list(context.user.id, kind, validateAcademicQuery(query))); },
    create(context, kind, input) { return call(context, () => repository.create(context.user.id, kind, validateAcademicInput(kind, input))); },
  });
}
