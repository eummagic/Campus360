import { AuthError } from "../auth/errors.js";
import { createAcademicPolicy } from "../access/academic.js";

export const DEFERRED_ACADEMIC_COLLECTIONS = Object.freeze([
  "academic_terms", "subjects", "course_offerings", "teaching_assignments",
  "enrolments", "timetable_entries", "attendance_sessions", "attendance_records", "assignments",
]);

export function createMongoAcademicRepository({ db, ObjectId, adminScope = null } = {}) {
  createAcademicPolicy(adminScope); // Validate configuration before accepting requests.
  if (typeof db?.collection !== "function" || typeof db?.listCollections !== "function"
    || typeof ObjectId !== "function") throw new TypeError("Invalid academic repository configuration.");
  function hex(value) {
    if (!(value instanceof ObjectId)) throw new Error("Inconsistent academic reference.");
    return value.toHexString();
  }
  return Object.freeze({
    async readOverview(actorId) {
      if (typeof actorId !== "string" || !/^[0-9a-f]{24}$/.test(actorId)) throw new AuthError("FORBIDDEN");
      const actor = new ObjectId(actorId);
      if (!await db.collection("user").findOne({ _id: actor }, { projection: { _id: 1 } })
        || !await db.collection("user_roles").findOne({ user_id: actor, role: "admin", scope: adminScope }, { projection: { _id: 1 } })) {
        throw new AuthError("FORBIDDEN");
      }
      const names = ["departments", "programs", ...DEFERRED_ACADEMIC_COLLECTIONS];
      const infos = await db.listCollections({ name: { $in: names } }, { nameOnly: true }).toArray();
      const present = new Set(infos.filter((row) => row.type === "collection").map((row) => row.name));
      if (!present.has("departments") || !present.has("programs")) throw new Error("Missing required collections.");
      const departments = await db.collection("departments").find({}, {
        projection: { _id: 1, code: 1, name: 1, status: 1 },
      }).sort({ code: 1, _id: 1 }).limit(501).toArray();
      const programs = await db.collection("programs").find({}, {
        projection: { _id: 1, department_id: 1, code: 1, name: 1, status: 1 },
      }).sort({ code: 1, _id: 1 }).limit(501).toArray();
      if (departments.length > 500 || programs.length > 500) throw new Error("Overview capacity exceeded.");
      const departmentIds = new Set(departments.map((row) => hex(row._id)));
      return {
        departments: departments.map((row) => ({ id: hex(row._id), code: row.code, name: row.name, status: row.status })),
        programs: programs.map((row) => {
          const departmentId = hex(row.department_id);
          if (!departmentIds.has(departmentId)) throw new Error("Unlinked program.");
          return { id: hex(row._id), departmentId, code: row.code, name: row.name, status: row.status };
        }),
        otherCollections: DEFERRED_ACADEMIC_COLLECTIONS.map((name) => ({ name,
          status: present.has(name) ? "not_included" : "not_provisioned" })),
      };
    },
  });
}
