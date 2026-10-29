import { SESSION_TTL_MS } from "../auth/session.js";
import { buildValidator } from "./schema.js";

// Additive definition only: do not append to the legacy collection/index arrays.
export const APP_SESSIONS_SPEC = {
  name: "app_sessions",
  properties: {
    _id: { bsonType: "objectId" },
    user_id: { bsonType: "objectId" },
    token_hash: {
      bsonType: "string", minLength: 64, maxLength: 64,
      pattern: "^[0-9a-f]{64}$",
    },
    csrf_token: {
      bsonType: "string", minLength: 43, maxLength: 43,
      // Encoding 32 bytes leaves two unused bits in the final base64url digit.
      pattern: "^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$",
    },
    created_at: { bsonType: "date" },
    expires_at: { bsonType: "date" },
  },
  required: ["_id", "user_id", "token_hash", "csrf_token", "created_at", "expires_at"],
  expr: {
    // Guard arithmetic explicitly: MongoDB need not short-circuit $and clauses.
    $cond: [
      { $and: [
        { $eq: [{ $type: "$created_at" }, "date"] },
        { $eq: [{ $type: "$expires_at" }, "date"] },
      ] },
      { $and: [
        { $gt: ["$expires_at", "$created_at"] },
        { $lte: [{ $subtract: ["$expires_at", "$created_at"] }, SESSION_TTL_MS] },
      ] },
      false,
    ],
  },
  indexes: [
    { key: { token_hash: 1 }, name: "app_sessions_token_hash_uq", unique: true },
    { key: { user_id: 1 }, name: "app_sessions_user_idx" },
    { key: { expires_at: 1 }, name: "app_sessions_expires_ttl", expireAfterSeconds: 0 },
  ],
};

export const APP_SESSIONS_VALIDATOR = buildValidator(APP_SESSIONS_SPEC);
