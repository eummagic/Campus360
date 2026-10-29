import { SESSION_TTL_MS, isValidSessionToken } from "../auth/session.js";

const ID = /^[0-9a-f]{24}$/;
const HASH = /^[0-9a-f]{64}$/;
const roleNames = new Set(["student", "teacher", "admin", "driver", "finance"]);
const text = (value, max) => typeof value === "string" && value.length > 0
  && value.length <= max && value.trim().length > 0;
const date = (value) => value instanceof Date && Number.isFinite(value.getTime());
const integrity = () => new Error("Inconsistent authentication data.");

/** Inject the db, its owning client, and ObjectId from an explicit connection.
 * No driver import, database connection, provisioning, or schema initialization.
 */
export function createMongoAuthRepository({ db, client, ObjectId, now = Date.now } = {}) {
  if (!db || db.client !== client || typeof db.collection !== "function"
    || typeof client?.startSession !== "function" || typeof ObjectId !== "function"
    || typeof now !== "function") throw new TypeError("Invalid MongoDB repository dependencies.");

  function id(value) {
    if (typeof value !== "string" || value.length !== 24 || !ID.test(value)) throw integrity();
    return new ObjectId(value);
  }
  function hex(value) {
    if (!(value instanceof ObjectId)) throw integrity();
    const result = value.toHexString();
    if (typeof result !== "string" || result.length !== 24 || !ID.test(result)) throw integrity();
    return result;
  }
  function hash(value) {
    if (typeof value !== "string" || value.length !== 64 || !HASH.test(value)) throw integrity();
    return value;
  }
  function clock() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) throw integrity();
    return new Date(value);
  }
  function email(value) {
    if (!text(value, 320) || value !== value.trim().toLowerCase()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) throw integrity();
    return value;
  }
  async function unique(name, filter, projection, session) {
    const rows = await db.collection(name).find(filter, { projection, ...(session ? { session } : {}) })
      .limit(2).toArray();
    if (rows.length > 1) throw integrity();
    return rows[0] ?? null;
  }
  function sessionRecord(row) {
    hex(row._id);
    if (!date(row.created_at) || !date(row.expires_at) || !isValidSessionToken(row.csrf_token)) throw integrity();
    const lifetime = row.expires_at.getTime() - row.created_at.getTime();
    if (lifetime <= 0 || lifetime > SESSION_TTL_MS) throw integrity();
    return {
      tokenHash: hash(row.token_hash), userId: hex(row.user_id), csrfToken: row.csrf_token,
      createdAt: new Date(row.created_at), expiresAt: new Date(row.expires_at),
    };
  }
  async function transaction(run) {
    const session = client.startSession();
    try {
      return await session.withTransaction(() => run(session), {
        readConcern: { level: "snapshot" }, writeConcern: { w: "majority" },
        readPreference: "primary", maxCommitTimeMS: 5000, timeoutMS: 10_000,
      });
    } finally { await session.endSession(); }
  }
  const sessionProjection = {
    _id: 1, user_id: 1, token_hash: 1, csrf_token: 1, created_at: 1, expires_at: 1,
  };

  return Object.freeze({
    async findCredentialByEmail(value) {
      const normalized = email(value);
      const user = await unique("user", { email: normalized }, { _id: 1, email: 1 });
      if (!user) return null;
      const userId = hex(user._id);
      if (user.email !== normalized) throw integrity();
      const account = await unique("account", { userId: id(userId), providerId: "credential" }, {
        _id: 1, userId: 1, providerId: 1, accountId: 1, password: 1,
      });
      if (!account) return null;
      hex(account._id);
      if (hex(account.userId) !== userId || account.providerId !== "credential"
        || account.accountId !== userId) throw integrity();
      return typeof account.password === "string" ? { userId, passwordHash: account.password } : null;
    },

    async findUserById(value) {
      const userId = id(value);
      const user = await unique("user", { _id: userId }, { _id: 1, email: 1 });
      if (!user) return null;
      if (hex(user._id) !== value) throw integrity();
      const profile = await unique("profiles", { _id: userId }, { _id: 1, display_name: 1 });
      if (!profile || hex(profile._id) !== value || !text(profile.display_name, 120)) throw integrity();
      return { id: value, email: email(user.email), displayName: profile.display_name };
    },

    async listRoles(value) {
      const rows = await db.collection("user_roles").find({ user_id: id(value) }, {
        projection: { _id: 0, user_id: 1, role: 1, scope: 1 },
      }).limit(101).toArray();
      if (rows.length > 100) throw integrity();
      const seen = new Set();
      return rows.map((row) => {
        if (hex(row.user_id) !== value || !roleNames.has(row.role)
          || !(row.scope === null || text(row.scope, 64))) throw integrity();
        const key = JSON.stringify([row.role, row.scope]);
        if (seen.has(key)) throw integrity();
        seen.add(key);
        return { role: row.role, scope: row.scope };
      });
    },

    async createSession(record) {
      if (!record || typeof record !== "object" || Array.isArray(record)
        || Object.keys(record).sort().join(",") !== "createdAt,csrfToken,expiresAt,tokenHash,userId") {
        throw integrity();
      }
      // Allocate IDs and timestamps once, outside the driver's retry callback.
      const row = {
        _id: new ObjectId(), user_id: id(record.userId), token_hash: hash(record.tokenHash),
        csrf_token: record.csrfToken, created_at: record.createdAt, expires_at: record.expiresAt,
      };
      const validated = sessionRecord(row);
      row.created_at = validated.createdAt;
      row.expires_at = validated.expiresAt;
      const timestamp = clock();
      if (row.created_at > timestamp || row.expires_at <= timestamp) throw integrity();
      const event = {
        _id: new ObjectId(), actor_id: row.user_id, action: "auth.session.created",
        entity_type: "app_sessions", entity_id: row._id,
        metadata: { expires_at: row.expires_at.toISOString() }, created_at: timestamp,
      };
      await transaction(async (session) => {
        const user = await unique("user", { _id: row.user_id }, { _id: 1 }, session);
        if (!user || hex(user._id) !== validated.userId) throw integrity();
        await db.collection("app_sessions").insertOne(row, { session });
        await db.collection("audit_events").insertOne(event, { session });
      });
    },

    async findSessionByHash(value) {
      const tokenHash = hash(value);
      const timestamp = clock();
      const row = await unique("app_sessions", {
        token_hash: tokenHash, expires_at: { $gt: timestamp },
      }, sessionProjection);
      if (!row) return null;
      const record = sessionRecord(row);
      if (record.tokenHash !== tokenHash) throw integrity();
      return record.expiresAt > timestamp ? record : null;
    },

    async deleteSessionByHash(value) {
      const tokenHash = hash(value);
      const eventId = new ObjectId();
      const timestamp = clock();
      return transaction(async (session) => {
        const row = await unique("app_sessions", { token_hash: tokenHash }, sessionProjection, session);
        if (!row) return false;
        const record = sessionRecord(row);
        if (record.tokenHash !== tokenHash) throw integrity();
        const result = await db.collection("app_sessions").deleteOne({ _id: row._id, token_hash: tokenHash }, { session });
        if (result.deletedCount !== 1) throw integrity();
        await db.collection("audit_events").insertOne({
          _id: eventId, actor_id: row.user_id, action: "auth.session.deleted",
          entity_type: "app_sessions", entity_id: row._id, metadata: {}, created_at: timestamp,
        }, { session });
        return true;
      });
    },
  });
}
