import { StudentError } from "../students/service.js";

export function createMongoProfileRepository({ db, client, ObjectId, now = Date.now } = {}) {
  if (!db || db.client !== client || typeof client?.startSession !== "function" || typeof ObjectId !== "function") throw new TypeError("Invalid profile repository configuration.");
  return Object.freeze({
    async updateDisplayName(userId, displayName) {
      if (typeof userId !== "string" || !/^[0-9a-f]{24}$/.test(userId)) throw new StudentError(400, "Invalid identifier.");
      const actor = new ObjectId(userId);
      const timestamp = new Date(now());
      if (!Number.isFinite(timestamp.getTime())) throw new Error("Invalid clock.");
      const eventId = new ObjectId();
      const session = client.startSession();
      try {
        return await session.withTransaction(async () => {
          if (!await db.collection("user").findOne({ _id: actor }, { projection: { _id: 1 }, session })) throw new StudentError(401, "Authentication required.");
          const profile = await db.collection("profiles").findOne({ _id: actor }, { projection: { display_name: 1 }, session });
          if (!profile) throw new StudentError(404, "Profile not found.");
          if (profile.display_name === displayName) return { displayName, changed: false };
          const result = await db.collection("profiles").updateOne({ _id: actor }, { $set: { display_name: displayName, updated_at: timestamp } }, { session });
          if (result.matchedCount !== 1) throw new Error("Profile update failed.");
          await db.collection("audit_events").insertOne({ _id: eventId, actor_id: actor,
            action: "profile.display_name.updated", entity_type: "profiles", entity_id: actor,
            metadata: { before: profile.display_name, after: displayName }, created_at: timestamp }, { session });
          return { displayName, changed: true };
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", timeoutMS: 10_000, maxCommitTimeMS: 5000 });
      } finally { await session.endSession(); }
    },
  });
}
