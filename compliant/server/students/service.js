import { hashPassword } from "../auth/hash-password.js";
import { AuthError } from "../auth/errors.js";

export class StudentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateStudent(input) {
  const fields = ["name", "email", "password", "registrationNumber", "programId"];
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).length !== fields.length || Object.keys(input).some((key) => !fields.includes(key))
    || fields.some((key) => typeof input[key] !== "string")) {
    throw new StudentError(400, "Provide name, email, initial password, registration number, and program only.");
  }
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const registrationNumber = input.registrationNumber.trim().toUpperCase();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new StudentError(400, "Name must contain 1–120 characters.");
  }
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || /[\u0000-\u001f\u007f]/.test(email)) throw new StudentError(400, "Enter a valid email address.");
  if (registrationNumber.length > 40 || !/^[A-Z0-9][A-Z0-9_/-]*$/.test(registrationNumber)) {
    throw new StudentError(400, "Registration number must contain 1–40 letters, digits, underscores, slashes, or hyphens.");
  }
  if (input.programId.length !== 24 || !/^[0-9a-f]{24}$/.test(input.programId)) {
    throw new StudentError(400, "Choose a valid program.");
  }
  if (input.password.length < 8 || input.password.length > 128 || !input.password.trim()
    || /[\u0000-\u001f\u007f]/.test(input.password)) {
    throw new StudentError(400, "Initial password must contain 8–128 characters without control characters.");
  }
  return { name, email, registrationNumber, programId: input.programId, password: input.password };
}

export function createStudentService({ repository, hash = hashPassword } = {}) {
  for (const method of ["createStudent", "listStudents", "listPrograms", "getStudent"]) {
    if (typeof repository?.[method] !== "function") throw new TypeError("Incomplete student repository.");
  }
  let activeCreates = 0;
  async function call(method, ...args) {
    try { return await repository[method](...args); }
    catch (error) {
      if (error instanceof StudentError) throw error;
      if (error?.code === 11000) {
        const message = error.keyPattern?.email ? "Email address is already in use."
          : error.keyPattern?.registration_number ? "Registration number is already in use."
            : "Email address or registration number is already in use.";
        throw new StudentError(409, message);
      }
      throw new StudentError(503, "Student information is temporarily unavailable.");
    }
  }
  return Object.freeze({
    async create(context, input) {
      const validated = validateStudent(input);
      if (activeCreates >= 2) throw new AuthError("THROTTLED", 1);
      activeCreates += 1;
      try {
        let passwordHash;
        try { passwordHash = await hash(validated.password); }
        catch { throw new StudentError(503, "Student creation is temporarily unavailable."); }
        const { password: _password, ...student } = validated;
        return await call("createStudent", context.user.id, { ...student, passwordHash });
      } finally { activeCreates -= 1; }
    },
    list: (context) => call("listStudents", context.user.id),
    programs: (context) => call("listPrograms", context.user.id),
    mine: (context) => call("getStudent", context.user.id),
  });
}
