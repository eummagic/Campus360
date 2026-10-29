import { StudentError } from "../students/service.js";

export function createMongoStudentRepository({ db, client, ObjectId, adminScope = null, now = Date.now } = {}) {
  if (!db || db.client !== client || typeof ObjectId !== "function" || typeof client?.startSession !== "function"
    || !(adminScope === null || (typeof adminScope === "string" && adminScope.trim() && adminScope.length <= 64))) {
    throw new TypeError("Invalid student repository configuration.");
  }
  function id(value) {
    if (typeof value !== "string" || value.length !== 24 || !/^[0-9a-f]{24}$/.test(value)) {
      throw new StudentError(400, "Invalid identifier.");
    }
    return new ObjectId(value);
  }
  function hex(value) {
    if (!(value instanceof ObjectId)) throw new Error("Inconsistent student reference.");
    return value.toHexString();
  }
  async function admin(actorId, session) {
    const actor = id(actorId);
    if (!await db.collection("user").findOne({ _id: actor }, { projection: { _id: 1 }, session })
      || !await db.collection("user_roles").findOne({ user_id: actor, role: "admin", scope: adminScope }, { session })) {
      throw new StudentError(403, "Not authorized.");
    }
    return actor;
  }
  const exactInsensitive = (value) => ({ $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" });
  async function view(record) {
    const user = await db.collection("user").findOne({ _id: record.user_id }, { projection: { email: 1 } });
    const profile = await db.collection("profiles").findOne({ _id: record.user_id }, { projection: { display_name: 1 } });
    const program = await db.collection("programs").findOne({ _id: record.program_id }, { projection: { code: 1, name: 1 } });
    if (!user || !profile || !program) throw new Error("Unlinked student record.");
    return {
      id: hex(record._id), userId: hex(record.user_id), name: profile.display_name, email: user.email,
      registrationNumber: record.registration_number, status: record.status,
      program: { id: hex(program._id), code: program.code, name: program.name },
    };
  }
  return Object.freeze({
    async createStudent(actorId, input) {
      const actor = id(actorId);
      const programId = id(input.programId);
      if (typeof input.passwordHash !== "string" || input.passwordHash.length !== 161
        || !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(input.passwordHash)) throw new Error("Invalid new credential hash.");
      const userId = new ObjectId();
      const accountId = new ObjectId();
      const roleId = new ObjectId();
      const recordId = new ObjectId();
      const eventId = new ObjectId();
      const timestamp = new Date(now());
      if (!Number.isFinite(timestamp.getTime())) throw new Error("Invalid clock.");
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await admin(actorId, session);
          if (await db.collection("user").findOne({ email: exactInsensitive(input.email) }, { projection: { _id: 1 }, session })) {
            throw new StudentError(409, "Email address is already in use.");
          }
          if (await db.collection("student_records").findOne({ registration_number: exactInsensitive(input.registrationNumber) }, { projection: { _id: 1 }, session })) {
            throw new StudentError(409, "Registration number is already in use.");
          }
          const program = await db.collection("programs").findOne({ _id: programId, status: "active" }, { session });
          if (!program || !(program.department_id instanceof ObjectId)
            || !await db.collection("departments").findOne({ _id: program.department_id, status: "active" }, { session })) {
            throw new StudentError(400, "Choose an active program in an active department.");
          }
          await db.collection("user").insertOne({ _id: userId, name: input.name, email: input.email,
            emailVerified: false, createdAt: timestamp, updatedAt: timestamp }, { session });
          await db.collection("account").insertOne({ _id: accountId, userId, accountId: hex(userId),
            providerId: "credential", password: input.passwordHash, createdAt: timestamp, updatedAt: timestamp }, { session });
          await db.collection("profiles").insertOne({ _id: userId, display_name: input.name,
            contact_email: input.email, created_at: timestamp, updated_at: timestamp }, { session });
          await db.collection("user_roles").insertOne({ _id: roleId, user_id: userId, role: "student",
            scope: adminScope, assigned_at: timestamp, assigned_by: actor }, { session });
          await db.collection("student_records").insertOne({ _id: recordId, user_id: userId,
            registration_number: input.registrationNumber, program_id: programId, status: "active",
            created_at: timestamp, updated_at: timestamp }, { session });
          await db.collection("audit_events").insertOne({ _id: eventId, actor_id: actor, action: "student.created",
            entity_type: "student_records", entity_id: recordId, metadata: { user_id: hex(userId) }, created_at: timestamp }, { session });
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" },
          readPreference: "primary", timeoutMS: 10_000, maxCommitTimeMS: 5000 });
      } finally { await session.endSession(); }
      // Confirmation contains no credential data. Listing independently re-reads
      // persistence; a failed confirmation must not misreport a committed create.
      return { id: hex(recordId), userId: hex(userId), name: input.name, email: input.email,
        registrationNumber: input.registrationNumber, status: "active", programId: input.programId };
    },
    async listStudents(actorId) {
      await admin(actorId);
      const roles = await db.collection("user_roles").find({ role: "student", scope: adminScope }, { projection: { user_id: 1 } }).limit(501).toArray();
      const records = await db.collection("student_records").find({ user_id: { $in: roles.map((row) => id(hex(row.user_id))) } })
        .sort({ created_at: -1, _id: -1 }).limit(50).toArray();
      const students = [];
      for (const record of records) students.push(await view(record));
      return students;
    },
    async listPrograms(actorId) {
      await admin(actorId);
      const departments = await db.collection("departments").find({ status: "active" }, { projection: { _id: 1 } }).limit(200).toArray();
      const programs = await db.collection("programs").find({ status: "active", department_id: { $in: departments.map((row) => row._id) } })
        .sort({ code: 1 }).limit(200).toArray();
      return programs.map((program) => ({ id: hex(program._id), code: program.code, name: program.name }));
    },
    async getStudent(userId) {
      const user = id(userId);
      if (!await db.collection("user_roles").findOne({ user_id: user, role: "student", scope: adminScope })) {
        throw new StudentError(403, "Not authorized.");
      }
      const record = await db.collection("student_records").findOne({ user_id: user });
      if (!record) throw new StudentError(404, "No academic record is linked to your account.");
      return view(record);
    },
  });
}
